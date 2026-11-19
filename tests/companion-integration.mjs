import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {sendTransfer,digest} from '../src/link-protocol.mjs';
const python=process.env.PYTHON_PATH||'python';
const bytes=new Uint8Array(70000).fill(173),messages=[];
await sendTransfer(async m=>messages.push(m),{name:'../interoperability.pdf',blob:new Blob([bytes],{type:'application/pdf'})});
const script=`import sys,json,tempfile,hashlib\nsys.path.insert(0,'companion')\nfrom receiver import Receiver\nwith tempfile.TemporaryDirectory() as folder:\n receiver=Receiver(folder)\n for line in sys.stdin:\n  result=receiver.accept(json.loads(line))\n from pathlib import Path\n data=(Path(folder)/'interoperability.pdf').read_bytes()\n print(json.dumps({'digest':hashlib.sha256(data).hexdigest(),'reply':result}))\n`;
const result=spawnSync(python,['-c',script],{input:messages.map(m=>JSON.stringify(m)).join('\n'),encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).digest,await digest(bytes));assert.equal(JSON.parse(result.stdout).reply.type,'received');
console.log('Android JavaScript transfer frames are accepted and verified by the Python companion.');
const companionExecutable=process.env.COMPANION_EXE;
const companionProcess=spawn(companionExecutable||python,[...(companionExecutable?[]:['companion/receiver.py']),'--demo','--output','verification/companion-received'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
let browser;
try{
 const url=await new Promise((resolve,reject)=>{let stdout='';const timer=setTimeout(()=>reject(Error('Companion startup timed out')),10000);companionProcess.stdout.on('data',chunk=>{stdout+=chunk;const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/);if(match){clearTimeout(timer);resolve(match[0]);}});companionProcess.on('error',reject);companionProcess.on('exit',code=>reject(Error(`Companion exited: ${code}`)));});
 const parsed=new URL(url);const denied=await fetch(parsed.origin+'/state');assert.equal(denied.status,403);assert.equal((await fetch(parsed.origin+'/send',{method:'POST',body:'test'})).status,403);const state=await fetch(parsed.origin+'/state'+parsed.search);assert.equal(state.status,200);
 browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>document.getElementById('status').textContent==='Waiting for a phone');assert.equal(await page.getByRole('button',{name:'Save board backup'}).isEnabled(),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:'verification/companion.png'});await fs.writeFile('verification/companion-results.json',JSON.stringify({crossLanguageTransfer:true,unauthorizedRequestRejected:true,viewerRendered:true,browserErrors:errors,bluetoothHardwareTested:false},null,2));console.log('Companion loopback authentication and browser viewer pass; Bluetooth radio is not tested.');
}finally{await browser?.close();if(process.platform==='win32')spawnSync('taskkill.exe',['/PID',String(companionProcess.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else companionProcess.kill();companionProcess.stdout.destroy();companionProcess.stderr.destroy();}
