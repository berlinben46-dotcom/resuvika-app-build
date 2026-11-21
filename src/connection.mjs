import { Capacitor, registerPlugin } from '@capacitor/core';
import { node, action } from './workspace.mjs';
import { sendTransfer, TransferReceiver } from './link-protocol.mjs';
import { validateDocument } from './storage.mjs';
import { base64 } from './documents.mjs';
import { saveIncoming, listIncoming } from './inbox.mjs';
const DeviceLink=registerPlugin('DeviceLink');
export function initConnection(actions){
  const android=Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
  let state={connected:false,detail:'No device connected'},live=false,busy=false,dirty=false,liveTimer,incoming=null,remoteBoard=null,receiveChain=Promise.resolve(),preview=null;
  const receiver=new TransferReceiver();
  const acknowledgements=new Map();
  const send=message=>DeviceLink.send({message});
  const statusText=()=>state.connected?`Connected to ${state.name||'device'}`:state.detail;
  function updateStatus(){document.querySelectorAll('.device-link-status').forEach(n=>n.textContent=statusText());const check=document.getElementById('live-drawing');if(check){check.checked=live;check.disabled=!state.connected;}document.querySelectorAll('[data-requires-link]').forEach(b=>b.disabled=!state.connected||busy);}
  async function sendBlob(name,blob,kind='file'){
    if(!state.connected)throw new Error('Connect to a paired device from Connect first.');if(busy)throw new Error('Wait for the current transfer to finish.');
    busy=true;updateStatus();
    let acknowledgement,id,timeout;
    try{
      id=await sendTransfer(async message=>{if(message.type==='begin'){acknowledgement=new Promise(resolve=>acknowledgements.set(message.id,resolve));id=message.id;}await send(message);},{name,blob,kind},percent=>{document.querySelectorAll('.device-link-status').forEach(n=>n.textContent=`Sending ${percent}%…`);});
      const received=await Promise.race([acknowledgement,new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),30000);})]);
      if(!received)throw new Error('The other device did not confirm receipt. Reconnect and send the file again.');
      if(kind!=='live')window.showToast('The connected device confirmed receipt.');
    }
    finally{clearTimeout(timeout);acknowledgements.delete(id);busy=false;updateStatus();if(dirty&&live)scheduleLive();}
  }
  const sendBoard=()=>sendBlob('Omniball-board.json',new Blob([JSON.stringify(actions.snapshot())],{type:'application/json'}),'board');
  function scheduleLive(){dirty=true;clearTimeout(liveTimer);liveTimer=setTimeout(async()=>{if(!live||!state.connected)return;if(busy)return;dirty=false;try{await sendBlob('Omniball-live.json',new Blob([JSON.stringify(actions.snapshot())],{type:'application/json'}),'live');}catch(e){live=false;updateStatus();actions.report(e);}},350);}
  window.addEventListener('boardchanged',()=>{if(live)scheduleLive();});
  function renderRemote(){
    const canvas=document.getElementById('remote-board-preview');if(!canvas)return;const board=remoteBoard||{width:window.drawingCanvas.width,height:window.drawingCanvas.height,background:'whiteboard',elements:[]};
    const scale=Math.min(640/board.width,420/board.height);canvas.width=Math.round(board.width*scale);canvas.height=Math.round(board.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle=board.background==='blackboard'?'#0f172a':board.background==='chalkboard'?'#143b2f':'#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(scale,scale);for(const element of board.elements)window.drawingCanvas.renderElement(ctx,element);if(preview)window.drawingCanvas.renderElement(ctx,preview);
  }
  // Send small, throttled in-progress ink frames in addition to verified board snapshots.
  let lastPreview=0,previewChain=Promise.resolve();
  window.addEventListener('omniball-ink',e=>{if(!live||!state.connected||busy)return;const now=performance.now();if(e.detail.type==='point'&&now-lastPreview<35)return;lastPreview=now;const payload={type:'preview',ink:e.detail,dimensions:{width:window.drawingCanvas.width,height:window.drawingCanvas.height}};if(JSON.stringify(payload).length>50000)return;previewChain=previewChain.then(()=>send(payload)).catch(()=>{});});
  function card(main,title,description){const c=node('section',null,'connection-card');c.append(node('h2',title),node('p',description));main.append(c);return c;}
  async function show(main){
    main.append(node('div','BETTER TOGETHER','eyebrow'),node('h1','Make a connection'),node('p','Send a thought across. Draw something together. Keep your devices in the same creative flow.','page-intro'));
    if(android){
      const tvCast=card(main,'Wireless TV Mirror (Smart View / Cast)','Mirror your whiteboard and notes directly to any Smart TV on your Wi-Fi — no IP address or browser link needed.');
      tvCast.append(action('Cast Screen to Smart TV',()=>registerPlugin('FloatingOverlay').openCastSettings(),'primary'));
    }
    const bluetooth=card(main,'Bluetooth nearby','Pair your devices in Android settings first. Start the Omniball companion on your Windows laptop, or tap Receive on another Android device. Keep Omniball open during a session.');
    const status=node('p',statusText(),'device-link-status connection-status');status.setAttribute('role','status');bluetooth.append(status);
    if(!android){bluetooth.append(node('p','Bluetooth is available in the installed Android app. Emulators may not expose Bluetooth hardware. Use Wi-Fi pairing or system sharing here.'));}
    else{
      const current=await DeviceLink.status();state={...state,...current};
      if(!main.isConnected)return;
      if(!current.available)bluetooth.append(node('p','This device does not expose Bluetooth hardware. Try a physical Android phone.'));
      else{
        bluetooth.append(action('Pair in Android settings',()=>DeviceLink.settings()),action('Choose paired device',async()=>{await DeviceLink.authorize();const {devices}=await DeviceLink.paired();const b=actions.sheet('Paired devices');b.append(node('p','Select a device running the Omniball companion. Pairing alone does not start a drawing or file-transfer service.'));for(const device of devices)b.append(action(device.name,async()=>{await DeviceLink.connect({address:device.address});await actions.workspace.show('connect');},'primary'));if(!devices.length)b.append(node('p','No paired devices yet. Pair in Android settings, then return and refresh.'));}),action('Receive from Android',async()=>{await DeviceLink.authorize();await DeviceLink.listen();updateStatus();}),action('Disconnect',()=>DeviceLink.disconnect()));
      }
    }
    const tools=card(main,'A shared workspace','Send a complete board, including notes, or stream your drawing to the connected device. Received boards open only when you choose; your current work gets a recovery copy.');
    const sendButton=action('Send board & notes',sendBoard,'primary');sendButton.dataset.requiresLink='true';tools.append(sendButton);
    const label=node('label');const check=node('input');check.type='checkbox';check.id='live-drawing';check.checked=live;check.disabled=!state.connected;check.onchange=()=>{live=check.checked;if(live)scheduleLive();};label.append(check,node('span','Live drawing to connected device'));tools.append(label);
    const remote=node('canvas');remote.id='remote-board-preview';remote.setAttribute('aria-label','Incoming live drawing preview. Received boards can also be opened as an accessible note.');remote.style.cssText='display:block;max-width:100%;border:1px solid #dce5df;border-radius:12px;margin:16px auto';tools.append(remote);
    if(remoteBoard)tools.append(action('Open received live board',()=>actions.receiveBoard(remoteBoard)));
    const received=card(main,'Received files','Files received from a paired device are kept privately on this device. Save a backup before uninstalling.');
    const inbox=await listIncoming();
    if(!main.isConnected)return;
    if(!inbox.length)received.append(node('p','Your next idea could arrive from anywhere. Received files will appear here.'));
    for(const item of inbox){const row=node('div',null,'received-file');row.append(node('p',item.name),action(item.kind==='board'?'Open received board':'Save received file',async()=>{if(item.kind==='board')await actions.receiveBoard(validateDocument(await item.blob.text()));else if(item.blob.type==='application/pdf')await actions.documents.importBlob(item.name,item.blob);else await actions.shareFile(item.name,await base64(item.blob),item.blob.type,true);},'primary'));received.append(row);}
    const share=card(main,'Share your way','Send an image or board backup using Android’s share menu. Compatible apps such as Quick Share can send it cleanly to any nearby laptop or phone.');share.append(action('Share board backup',actions.exportBackup),action('Share board image',actions.exportPng));
    updateStatus();renderRemote();
  }
  if(android){
    DeviceLink.addListener('state',event=>{state={...state,name:event.name,connected:event.state==='connected',detail:event.detail};if(!state.connected){live=false;dirty=false;clearTimeout(liveTimer);receiver.reset();for(const resolve of acknowledgements.values())resolve(false);}updateStatus();}).catch(actions.report);
    DeviceLink.addListener('message',event=>{receiveChain=receiveChain.then(async()=>{
      const message=event.message;
      if(message.type==='hello')return;
      if(message.type==='received'){acknowledgements.get(message.id)?.(true);return;}
      if(message.type==='preview'){
        const ink=message.ink;
        if(ink?.type==='start'||ink?.type==='shape'){const stroke=ink.value;validateDocument({format:'resuvika-mobile-board',version:1,width:message.dimensions?.width,height:message.dimensions?.height,background:'whiteboard',elements:[stroke]});preview=structuredClone(stroke);}
        else if(ink?.type==='point'&&preview?.points&&Number.isFinite(ink.value?.x)&&Number.isFinite(ink.value?.y)&&preview.points.length<100000)preview.points.push(ink.value);
        else if(ink?.type==='end')preview=null;
        renderRemote();return;
      }
      const item=await receiver.accept(message);if(!item)return;
      if(item.kind==='live'){remoteBoard=validateDocument(await item.blob.text());preview=null;renderRemote();}
      else{await saveIncoming(item);incoming=item;window.showToast(`Received ${item.name}. Saved in Connect.`,5000);if(actions.workspace.getView()==='connect')await actions.workspace.show('connect');}
      await send({type:'received',id:item.id});
    }).catch(e=>{receiver.reset();actions.report(e);});}).catch(actions.report);
  }
  return {show,sendFile:(name,blob)=>sendBlob(name,blob),sendBoard,getState:()=>({...state})};
}
