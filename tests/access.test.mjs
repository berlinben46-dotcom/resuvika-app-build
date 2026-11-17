import test from 'node:test';
import assert from 'node:assert/strict';
import { trialState, entitlementActive, validatePairingLink, DAY } from '../src/access.mjs';
import { validateDocument } from '../src/storage.mjs';
const now = 1800000000000;
test('seven-day trial starts without billing and ends exactly at seven days', () => {
  const first=trialState(null,now);assert.equal(first.active,true);assert.equal(first.daysLeft,7);
  assert.equal(trialState(first.record,now+7*DAY-1).active,true);
  assert.equal(trialState(first.record,now+7*DAY).active,false);
});
test('trial does not restart on relaunch or significant clock rollback',()=>{
  const first=trialState(null,now);const later=trialState(first.record,now+5*DAY);
  assert.equal(later.record.firstLaunch,now);assert.equal(later.daysLeft,2);
  const rollback=trialState(later.record,now);assert.equal(rollback.active,false);assert.equal(rollback.clockChanged,true);
});
test('paid access needs active store entitlement, not a license string or local boolean',()=>{
  assert.equal(entitlementActive({pro:true}),false);
  assert.equal(entitlementActive({license:'ROM2.fake'}),false);
  const info={entitlements:{active:{pro:{isActive:true,expirationDate:new Date(now+DAY).toISOString()}}}};
  assert.equal(entitlementActive(info,'pro',now),true);assert.equal(entitlementActive(info,'pro',now+2*DAY),false);
  info.entitlements.active.pro.expirationDate=null;assert.equal(entitlementActive(info,'pro',now),true);
  info.entitlements.active.pro.isActive=false;assert.equal(entitlementActive(info,'pro',now),false);
  info.entitlements.active.pro.isActive=true;info.entitlements.verification='FAILED';assert.equal(entitlementActive(info,'pro',now),false);
});
test('pairing uses only token-bearing LAN URLs and never native remote bridge navigation',()=>{
  const token='a'.repeat(32);assert.equal(validatePairingLink(`http://192.168.1.8:8080/ipad.html?token=${token}`),`http://192.168.1.8:8080/ipad.html?token=${token}`);
  for(const value of [`javascript:alert(1)`,`https://evil.example/ipad.html?token=${token}`,`http://127.0.0.1/ipad.html?token=${token}`,`http://10.1.1.2/index.html?token=${token}`,`http://10.0.0.1/ipad.html`,`http://me:pass@10.0.0.1/ipad.html?token=${token}`])assert.throws(()=>validatePairingLink(value));
});
test('board backup validation preserves strokes and rejects malformed/oversized input',()=>{
  const doc={format:'resuvika-mobile-board',version:1,width:800,height:1200,background:'whiteboard',elements:[{type:'stroke',points:[{x:2,y:3}],color:'#111',size:4}]};
  assert.equal(validateDocument(doc),doc);
  assert.equal(validateDocument({...doc,elements:[{type:'sticky',x:120,y:120,width:260,height:180,text:'Class notes',bg:'#ffff00'}]}).elements[0].type,'sticky');
  assert.throws(()=>validateDocument({...doc,elements:[{type:'stroke',color:'#111',size:4}]}));
  assert.throws(()=>validateDocument({...doc,width:1}));assert.throws(()=>validateDocument({...doc,elements:[{type:'image',src:'javascript:bad'}]}));assert.throws(()=>validateDocument({...doc,elements:[{type:'stroke',points:[{x:null,y:2}]}]}));
});
