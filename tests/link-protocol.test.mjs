import test from 'node:test';
import assert from 'node:assert/strict';
import {TransferReceiver,sendTransfer,digest,MAX_FILE,cleanName} from '../src/link-protocol.mjs';
test('Bluetooth transfer reconstructs multiple chunks and checks their SHA-256',async()=>{
 const bytes=crypto.getRandomValues(new Uint8Array(60000));const messages=[];await sendTransfer(async m=>messages.push(m),{name:'../meeting.pdf',blob:new Blob([bytes],{type:'application/pdf'})});
 const receiver=new TransferReceiver();let result;for(const message of messages)result=await receiver.accept(message);
 assert.equal(result.name,'meeting.pdf');assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),bytes);assert.equal(result.blob.type,'application/pdf');
});
test('Bluetooth receiver rejects oversized files, out-of-order chunks, corruption, and incomplete files',async()=>{
 const begin={type:'begin',id:'test',name:'test.json',size:3,sha256:await digest(new Uint8Array([1,2,3])),kind:'board'};
 const receiver=new TransferReceiver();await assert.rejects(()=>receiver.accept({...begin,size:MAX_FILE+1}));await receiver.accept(begin);
 await assert.rejects(()=>receiver.accept({type:'chunk',id:'test',seq:1,data:'AQID'}));receiver.reset();await receiver.accept(begin);
 await assert.rejects(()=>receiver.accept({type:'end',id:'test'}));receiver.reset();await receiver.accept(begin);
 await receiver.accept({type:'chunk',id:'test',seq:0,data:'AAAA'});await assert.rejects(()=>receiver.accept({type:'end',id:'test'}),/integrity/);
});
test('Bluetooth receiver bounds frames, filenames, and parallel transfers',async()=>{
 const receiver=new TransferReceiver();const begin={type:'begin',id:'test',name:'a',size:0,sha256:await digest(new Uint8Array()),kind:'file'};await receiver.accept(begin);await assert.rejects(()=>receiver.accept(begin),/current transfer/);
 assert.equal(cleanName('C:\\folder\\file.pdf'),'file.pdf');assert.ok(!cleanName('bad<name>\u0000.pdf').includes('<'));assert.equal((await receiver.accept({type:'end',id:'test'})).blob.size,0);
});
