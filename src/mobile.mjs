import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Browser } from '@capacitor/browser';
import { Purchases, ENTITLEMENT_VERIFICATION_MODE } from '@revenuecat/purchases-capacitor';
import { trialState, entitlementActive, purchaseLabel, validatePairingLink } from './access.mjs';
import { snapshot, validateDocument, LIBRARY_KEY } from './storage.mjs';
import { initMobileShell, FloatingOverlay } from './shell.mjs';
import { registerPlugin } from '@capacitor/core';
import { initWorkspace } from './workspace.mjs';
import { initDocuments } from './documents.mjs';
import { initConnection } from './connection.mjs';
import { cleanName } from './link-protocol.mjs';

const config = __MOBILE_CONFIG__;
const native = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();
const TRIAL_KEY = 'resuvika_mobile_trial_v1';
const CURRENT_KEY = 'resuvika_mobile_current_v1';
let trial, customerInfo, configured = false, purchasing = false, packages = [], ready = false;
let currentTitle = 'My first board', library = [], autosaveTimer, currentSaved = '';
let saveChain = Promise.resolve();
let sheetRevision = 0;
let workspace, documents, connection, sheetOpener;
window.mobileCanEdit = () => ready;
const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const fileForKey=key=>key===CURRENT_KEY?'boards/current.json':'boards/library.json';
async function read(key) {
  if(!native)return localStorage.getItem(key);
  if(key===TRIAL_KEY)return (await Preferences.get({key})).value;
  try{return (await Filesystem.readFile({path:fileForKey(key),directory:Directory.Data,encoding:Encoding.UTF8})).data;}
  catch(error){if(error?.code==='OS-PLUG-FILE-0008'||error?.code==='ENOENT'||/not exist|not found/i.test(error?.message||''))return null;throw error;}
}
async function write(key,value) {
  if(!native){localStorage.setItem(key,value);return;}
  if(key===TRIAL_KEY){await Preferences.set({key,value});return;}
  await Filesystem.writeFile({path:fileForKey(key),data:value,directory:Directory.Data,encoding:Encoding.UTF8,recursive:true});
}
function parse(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function report(error) { console.error(error?.message || error); window.showToast(error?.message || 'The operation could not be completed.', 5000); }
function run(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(report); }
function button(text, handler, className) { const b = el('button', text, className); b.type = 'button'; b.addEventListener('click', run(handler)); return b; }
function closeSheet() { sheetRevision++; $('mobile-dialog').hidden = true; $('mobile-sheet').replaceChildren(); document.querySelectorAll('[data-modal-inert]').forEach(n=>{n.inert=false;delete n.dataset.modalInert;}); if(sheetOpener?.isConnected)sheetOpener.focus({preventScroll:true}); }
function sheet(title) {
  window.drawingCanvas.textEditor?.commit();
  if($('mobile-dialog').hidden)sheetOpener=document.activeElement;
  sheetRevision++;
  const dialog = $('mobile-dialog'); const body = $('mobile-sheet'); body.replaceChildren();
  const close=button('✕',closeSheet,'close-sheet');close.setAttribute('aria-label','Close dialog');
  const heading=el('h1',title);heading.id='mobile-sheet-title';
  body.append(close, el('div', 'YOUR OMNIBALL WORKSPACE', 'eyebrow'), heading);
  for(const n of document.body.children)if(n!==dialog&&n.id!=='toast'&&n.tagName!=='SCRIPT'&&!n.inert){n.inert=true;n.dataset.modalInert='true';}
  dialog.hidden = false; body.scrollTop = 0; requestAnimationFrame(() => body.querySelector('button')?.focus()); return body;
}
async function openExternal(url) {
  if (!/^https:\/\//.test(url || '')) throw new Error('This link will be available after the publisher completes store setup.');
  if (native) await Browser.open({ url }); else window.open(url, '_blank', 'noopener');
}
function updateAccess() {
  const paid = entitlementActive(customerInfo, config.entitlement);
  document.body.classList.toggle('pro-unlocked', Boolean(paid));
  document.body.classList.remove('read-only');
  if ($('mobile-pro')) $('mobile-pro').textContent = paid ? '✨ Ad-Free Pro' : '✨ Remove Ads';
  const adBanner = $('app-ad-banner');
  if (adBanner) adBanner.style.display = paid ? 'none' : 'flex';
  const rmvBtn = $('btn-remove-ads');
  if (rmvBtn) rmvBtn.style.display = paid ? 'none' : 'inline-flex';
  if ($('np-editor')) $('np-editor').readOnly = false;
  for (const id of ['btn-clear','btn-undo','btn-redo','np-stamp-to-canvas','np-add-tab']) {
    if ($(id)) $(id).disabled = false;
  }
  if(native&&platform==='android')syncOverlayAccess().catch(report);
}
async function syncOverlayAccess(){
  if(!native||platform!=='android')return;
  const entitlement=customerInfo?.entitlements?.active?.[config.entitlement];
  const paid=entitlementActive(customerInfo,config.entitlement);
  const until=paid?(entitlement.expirationDate?Date.parse(entitlement.expirationDate):Date.now()+3650*86400000):Date.now()+3650*86400000;
  await FloatingOverlay.setAccess({until:window.mobileCanEdit()?until:0});
}
async function updateTrial() {
  trial = trialState(trial?.record, Date.now(), config.trialDays);
  await write(TRIAL_KEY, JSON.stringify(trial.record));
  updateAccess();
}
function applyDocument(data) {
  const board = window.drawingCanvas;
  board.textEditor?.cancel(); board.cancelPointer({ pointerId: board.activePointerId }); board.clear(true);
  board.setBoardSize(data.width, data.height); board.setBackground(data.background, true);
  board.elements = structuredClone(data.elements); board.redoStack = []; board.clearUndo = null;
  board.redrawAllElements();
  if (data.notes) window.classNotepad.syncFromRemote(data.notes);
  currentTitle = data.title || 'Untitled board';
  workspace?.updateSave(currentTitle);
  for (const b of document.querySelectorAll('.mode-btn')) b.classList.toggle('active', b.dataset.bg === data.background);
}
async function persist() {
  if (!ready) return;
  const data = snapshot(window.drawingCanvas, window.classNotepad, currentTitle);
  currentSaved = JSON.stringify(data);
  const serialized=currentSaved;
  saveChain = saveChain.catch(() => {}).then(() => write(CURRENT_KEY, serialized));
  await saveChain;
  workspace?.updateSave(currentTitle);
}
function queueSave() { workspace?.updateSave(currentTitle,'Saving…');clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => persist().catch(e=>{workspace?.updateSave(currentTitle,'Save failed — export a backup');report(e);}), 350); }
async function fitCanvasToScreen(){
  if(!requireEdit())return;
  const board=window.drawingCanvas;board.textEditor?.commit();
  const recovery=snapshot(board,window.classNotepad,`Before canvas fit ${new Date().toLocaleString()}`);
  const next=[recovery,...library];await write(LIBRARY_KEY,JSON.stringify(next));library=next;
  const w=window.innerWidth,h=window.innerHeight,scale=Math.min(w/board.width,h/board.height),dx=(w-board.width*scale)/2,dy=(h-board.height*scale)/2;
  const elements=structuredClone(board.elements);
  for(const item of elements){
    for(const key of ['x','startX','endX'])if(Number.isFinite(item[key]))item[key]=item[key]*scale+dx;
    for(const key of ['y','startY','endY'])if(Number.isFinite(item[key]))item[key]=item[key]*scale+dy;
    if(item.points)for(const p of item.points){p.x=p.x*scale+dx;p.y=p.y*scale+dy;}
    for(const key of ['size','width','height'])if(Number.isFinite(item[key]))item[key]*=scale;
    if(item.fontSize)item.fontSize=Math.min(240,Math.max(8,item.fontSize*scale));
  }
  board.setBoardSize(w,h);board.elements=elements;board.redoStack=[];board.clearUndo=null;board.redrawAllElements();await persist();closeSheet();showToast('Canvas fitted to this screen. The previous layout is kept in Your boards.');
}
function requireEdit() { if (window.mobileCanEdit()) return true; openPaywall(); return false; }
async function saveNamed(title) {
  if (!requireEdit()) return;
  const name = title.trim() || 'Untitled board';
  const data = snapshot(window.drawingCanvas, window.classNotepad, name);
  const existing = library.findIndex(b => b.title === name);
  const next = structuredClone(library);
  if (existing >= 0) next[existing] = data; else next.unshift(data);
  // Do not lose boards silently when device storage is full.
  await write(LIBRARY_KEY, JSON.stringify(next)); library = next; currentTitle = name; await persist();
  window.showToast('Board saved on this device.'); showLibrary();
}
function showLibrary() {
  const body = sheet('Your boards');
  body.append(el('p','Your current board is saved automatically. Named boards stay on this device; share a backup before uninstalling.'));
  const label = el('label','Board name'); const input = el('input'); input.id = 'board-name'; input.value = currentTitle; input.maxLength = 120; label.append(input);
  body.append(label,button('Save this board',()=>saveNamed(input.value),'primary'),button('New board',()=>{
    if (!requireEdit()) return;
    const b=sheet('Start a new board?');b.append(el('p','Save this board in Your boards first if you want to keep a named copy.'),button('Create empty board',async()=>{
      await archiveCurrent('Before creating a board');applyDocument({ width:window.innerWidth,height:window.innerHeight,background:'whiteboard',elements:[],title:'Untitled board',notes:{tabs:[{id:'notes-1',title:'Notes',content:''}],activeTabId:'notes-1',fontSize:16} }); await persist();closeSheet();await workspace.show('board');
    },'primary'),button('Back',showLibrary));
  }));
  body.append(el('h2','Saved boards'));
  const search=el('input');search.type='search';search.placeholder='Find a board…';search.setAttribute('aria-label','Search saved boards');body.append(search);
  if (!library.length) body.append(el('p','No named boards yet.','muted'));
  for (const data of library) {
    const row=el('div',null,'board-row');row.dataset.title=data.title.toLocaleLowerCase();const info=el('div');info.append(el('strong',data.title),el('small',`${data.elements.length} marks · ${new Date(data.updatedAt).toLocaleDateString()}`));const open=button('Open',async()=>{await archiveCurrent('Before opening another board');applyDocument(validateDocument(data));await persist();closeSheet();await workspace.show('board');});open.setAttribute('aria-label',`Open ${data.title}`);row.append(info,open);body.append(row);
  }
  search.addEventListener('input',()=>{for(const row of body.querySelectorAll('.board-row'))row.hidden=!row.dataset.title.includes(search.value.toLocaleLowerCase());});
  body.append(el('h2','Share and backup'),button('Share PNG image',exportPng),button('Share board backup',exportBackup),button('Import board backup',()=>{if(requireEdit())$('mobile-import').click();}),el('p','Backups contain drawing and note data. PNG exports include Vikashya branding.','muted'));
  body.append(el('h2','Connect to a laptop'),el('p','Use the same Wi-Fi or hotspot. The companion opens in your browser and shows the laptop board; this app’s offline board stays separate.'),button('Open laptop pairing',showPairing));
  body.append(el('h2','About and support'),el('p','Resuvika Omniball · 0.3.0 testing preview\nVikashya Resuvika Private Limited'),button('Privacy policy',()=>openExternal(config.privacyUrl)),button('Terms of use',()=>openExternal(config.termsUrl)));
  if(config.supportEmail)body.append(el('p',`Support: ${config.supportEmail}`));
  body.append(button('Open-source notices',async()=>{const response=await fetch('assets/THIRD-PARTY-NOTICES.txt');if(!response.ok)throw new Error('Notices file is unavailable.');const text=await response.text();const b=sheet('Open-source notices');const pre=el('pre',text);pre.style.cssText='white-space:pre-wrap;word-break:break-word;font:12px/1.5 system-ui';b.append(pre);}));
}
async function archiveCurrent(prefix){
  const recovery=snapshot(window.drawingCanvas,window.classNotepad,`${prefix} ${new Date().toLocaleString()}`);
  if(!recovery.elements.length&&!recovery.notes.tabs.some(t=>t.content.trim()))return;
  const next=[recovery,...library];await write(LIBRARY_KEY,JSON.stringify(next));library=next;
}
async function shareFile(filename, data, mime, binary=false) {
  filename=cleanName(filename);
  if(native){
    const result=await Filesystem.writeFile({path:`exports/${filename}`,data,directory:Directory.Cache,recursive:true,...(binary?{}:{encoding:Encoding.UTF8})});
    await Share.share({title:'Resuvika Omniball',files:[result.uri],dialogTitle:'Save or share your board'});
  }else{
    const blob=binary?new Blob([Uint8Array.from(atob(data),char=>char.charCodeAt(0))],{type:mime}):new Blob([data],{type:mime});
    const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
async function exportBackup(){await persist();await shareFile(`Resuvika-${stamp()}.json`,currentSaved,'application/json');}
async function exportPng(){
  window.drawingCanvas.textEditor?.commit();
  const board=window.drawingCanvas;const c=document.createElement('canvas');
  const exportScale=Math.min(2,4096/Math.max(board.width,board.height));
  c.width=Math.round(board.width*exportScale);c.height=Math.round(board.height*exportScale);const ctx=c.getContext('2d');
  ctx.fillStyle=board.currentBackground==='blackboard'?'#0f172a':board.currentBackground==='chalkboard'?'#143b2f':'#fff';ctx.fillRect(0,0,c.width,c.height);
  const source={x:board.offsetX*board.dpr,y:board.offsetY*board.dpr,w:board.width*board.boardScale*board.dpr,h:board.height*board.boardScale*board.dpr};
  for(const layer of [board.bgCanvas,board.drawCanvas])ctx.drawImage(layer,source.x,source.y,source.w,source.h,0,0,c.width,c.height);
  const font=Math.max(18,Math.round(c.width/65));ctx.font=`600 ${font}px system-ui`;ctx.fillStyle=board.currentBackground==='blackboard'||board.currentBackground==='chalkboard'?'#cbd5e1':'#47617e';
  ctx.fillText('VIKASHYA RESUVIKA · Resuvika Omniball',24,c.height-24);
  await shareFile(`Resuvika-${stamp()}.png`,c.toDataURL('image/png').split(',')[1],'image/png',true);
}
function showPairing(){
  const body=sheet('Connect your laptop');body.append(el('p','On your laptop, open Resuvika Omniball → Connect tablet. Copy its full pairing link here. Both devices must use the same Wi-Fi or hotspot.'));
  const label=el('label','Laptop pairing link');const input=el('input');input.type='url';input.placeholder='http://192.168.…:8080/ipad.html?token=…';input.id='pairing-link';label.append(input);body.append(label,button('Open companion',async()=>{
    const url=validatePairingLink(input.value);await persist();
    // Never navigate the native WebView/bridge to a remote desktop page.
    if(native)await Browser.open({url});else window.open(url,'_blank','noopener');
  },'primary'),el('p','A mobile purchase unlocks this mobile app. The laptop uses its own desktop license.','muted'));
}
async function refreshCustomer(){
  if(!configured)return;
  const result=await Purchases.getCustomerInfo();customerInfo=result.customerInfo;updateAccess();
}
async function loadOffers(){
  packages=[];
  await configurePurchases();
  if(!configured)return;
  const result=await Purchases.getOfferings();
  const offering=result.all?.[config.offering] || result.current;
  packages=(offering?.availablePackages || []).filter(p=>purchaseLabel(p.packageType));
}
async function buy(pkg){
  if(purchasing)return;
  if(entitlementActive(customerInfo,config.entitlement)){window.showToast('Your full version is already active.');return;}
  purchasing=true;
  document.querySelectorAll('.plan').forEach(b=>b.disabled=true);
  try{
    const result=await Purchases.purchasePackage({aPackage:pkg});customerInfo=result.customerInfo;updateAccess();
    if(entitlementActive(customerInfo,config.entitlement)){closeSheet();window.showToast('Full version unlocked. Thank you!');}
    else {openPaywall();window.showToast('Purchase pending or not active yet. Use Restore purchases after the store confirms payment.',6000);}
  }catch(error){if(!error?.userCancelled)report(error);}
  finally{purchasing=false;document.querySelectorAll('.plan').forEach(b=>b.disabled=false);}
}
async function restore(){
  if(purchasing)throw new Error('Finish or cancel the current store checkout first.');
  await configurePurchases();
  if(!configured)throw new Error('Store purchases will be available after the publisher completes store setup.');
  const result=await Purchases.restorePurchases();customerInfo=result.customerInfo;updateAccess();
  if(entitlementActive(customerInfo,config.entitlement)){closeSheet();window.showToast('Your full version has been restored.');}
  else{openPaywall();window.showToast('No active purchase found for this store account.',5000);}
}
async function openPaywall(){
  const body=sheet('Resuvika Omniball Pro (Ad-Free)');
  const revision=sheetRevision;
  const paid=entitlementActive(customerInfo,config.entitlement);
  body.append(el('p','Enjoy an uninterrupted workspace with all whiteboard pens, class notes, floating screen tools, and a clean view for use with your screen recorder.'));
  body.append(el('p',paid?'✨ Your Ad-Free Pro version is active. All ads are permanently removed.':'All features are free to use with ads! Upgrade to remove all ads permanently.','status'));
  const offers=el('div');body.append(offers);
  if(!paid){
    offers.append(el('p','Loading store prices…','muted'));
    try{
      await loadOffers();
      if(revision!==sheetRevision)return;
      offers.replaceChildren();
      if(!packages.length)offers.append(el('p',configured?'Purchases are temporarily unavailable. Check your connection and try again.':'Purchases are not available in this preview. The publisher must finish store configuration.','status'));
      for(const pkg of packages){
        const kind=purchaseLabel(pkg.packageType);const b=button('',()=>buy(pkg),'plan');
        b.append(el('strong',`${kind} · ${pkg.product.priceString}`),el('small',kind==='Lifetime'?'One payment to remove ads forever. No recurring renewal.':kind==='Monthly'?'Billed monthly for ad-free access. Renews automatically until cancelled.':'Billed yearly for ad-free access. Renews automatically until cancelled.'));offers.append(b);
      }
    }catch{if(revision===sheetRevision)offers.replaceChildren(el('p','Store prices could not be loaded. Check your internet connection and try again.','status'));}
  }
  if(revision!==sheetRevision)return;
  body.append(button('Restore purchases',restore),button('Manage subscription',async()=>{
    const url=platform==='ios'?'https://apps.apple.com/account/subscriptions':`https://play.google.com/store/account/subscriptions?package=com.vikashya.resuvika.omniball.mobile`;
    await openExternal(url);
  }));
  if(!paid)body.append(button('Refresh prices',openPaywall));
  body.append(el('p','Payment is confirmed by Google Play or Apple’s App Store. Subscriptions renew automatically unless cancelled through your store account. Lifetime access is a one-time purchase to remove ads permanently.','muted'));
  body.append(button('Privacy policy',()=>openExternal(config.privacyUrl)),button('Terms of use',()=>openExternal(config.termsUrl)));
}
window.openMobilePaywall=()=>openPaywall().catch(report);
async function start(){
  const dialog=el('div');dialog.id='mobile-dialog';dialog.className='mobile-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','mobile-sheet-title');
  const body=el('section');body.id='mobile-sheet';body.className='mobile-sheet';dialog.append(body);document.body.append(dialog);
  dialog.addEventListener('click',e=>{if(e.target===dialog)closeSheet();});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeSheet();}if(e.key==='Tab'){const items=[...body.querySelectorAll('button:not(:disabled),input:not([type=hidden]),select,textarea,a[href],summary')].filter(n=>n.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  const importInput=el('input');importInput.type='file';importInput.accept='.json,application/json';importInput.id='mobile-import';importInput.hidden=true;document.body.append(importInput);
  importInput.addEventListener('change',run(async()=>{
    try{const file=importInput.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('Board backups must be smaller than 20 MB.');
      const data=validateDocument(await file.text());await persist();
      // Save a recovery copy before replacing an unsaved board.
      const recovery=snapshot(window.drawingCanvas,window.classNotepad,`Before import ${new Date().toLocaleString()}`);
      const next=[recovery,...library];await write(LIBRARY_KEY,JSON.stringify(next));library=next;
      applyDocument(data);await persist();closeSheet();window.showToast('Board imported. Previous board kept in Your boards.');
    }finally{importInput.value='';}
  }));
  const compact=$('compact-controls');const boards=button('Boards',showLibrary);boards.id='mobile-boards';const pro=button('Trial',openPaywall);pro.id='mobile-pro';compact.append(boards,pro);
  const reflectTool=()=>document.body.classList.toggle('mobile-text-tool',window.drawingCanvas.activeTool==='text');
  for(const control of document.querySelectorAll('.tool-btn,.shape-opt'))control.addEventListener('click',reflectTool);
  reflectTool();
  window.mobileEditorReserve=()=>Math.max(82,(window.visualViewport?.height||window.innerHeight)-$('text-controls').getBoundingClientRect().top+12);
  const reflectKeyboard=()=>{
    const v=window.visualViewport;document.documentElement.style.setProperty('--keyboard-lift',`${Math.max(0,window.innerHeight-(v?.height||window.innerHeight)-(v?.offsetTop||0))}px`);
    window.drawingCanvas.refreshTextEditor();
  };
  window.visualViewport?.addEventListener('resize',reflectKeyboard);window.visualViewport?.addEventListener('scroll',reflectKeyboard);
  $('ipad-fs-btn').hidden=true;
  // Protect destructive edit commands after evaluation expiry, while retaining view/export.
  document.addEventListener('click',event=>{
    if(ready&&!window.mobileCanEdit()&&event.target.closest('#btn-clear,#btn-undo,#btn-redo,#np-stamp-to-canvas,#np-add-tab,.mode-btn')){event.stopImmediatePropagation();event.preventDefault();openPaywall();}
  },true);
  document.addEventListener('dblclick',event=>{if(!window.mobileCanEdit()&&event.target.closest('.np-tab')){event.stopImmediatePropagation();event.preventDefault();openPaywall();}},true);
  window.addEventListener('boardchanged',queueSave);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persist().catch(report);else updateTrial().catch(report);});
  const rawTrial=await read(TRIAL_KEY);trial=trialState(parse(rawTrial,null),Date.now(),config.trialDays);await write(TRIAL_KEY,JSON.stringify(trial.record));
  library=parse(await read(LIBRARY_KEY),[]);if(!Array.isArray(library))library=[];
  library=library.filter(data=>{try{validateDocument(data);return true;}catch{return false;}});
  const raw=await read(CURRENT_KEY);
  if(raw){try{applyDocument(validateDocument(raw));if(!window.drawingCanvas.elements.length)window.drawingCanvas.setBoardSize(window.innerWidth,window.innerHeight);}catch{window.showToast('Your last board could not be loaded. Import a board backup to recover it.',6000);}}
  else{window.drawingCanvas.setBoardSize(window.innerWidth,window.innerHeight);window.drawingCanvas.setBackground('whiteboard',true);}
  ready=true;updateAccess();
  const btnRemoveAds = $('btn-remove-ads');
  if (btnRemoveAds) btnRemoveAds.addEventListener('click', () => openPaywall().catch(report));
  const btnRecMode = $('btn-recording-mode');
  if (btnRecMode) {
    btnRecMode.addEventListener('click', () => {
      const isRec = document.body.classList.toggle('recording-mode');
      if (isRec) {
        window.showToast?.('🎥 Screen Pen Mode Active: Minimal tools for clean screen recording (Tap to exit)', 3500);
      } else {
        window.showToast?.('Full tools restored');
      }
    });
  }
  window.mobileShell=initMobileShell({canEdit:window.mobileCanEdit,paywall:openPaywall,boards:showLibrary,sheet,closeSheet,persist,fitCanvas:fitCanvasToScreen,syncAccess:syncOverlayAccess,toast:window.showToast,report});
  workspace=initWorkspace({library:showLibrary,more:()=>window.mobileShell.showMore(),persist,closeSheet,report,documents:main=>documents.list(main),connect:main=>connection.show(main)});
  const PrintDocument=registerPlugin('PrintDocument');
  documents=initDocuments({workspace,sheet,shareFile,report,sendFile:(name,blob)=>connection.sendFile(name,blob),nativePrint:native&&platform==='android'?args=>PrintDocument.print(args):null});
  connection=initConnection({workspace,sheet,showPairing,exportBackup,exportPng,shareFile,documents,report,persist,snapshot:()=>snapshot(window.drawingCanvas,window.classNotepad,currentTitle),receiveBoard:async data=>{await archiveCurrent('Before receiving a board');applyDocument(validateDocument(data));await persist();await workspace.show('board');}});
  window.omniball={workspace,documents,connection};
  window.classNotepad.printOrExportPDF=()=>documents.previewNote().catch(report);
  const activeNote=()=>window.classNotepad.tabs.find(tab=>tab.id===window.classNotepad.activeTabId);
  window.classNotepad.downloadAsFile=()=>shareFile(`${cleanName(activeNote()?.title||'Note')}.md`,$('np-editor').value,'text/markdown').catch(report);
  window.classNotepad.shareNative=async()=>{
    const title=activeNote()?.title||'Note',text=$('np-editor').value;if(!text.trim()){window.showToast('Write a note before sharing.');return;}
    try{if(native)await Share.share({title,text,dialogTitle:'Share your note'});else if(navigator.share)await navigator.share({title,text});else await shareFile(`${cleanName(title)}.md`,text,'text/markdown');}catch(error){if(!/cancel|abort/i.test(error?.message||error?.name||''))report(error);}
  };
  window.classNotepad.shareToWhatsApp=()=>{const text=$('np-editor').value;if(!text.trim()){window.showToast('Write a note before sharing.');return;}openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(report);};
  document.querySelector('.notepad-title').textContent='Your notes';
  const rename=button('Rename note',()=>{const notes=window.classNotepad,tab=notes.tabs.find(t=>t.id===notes.activeTabId);const b=sheet('Name your note');const name=el('input');name.value=tab?.title||'';name.maxLength=120;name.setAttribute('aria-label','Note title');b.append(name,button('Save name',async()=>{if(!name.value.trim())return;tab.title=name.value.trim();notes.renderTabs();notes.saveToStorage();await persist();closeSheet();},'primary'));});rename.id='rename-note';$('np-tabs-bar').after(rename);

  // Auto White / Black Background Theme Setting
  const THEME_KEY = 'resuvika_theme_mode_v1';
  const mediaDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  const applyTheme = (mode) => {
    const chosen = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
    localStorage.setItem(THEME_KEY, chosen);
    const isDark = chosen === 'dark' || (chosen === 'auto' && Boolean(mediaDark?.matches));
    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('theme-light', !isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    if (window.drawingCanvas && !window.drawingCanvas.elements.length) {
      window.drawingCanvas.setBackground(isDark ? 'blackboard' : 'whiteboard', true);
    }
  };
  window.setAppTheme = applyTheme;
  applyTheme(localStorage.getItem(THEME_KEY) || 'auto');
  mediaDark?.addEventListener?.('change', () => {
    if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') applyTheme('auto');
  });

  // Apple Notes Minimalist Bar & Floating Capsule Controls
  const notepadPanel = $('floating-notepad');
  const toggleNotePanel = (cls) => {
    for (const c of ['show-format', 'show-tabs', 'show-export']) {
      if (c !== cls) notepadPanel?.classList.remove(c);
    }
    notepadPanel?.classList.toggle(cls);
  };
  $('np-dock-aa')?.addEventListener('click', () => toggleNotePanel('show-format'));
  $('np-dock-tabs')?.addEventListener('click', () => toggleNotePanel('show-tabs'));
  $('np-dock-attach')?.addEventListener('click', () => toggleNotePanel('show-export'));
  $('np-dock-check')?.addEventListener('click', () => {
    const ed = $('np-editor');
    if (!ed) return;
    const pos = ed.selectionStart ?? ed.value.length;
    const prefix = pos > 0 && ed.value[pos - 1] !== '\n' ? '\n☐ ' : '☐ ';
    ed.value = ed.value.slice(0, pos) + prefix + ed.value.slice(pos);
    ed.focus();
    ed.selectionStart = ed.selectionEnd = pos + prefix.length;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('np-dock-draw')?.addEventListener('click', () => workspace.show('board').catch(report));
  $('np-apple-share')?.addEventListener('click', () => window.classNotepad.shareNative());
  $('np-apple-done')?.addEventListener('click', () => {
    $('np-editor')?.blur();
    notepadPanel?.classList.remove('show-format', 'show-tabs', 'show-export');
    persist().catch(report);
    window.showToast?.('Saved');
  });
  $('np-apple-more')?.addEventListener('click', () => {
    const b = sheet('Note options & theme');
    const curTheme = localStorage.getItem(THEME_KEY) || 'auto';
    b.append(el('h2', 'Background theme'));
    const row = el('div', null, 'omni-setting-row');
    for (const [m, lbl] of [['auto', 'Auto'], ['light', 'White'], ['dark', 'Black']]) {
      row.append(button(lbl, () => { applyTheme(m); closeSheet(); }, curTheme === m ? 'primary' : ''));
    }
    b.append(row, el('h2', 'Actions'),
      button('Formatting tools (Aa)', () => { closeSheet(); toggleNotePanel('show-format'); }),
      button('Switch / Add note', () => { closeSheet(); toggleNotePanel('show-tabs'); }),
      button('Export PDF / WhatsApp / Stamp', () => { closeSheet(); toggleNotePanel('show-export'); })
    );
  });
  // Register Back before any store-network request can delay startup.
  if(native)await App.addListener('backButton',run(async()=>{if(!await workspace.back()){await persist();await App.minimizeApp();}}));
  window.addEventListener('resize',()=>{const board=window.drawingCanvas;if(!board.elements.length&&!board.clearUndo?.length&&!board.isDrawing&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){board.setBoardSize(window.innerWidth,window.innerHeight);queueSave();}});
  configurePurchases().catch(()=>window.showToast('Could not connect to purchases. You can retry from Full version.',5000));
  if(native){
    await App.addListener('appStateChange',run(async state=>{if(!state.isActive)await persist();else{await updateTrial();await refreshCustomer();}}));
  }
  setInterval(()=>{updateTrial().catch(report);},60000);
  await persist();
}
if(document.readyState!=='complete')document.addEventListener('DOMContentLoaded',()=>start().catch(report));else start().catch(report);

let configuring;
async function configurePurchases(){
  const key=platform==='android'?config.androidPublicApiKey:platform==='ios'?config.iosPublicApiKey:'';
  if(!native||!key||configured)return;
  if(configuring)return configuring;
  configuring=(async()=>{
    await Purchases.configure({apiKey:key,entitlementVerificationMode:ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL});
    await Purchases.addCustomerInfoUpdateListener(info=>{customerInfo=info;updateAccess();});
    configured=true;await refreshCustomer();
  })();
  try{await configuring;}finally{configuring=null;}
}
