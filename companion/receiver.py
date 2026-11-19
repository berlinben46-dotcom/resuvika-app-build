"""Omniball Windows Bluetooth companion. Python 3.11+, standard library only.

Run python receiver.py, open the printed local URL, then connect from Android.
No cloud, account, firewall rule, or external Python package is required.
"""
from __future__ import annotations
import argparse
import base64
import ctypes as C
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import socket
import struct
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

SERVICE = '7b219e32-4f70-4d40-94b1-06ef572a4011'
MAX_FILE = 25 * 1024 * 1024
MAX_FRAME = 65536

def clean_name(name):
    name = re.sub(r'[\x00-\x1f<>:"|?*]', '_', str(name).replace('\\', '/').split('/')[-1])[:180]
    name = name.strip(' .') or 'Omniball-file'
    if name.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]}:
        name = '_' + name
    return name

def validate_board(value):
    if not isinstance(value, dict) or value.get('format') != 'resuvika-mobile-board' or value.get('version') != 1:
        raise ValueError('Unsupported board')
    if any(not isinstance(value.get(k), (int,float)) or not 100 <= value[k] <= 10000 for k in ('width','height')):
        raise ValueError('Invalid board size')
    if not isinstance(value.get('elements'),list) or len(value['elements']) > 30000:
        raise ValueError('Invalid board elements')
    if value.get('background') not in ('whiteboard','blackboard','chalkboard','grid'):
        raise ValueError('Invalid background')
    return value

class Receiver:
    def __init__(self, output):
        self.output = Path(output)
        self.output.mkdir(parents=True, exist_ok=True)
        self.pending = None
        self.state = {'status':'Waiting for a phone', 'connected':False, 'board':None, 'preview':None, 'files':[]}
        self.lock = threading.Lock()
        self.write_lock = threading.Lock()
        self.transfer_lock = threading.Lock()
        self.client = None
        self.acknowledgements = {}

    def send_frame(self, message):
        with self.write_lock:
            if self.client is None:
                raise OSError('Connect a phone first')
            self.client.sendall((json.dumps(message,ensure_ascii=True)+'\n').encode())

    def send_file(self, name, mime, data):
        if len(data)>MAX_FILE:
            raise ValueError('Files must be smaller than 25 MB')
        if not self.transfer_lock.acquire(blocking=False):
            raise ValueError('Wait for the current transfer to finish')
        transfer_id=str(uuid.uuid4());ack=threading.Event()
        try:
            with self.lock:
                self.acknowledgements[transfer_id]=ack
            kind='file'
            if name.lower().endswith('.json'):
                try:
                    validate_board(json.loads(data));kind='board'
                except (ValueError,TypeError,UnicodeError):
                    pass
            self.send_frame(dict(type='begin',id=transfer_id,name=clean_name(name),mime=mime[:100],size=len(data),kind=kind,sha256=hashlib.sha256(data).hexdigest()))
            for seq,offset in enumerate(range(0,len(data),24576)):
                self.send_frame(dict(type='chunk',id=transfer_id,seq=seq,data=base64.b64encode(data[offset:offset+24576]).decode()))
            self.send_frame(dict(type='end',id=transfer_id))
            if not ack.wait(30):
                raise OSError('The phone did not confirm receipt. Reconnect and retry.')
        finally:
            with self.lock:
                self.acknowledgements.pop(transfer_id,None)
            self.transfer_lock.release()

    def accept(self, message):
        if not isinstance(message,dict):
            raise ValueError('Invalid frame')
        kind = message.get('type')
        if kind == 'received':
            with self.lock:
                acknowledgement=self.acknowledgements.get(message.get('id'))
                if acknowledgement:
                    acknowledgement.set()
            return None
        if kind == 'hello':
            return None
        if kind == 'preview':
            ink=message.get('ink',{})
            with self.lock:
                if ink.get('type') in ('start','shape'):
                    value=ink.get('value')
                    if not isinstance(value,dict) or value.get('type') not in ('stroke','shape'):
                        raise ValueError('Invalid preview')
                    self.state['preview']={'element':value,'dimensions':message.get('dimensions')}
                elif ink.get('type') == 'point':
                    current=self.state.get('preview')
                    if current and isinstance(current['element'].get('points'),list) and len(current['element']['points']) < 100000:
                        current['element']['points'].append(ink.get('value'))
                elif ink.get('type') == 'end':
                    self.state['preview']=None
            return None
        if self.pending and time.monotonic()-self.pending['updated'] > 120:
            self.pending=None
        if kind == 'begin':
            if self.pending:
                raise ValueError('Transfer already in progress')
            size=message.get('size')
            if type(size) is not int or not 0 <= size <= MAX_FILE or not re.fullmatch('[a-f0-9]{64}',message.get('sha256','')):
                raise ValueError('Invalid transfer size or digest')
            if not re.fullmatch(r'[\w-]{1,64}',message.get('id','')) or message.get('kind') not in ('file','board','live'):
                raise ValueError('Invalid transfer type')
            self.pending={**message,'data':bytearray(),'seq':0,'updated':time.monotonic()}
            return None
        pending=self.pending
        if not pending or message.get('id') != pending['id']:
            raise ValueError('Transfer was interrupted')
        pending['updated']=time.monotonic()
        if kind == 'chunk':
            if message.get('seq') != pending['seq'] or not isinstance(message.get('data'),str) or len(message['data']) > 32768:
                raise ValueError('Invalid chunk order or length')
            chunk=base64.b64decode(message['data'], validate=True)
            if not chunk or len(chunk) != min(24576,pending['size']-len(pending['data'])):
                raise ValueError('Invalid chunk size')
            if len(pending['data'])+len(chunk) > pending['size']:
                raise ValueError('Transfer exceeds declared size')
            pending['data'].extend(chunk)
            pending['seq']+=1
            return None
        if kind != 'end':
            raise ValueError('Invalid transfer frame')
        self.pending=None
        data=bytes(pending['data'])
        if len(data) != pending['size'] or hashlib.sha256(data).hexdigest() != pending['sha256']:
            raise ValueError('Incomplete or corrupted file')
        if pending['kind'] in ('board','live'):
            board=validate_board(json.loads(data))
            with self.lock:
                self.state['board']=board
                self.state['preview']=None
        if pending['kind'] != 'live':
            name=clean_name(pending.get('name','Omniball-file'))
            # Exclusive create prevents overwriting an existing file or following a symlink.
            for index in range(10000):
                candidate=self.output / (name if index == 0 else f'{Path(name).stem}-{index}{Path(name).suffix}')
                try:
                    with candidate.open('xb') as stream:
                        stream.write(data)
                    break
                except FileExistsError:
                    continue
            else:
                raise ValueError('Too many files with this name')
            with self.lock:
                self.state['files'].insert(0,{'name':candidate.name,'bytes':len(data)})
                self.state['files']=self.state['files'][:100]
        return {'type':'received','id':pending['id']}

