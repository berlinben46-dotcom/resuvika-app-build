export const MAX_FILE=25*1024*1024;
export const CHUNK=24*1024;
export const cleanName=value=>String(value||'Omniball-file').split(/[\\/]/).at(-1).replace(/[\x00-\x1f<>:"|?*]/g,'_').slice(0,180).replace(/[. ]+$/,'')||'Omniball-file';
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function sendTransfer(send,{name,blob,kind='file'},progress=()=>{}){
  if(blob.size>MAX_FILE)throw new Error('Transfers must be smaller than 25 MB.');
  const bytes=new Uint8Array(await blob.arrayBuffer()),id=crypto.randomUUID();
  await send({type:'begin',id,name:cleanName(name),size:bytes.length,sha256:await digest(bytes),mime:blob.type,kind});
  for(let offset=0,seq=0;offset<bytes.length;offset+=CHUNK,seq++){
    const chunk=bytes.subarray(offset,offset+CHUNK);let binary='';for(let i=0;i<chunk.length;i++)binary+=String.fromCharCode(chunk[i]);
    await send({type:'chunk',id,seq,data:btoa(binary)});progress(Math.min(100,Math.round((offset+chunk.length)/bytes.length*100)));
  }
  await send({type:'end',id});return id;
}
export class TransferReceiver {
  current=null;
  reset(){this.current=null;}
  async accept(message){
    if(!message||typeof message!=='object')throw new Error('Invalid device message.');
    const now=Date.now();if(this.current&&now-this.current.updated>120000)this.reset();
    if(message.type==='begin'){
      if(this.current)throw new Error('Finish the current transfer first.');
      if(!/^[\w-]{1,64}$/.test(message.id||'')||!Number.isSafeInteger(message.size)||message.size<0||message.size>MAX_FILE||!/^[a-f0-9]{64}$/.test(message.sha256||'')||!['file','board','live'].includes(message.kind))throw new Error('Unsupported transfer.');
      this.current={...message,name:cleanName(message.name),mime:typeof message.mime==='string'?message.mime.slice(0,100):'',chunks:[],received:0,seq:0,updated:now};return;
    }
    const pending=this.current;if(!pending||message.id!==pending.id)throw new Error('Transfer interrupted. Send the file again.');
    pending.updated=now;
    if(message.type==='chunk'){
      if(message.seq!==pending.seq||typeof message.data!=='string'||message.data.length>CHUNK*4/3||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.data))throw new Error('Invalid transfer chunk.');
      const bytes=Uint8Array.from(atob(message.data),c=>c.charCodeAt(0));if(!bytes.length||bytes.length!==Math.min(CHUNK,pending.size-pending.received))throw new Error('Invalid transfer chunk length.');pending.received+=bytes.length;if(pending.received>pending.size)throw new Error('Transfer is larger than expected.');pending.chunks.push(bytes);pending.seq++;return;
    }
    if(message.type!=='end'||pending.received!==pending.size)throw new Error('File was not completely received.');
    this.reset();const blob=new Blob(pending.chunks,{type:pending.mime});if(await digest(await blob.arrayBuffer())!==pending.sha256)throw new Error('File integrity check failed. Send it again.');
    return {id:pending.id,name:pending.name,blob,kind:pending.kind};
  }
}
