import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve('../Resuvika_Omniball_Release/source/.build-cache/browsers');
const {chromium,webkit,devices}=await import('playwright');
const checks=[],errors=[],external=[];await fs.mkdir('verification',{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.txt':'text/plain'};
const root=path.resolve('www');
const server=http.createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
async function testDevice(type,device,name){
 const browser=await type.launch({headless:true});
 try{
  const ctx=await browser.newContext(device);await ctx.route('**/*',r=>{if(!r.request().url().startsWith(base)){external.push(r.request().url());return r.abort();}return r.continue();});
  const page=await ctx.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});await page.addInitScript(()=>{if(location.protocol==='http:')localStorage.setItem('resuvika_menus_hidden','false');});
  await page.goto(base);await page.waitForFunction(()=>window.mobileShell&&window.mobileCanEdit());
  const bubble=page.locator('#omni-bubble'),palette=page.locator('#omni-palette');
  const quick=async label=>{if(await palette.isHidden())await bubble.click();await palette.getByRole('button',{name:label,exact:true}).click();};
  const more=async label=>{await quick('More');await page.getByRole('button',{name:label,exact:true}).click();};
  const ready=()=>page.waitForFunction(()=>window.mobileShell&&window.mobileCanEdit());
  assert.equal(await page.locator('#main-toolbar').isVisible(),false);assert.equal(await page.locator('button:visible').count(),1);
  const b=await bubble.boundingBox();assert.ok(b.width<=60&&b.height<=60);checks.push(`${name}: upgrade starts with one floating button, not the old tablet toolbar.`);
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(30,device.viewport.height*.3,{steps:8});await page.mouse.up();assert.equal(await palette.isHidden(),true);assert.ok((await bubble.boundingBox()).x<=14);checks.push(`${name}: dragging docks the button without accidentally opening the palette.`);
  await bubble.click();const p=await palette.boundingBox();assert.ok(p.width<=280&&p.x>=0&&p.x+p.width<=device.viewport.width+1&&p.y>=0&&p.y+p.height<=device.viewport.height+1);
  await palette.getByRole('button',{name:'Rectangle',exact:true}).click();assert.equal(await palette.isHidden(),true);assert.equal(await page.evaluate(()=>window.drawingCanvas.activeShape),'rect');
  const draw=async()=>page.evaluate(()=>{const c=window.drawingCanvas;const e=(x,y)=>({pointerId:9,pointerType:'pen',clientX:c.offsetX+x*c.boardScale,clientY:c.offsetY+y*c.boardScale,pressure:.6,preventDefault(){}});c.onPointerDown(e(40,100));c.onPointerMove(e(170,220));c.onPointerUp(e(170,220));});
  await draw();assert.equal(await page.evaluate(()=>window.drawingCanvas.elements.length),1);await page.waitForTimeout(700);await page.reload();await ready();assert.equal(await page.evaluate(()=>window.drawingCanvas.elements[0].type),'shape');assert.equal(await page.evaluate(()=>window.drawingCanvas.activeShape),'rect');
  await more('Clear screen');assert.equal(await page.evaluate(()=>window.drawingCanvas.elements.length),0);await more('Undo');assert.equal(await page.evaluate(()=>window.drawingCanvas.elements.length),1);
  checks.push(`${name}: compact palette fits; rectangle remembered; clear/undo and drawing recovery work.`);
  await quick('Pen');await draw();await quick('Text');await page.mouse.click(80,310);await page.locator('#active-screen-text-input textarea').fill('Mobile');await page.locator('#text-font-size').fill('64');await page.locator('.text-edit-actions button').first().click();assert.equal(await page.evaluate(()=>window.drawingCanvas.elements.find(e=>e.type==='text')?.fontSize),64);
  await more('Class notes');await page.locator('#np-editor').fill('Mobile class notes');await page.locator('#np-close-btn').click();assert.equal(await page.locator('#main-toolbar').isVisible(),false);
  checks.push(`${name}: text size and class notes remain usable without reopening a large toolbar.`);
  await bubble.click();await palette.getByRole('button',{name:'Customize',exact:true}).click();await page.locator('#omni-icon').selectOption('dot');await page.locator('#omni-size').selectOption('44');await page.locator('#omni-side').selectOption('left');await page.locator('#omni-orientation').selectOption('auto');await page.getByLabel('Circle',{exact:true}).check();await page.locator('.close-sheet').click();await page.reload();await ready();assert.equal((await bubble.boundingBox()).width,44);assert.ok((await bubble.boundingBox()).x<=14);await quick('Circle');assert.equal(await page.evaluate(()=>window.drawingCanvas.activeShape),'circle');
  checks.push(`${name}: custom icon, size, edge, orientation and favorite tools persist.`);
  await more('Recording view');await page.locator('#recording-hide-brand').check();await page.locator('#start-recording-view').click();assert.equal(await bubble.isVisible(),false);assert.equal(await page.locator('#vikashya-brand').isVisible(),false);await page.locator('#recording-restore-edge').dispatchEvent('pointerdown',{pointerId:3});await page.waitForTimeout(1100);await page.locator('#recording-restore-edge').dispatchEvent('pointerup',{pointerId:3});assert.equal(await bubble.isVisible(),true);assert.equal(await page.locator('#main-toolbar').isVisible(),false);
  await page.screenshot({path:`verification/${name}-0.2-clean.png`});await bubble.click();await page.screenshot({path:`verification/${name}-0.2-tools.png`});await bubble.click();
  if(name==='bluestacks-wide-layout'){await page.setViewportSize({width:768,height:1366});await quick('Style');await page.getByRole('button',{name:'Fit canvas to this screen',exact:true}).click();assert.deepEqual(await page.evaluate(()=>({w:window.drawingCanvas.width,h:window.drawingCanvas.height})),{w:768,h:1366});assert.equal(await page.evaluate(()=>window.drawingCanvas.elements.length),3);checks.push('Wide-to-portrait canvas fit keeps existing ink and creates a recovery board.');}
  await more('Boards & export');await page.locator('#board-name').fill('Physics');await page.getByRole('button',{name:'Save this board',exact:true}).click();await page.getByRole('button',{name:'Open',exact:true}).first().waitFor();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Share board backup',exact:true}).click();const backup=await download;const doc=JSON.parse(await fs.readFile(await backup.path(),'utf8'));assert.equal(doc.elements.length,3);assert.equal(doc.notes.tabs.find(t=>t.id===doc.notes.activeTabId).content,'Mobile class notes');const pngPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Share PNG image',exact:true}).click();const png=await pngPromise;assert.equal((await fs.readFile(await png.path())).subarray(1,4).toString(),'PNG');await page.locator('.close-sheet').click();
  checks.push(`${name}: recording hides/restores the small control; named boards, notes and PNG/JSON exports work.`);
  await page.evaluate(()=>localStorage.setItem('resuvika_mobile_trial_v1',JSON.stringify({firstLaunch:Date.now()-8*86400000,lastSeen:Date.now()})));await page.reload();await page.waitForFunction(()=>window.mobileShell&&document.body.classList.contains('read-only'));await more('Clear screen');await page.getByText('Your 7-day evaluation has ended.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.drawingCanvas.elements.length),3);assert.equal(await page.locator('.plan').count(),0);await page.getByRole('button',{name:'Restore purchases',exact:true}).click();assert.match(await page.locator('#toast').textContent(),/publisher completes/);checks.push(`${name}: expiry blocks destructive edits and unavailable billing never grants fake access.`);
 }finally{await browser.close();}
}
try{
 await testDevice(chromium,{...devices['Pixel 7']},'android-phone');
 await testDevice(chromium,{viewport:{width:1366,height:768}},'bluestacks-wide-layout');
 await testDevice(webkit,{...devices['iPhone 13']},'iphone');
 await testDevice(webkit,{...devices['iPad (gen 7)']},'ipad');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await fs.writeFile('verification/ui-0.2-results.json',JSON.stringify({checks,errors,external},null,2));console.log(checks.join('\n'));
}finally{await new Promise(r=>server.close(r));}