def advertise_windows(server):
    """Register an RFCOMM service via Windows' Bluetooth SDP namespace."""
    class GUID(C.Structure):
        _fields_=[('Data1',C.c_uint32),('Data2',C.c_uint16),('Data3',C.c_uint16),('Data4',C.c_ubyte*8)]
    class SOCKET_ADDRESS(C.Structure):
        _fields_=[('lpSockaddr',C.c_void_p),('iSockaddrLength',C.c_int)]
    class CSADDR_INFO(C.Structure):
        _fields_=[('LocalAddr',SOCKET_ADDRESS),('RemoteAddr',SOCKET_ADDRESS),('iSocketType',C.c_int),('iProtocol',C.c_int)]
    class QUERY(C.Structure):
        _fields_=[('dwSize',C.c_uint32),('lpszServiceInstanceName',C.c_wchar_p),('lpServiceClassId',C.POINTER(GUID)),('lpVersion',C.c_void_p),('lpszComment',C.c_wchar_p),('dwNameSpace',C.c_uint32),('lpNSProviderId',C.c_void_p),('lpszContext',C.c_wchar_p),('dwNumberOfProtocols',C.c_uint32),('lpafpProtocols',C.c_void_p),('lpszQueryString',C.c_wchar_p),('dwNumberOfCsAddrs',C.c_uint32),('lpcsaBuffer',C.POINTER(CSADDR_INFO)),('dwOutputFlags',C.c_uint32),('lpBlob',C.c_void_p)]
    ws=C.WinDLL('Ws2_32.dll',use_last_error=True)
    ws.getsockname.argtypes=[C.c_size_t,C.c_void_p,C.POINTER(C.c_int)]
    ws.WSASetServiceW.argtypes=[C.POINTER(QUERY),C.c_int,C.c_uint32]
    address=C.create_string_buffer(64)
    length=C.c_int(64)
    if ws.getsockname(server.fileno(),address,C.byref(length)):
        raise OSError(ws.WSAGetLastError(),'Could not read Bluetooth socket address')
    guid=GUID.from_buffer_copy(uuid.UUID(SERVICE).bytes_le)
    info=CSADDR_INFO(SOCKET_ADDRESS(C.cast(address,C.c_void_p),length.value),SOCKET_ADDRESS(),socket.SOCK_STREAM,3)
    query=QUERY();query.dwSize=C.sizeof(query);query.lpszServiceInstanceName='Resuvika Omniball';query.lpServiceClassId=C.pointer(guid);query.dwNameSpace=16;query.dwNumberOfCsAddrs=1;query.lpcsaBuffer=C.pointer(info)
    if ws.WSASetServiceW(C.byref(query),0,0):
        raise OSError(ws.WSAGetLastError(),'Could not advertise the Omniball Bluetooth service')
    # Keep the native structures alive for deregistration.
    def unregister():
        ws.WSASetServiceW(C.byref(query),2,0)
    return unregister

