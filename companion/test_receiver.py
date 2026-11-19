import base64
import hashlib
import json
from pathlib import Path
import tempfile
import socket
import threading
import unittest
from receiver import Receiver, clean_name

class ReceiverTests(unittest.TestCase):
    def transfer(self,receiver,data,name='../meeting.pdf',kind='file'):
        receiver.accept(dict(type='begin',id='test',name=name,size=len(data),sha256=hashlib.sha256(data).hexdigest(),kind=kind))
        for seq,offset in enumerate(range(0,len(data),24576)):
            receiver.accept(dict(type='chunk',id='test',seq=seq,data=base64.b64encode(data[offset:offset+24576]).decode()))
        return receiver.accept(dict(type='end',id='test'))
    def test_chunked_transfer_saved_and_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            receiver=Receiver(folder)
            data=bytes(range(256))*300
            self.assertEqual(self.transfer(receiver,data),{'type':'received','id':'test'})
            self.transfer(receiver,b'second')
            self.assertEqual((Path(folder)/'meeting.pdf').read_bytes(),data)
            self.assertEqual((Path(folder)/'meeting-1.pdf').read_bytes(),b'second')
    def test_live_board_does_not_create_files(self):
        with tempfile.TemporaryDirectory() as folder:
            receiver=Receiver(folder)
            board=dict(format='resuvika-mobile-board',version=1,width=500,height=700,elements=[],background='whiteboard')
            self.transfer(receiver,json.dumps(board).encode(),kind='live')
            self.assertEqual(receiver.state['board'],board)
            self.assertEqual(list(Path(folder).iterdir()),[])
    def test_invalid_order_corruption_and_size(self):
        with tempfile.TemporaryDirectory() as folder:
            receiver=Receiver(folder)
            begin=dict(type='begin',id='test',size=3,sha256=hashlib.sha256(b'abc').hexdigest(),kind='file')
            with self.assertRaises(ValueError):
                receiver.accept({**begin,'size':50*1024*1024})
            receiver.accept(begin)
            with self.assertRaises(ValueError):
                receiver.accept(dict(type='chunk',id='test',seq=3,data='YWJj'))
            receiver.pending=None;receiver.accept(begin)
            receiver.accept(dict(type='chunk',id='test',seq=0,data='AAAA'))
            with self.assertRaises(ValueError):
                receiver.accept(dict(type='end',id='test'))
            self.assertEqual(list(Path(folder).iterdir()),[])
    def test_path_and_windows_reserved_names(self):
        self.assertEqual(clean_name('C:\\private\\meeting.pdf'),'meeting.pdf')
        self.assertEqual(clean_name('CON.txt'),'_CON.txt')
        self.assertNotIn('/',clean_name('../../file.pdf'))
    def test_laptop_sends_file_and_waits_for_receiver_acknowledgement(self):
        with tempfile.TemporaryDirectory() as laptop_folder,tempfile.TemporaryDirectory() as phone_folder:
            laptop,phone=Receiver(laptop_folder),Receiver(phone_folder)
            left,right=socket.socketpair();laptop.client=left;phone.client=right
            def read_frames(receiver,connection):
                try:
                    for line in connection.makefile('rb'):
                        reply=receiver.accept(json.loads(line))
                        if reply:
                            receiver.send_frame(reply)
                except OSError:
                    pass
            threads=[threading.Thread(target=read_frames,args=(laptop,left),daemon=True),threading.Thread(target=read_frames,args=(phone,right),daemon=True)]
            for thread in threads:
                thread.start()
            try:
                laptop.send_file('from-laptop.pdf','application/pdf',b'%PDF-test'*8000)
                self.assertEqual((Path(phone_folder)/'from-laptop.pdf').read_bytes(),b'%PDF-test'*8000)
            finally:
                left.shutdown(socket.SHUT_RDWR);right.shutdown(socket.SHUT_RDWR);left.close();right.close()
                for thread in threads:
                    thread.join(timeout=2)

if __name__=='__main__':
    unittest.main()