def run_bluetooth(receiver, stop):
    server=None
    unregister=None
    try:
        if os.name != 'nt' or not hasattr(socket,'AF_BLUETOOTH'):
            raise RuntimeError('Use Windows with Python 3.11+ and a Bluetooth adapter. The viewer still works in demo mode.')
        server=socket.socket(socket.AF_BLUETOOTH,socket.SOCK_STREAM,socket.BTPROTO_RFCOMM)
        # SO_BTH_AUTHENTICATE: require an authenticated, paired Bluetooth link.
        server.setsockopt(3,-2147483647,struct.pack('I',1))
        server.bind(('00:00:00:00:00:00',0));server.listen(1);server.settimeout(1)
        unregister=advertise_windows(server)
        with receiver.lock:
            receiver.state['status']='Ready. Pair this laptop in Android settings, then choose it in Omniball.'
        while not stop.is_set():
            try:
                client,address=server.accept()
            except socket.timeout:
                continue
            with client:
                client.settimeout(1);receiver.pending=None
                with receiver.lock:
                    receiver.client=client
                    receiver.state['connected']=True
                    receiver.state['status']='Phone connected. Enable live drawing or send a file from Omniball.'
                buffer=bytearray()
                try:
                    while not stop.is_set():
                        try:
                            block=client.recv(4096)
                        except socket.timeout:
                            continue
                        if not block:
                            break
                        buffer.extend(block)
                        while b'\n' in buffer:
                            line,_,rest=buffer.partition(b'\n');buffer=bytearray(rest)
                            if len(line)>MAX_FRAME:
                                raise ValueError('Frame too large')
                            if not line:
                                continue
                            reply=receiver.accept(json.loads(line))
                            if reply:
                                receiver.send_frame(reply)
                        if len(buffer)>MAX_FRAME:
                            raise ValueError('Frame too large')
                except (OSError,ValueError,TypeError,KeyError) as error:
                    print(f'Bluetooth session ended: {error}')
                finally:
                    receiver.pending=None
                    with receiver.lock:
                        receiver.client=None
                        receiver.state['connected']=False
                        receiver.state['status']='Disconnected. Reconnect from your phone.'
    except (OSError,RuntimeError) as error:
        with receiver.lock:
            receiver.state['status']=f'Bluetooth unavailable: {error}'
        print(receiver.state['status'])
    finally:
        if unregister:
            unregister()
        if server:
            server.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    default_output=(Path(sys.executable).parent/'Omniball_Received') if getattr(sys,'frozen',False) else Path(__file__).parent/'received'
    parser.add_argument('--output',type=Path,default=default_output)
    parser.add_argument('--demo',action='store_true',help='Run the local viewer without a Bluetooth adapter')
    args=parser.parse_args();receiver=Receiver(args.output);stop=threading.Event();token=secrets.token_urlsafe(24)
    if not args.demo:
        threading.Thread(target=run_bluetooth,args=(receiver,stop),daemon=True).start()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):
            pass  # Do not log the local session token.
        def do_GET(self):
            request=urlparse(self.path)
            supplied=parse_qs(request.query).get('token',[''])[0]
            if request.path != '/viewer.js' and not hmac.compare_digest(supplied,token):
                self.send_error(403);return
            if request.path=='/state':
                with receiver.lock:
                    body=json.dumps(receiver.state,ensure_ascii=True).encode()
                mime='application/json'
            elif request.path in ('/','/viewer.js'):
                body=(Path(__file__).parent/('viewer.html' if request.path=='/' else 'viewer.js')).read_bytes()
                mime='text/html; charset=utf-8' if request.path=='/' else 'text/javascript'
            else:
                self.send_error(404);return
            self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");self.end_headers();self.wfile.write(body)
        def do_POST(self):
            request=urlparse(self.path);query=parse_qs(request.query)
            if request.path!='/send' or not hmac.compare_digest(query.get('token',[''])[0],token):
                self.send_error(403);return
            try:
                length=int(self.headers.get('Content-Length','-1'))
                if not 0<=length<=MAX_FILE:
                    raise ValueError('Files must be smaller than 25 MB')
                data=self.rfile.read(length)
                if len(data)!=length:
                    raise ValueError('Upload was interrupted')
                receiver.send_file(query.get('name',['Omniball-file'])[0],self.headers.get('Content-Type','application/octet-stream'),data)
                body=json.dumps({'received':True}).encode();status=200
            except (ValueError,OSError) as error:
                body=json.dumps({'error':str(error)}).encode();status=400
            self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    print(f'Omniball companion: http://127.0.0.1:{server.server_port}/?token={token}',flush=True)
    print(f'Received files: {args.output.resolve()}',flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set();server.server_close()

if __name__=='__main__':
    main()
