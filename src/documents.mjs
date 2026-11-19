import { node, action } from './workspace.mjs';
const MAX=25*1024*1024;
let dbPromise;
function database(){return dbPromise ||= new Promise((resolve,reject)=>{const req=indexedDB.open('omniball-documents',1);req.onupgradeneeded=()=>req.result.createObjectStore('pdfs',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Document storage is unavailable.'));});}
async function store(mode,fn){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('pdfs',mode);const req=fn(tx.objectStore('pdfs'));let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new Error('Could not save the document. Check available device storage.'));});}
export async function validatePdf(file){
  if(!file||file.size>MAX||file.size<5)throw new Error('Choose a PDF smaller than 25 MB.');
  if(!new TextDecoder().decode(await file.slice(0,1024).arrayBuffer()).includes('%PDF-'))throw new Error('This file is not a PDF.');
  return file;
}
export function initDocuments({workspace,sheet,shareFile,report,sendFile,nativePrint}){
  let task,renderTask,revision=0,activeFile;
  async function list(main){
    main.append(node('div','YOUR READING SPACE','eyebrow'),node('h1','Documents'),node('p','Keep the important pages close. Your PDFs stay on this device.','page-intro'));
    const input=node('input');input.type='file';input.accept='.pdf,application/pdf';input.id='pdf-import';input.hidden=true;
    const add=action('＋ Import PDF',()=>input.click(),'primary');main.append(add,input);
    input.onchange=async()=>{try{const file=await validatePdf(input.files[0]);const data={id:crypto.randomUUID(),name:file.name.slice(0,180),blob:new Blob([await file.arrayBuffer()],{type:'application/pdf'}),updatedAt:Date.now()};await store('readwrite',s=>s.put(data));await open(data);}catch(e){report(e);}finally{input.value='';}};
    const entries=(await store('readonly',s=>s.getAll())).sort((a,b)=>b.updatedAt-a.updatedAt);
    if(!main.isConnected||workspace.getView()!=='documents')return;
    if(!entries.length){const empty=node('div',null,'workspace-empty');empty.append(node('div','↗','empty-art'),node('h2','Room for a good read'),node('p','Import a PDF to read it offline, explore its page text, or share it with another device.'));main.append(empty);}
    for(const entry of entries){const row=node('article',null,'document-card');const info=node('div');info.append(node('span','PDF','file-badge'),node('h2',entry.name),node('small',`${(entry.blob.size/1024/1024).toFixed(1)} MB · Saved on this device`));const openButton=action('Read',()=>open(entry),'primary');openButton.setAttribute('aria-label',`Read ${entry.name}`);row.append(info,openButton);main.append(row);}
  }
  async function open(entry){
    await close(false);const token=++revision;activeFile=entry;
    const root=node('section',null,'document-reader');root.id='document-reader';root.setAttribute('aria-label',entry.name);root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
    const toolbar=node('header',null,'reader-toolbar');const title=node('strong',entry.name);
    const back=action('‹ Documents',()=>close());toolbar.append(back,title);
    const viewport=node('div',null,'pdf-viewport');const canvas=node('canvas');canvas.setAttribute('aria-label','PDF page image. Read page text below for accessible content.');const text=node('details',null,'pdf-text');text.append(node('summary','Read page text'));const textContent=node('div');textContent.dir='auto';text.append(textContent);viewport.append(canvas,text);
    const controls=node('div',null,'reader-controls');const status=node('span','Opening PDF…');status.setAttribute('role','status');const previous=action('←',()=>render(pageNumber-1));previous.setAttribute('aria-label','Previous page');const next=action('→',()=>render(pageNumber+1));next.setAttribute('aria-label','Next page');const zoomOut=action('−',()=>{zoom=Math.max(.75,zoom-.25);return render(pageNumber);});zoomOut.setAttribute('aria-label','Zoom out');const zoomIn=action('＋',()=>{zoom=Math.min(2,zoom+.25);return render(pageNumber);});zoomIn.setAttribute('aria-label','Zoom in');controls.append(previous,status,next,zoomOut,zoomIn);
    const share=action('Share PDF',async()=>shareFile(entry.name,await base64(entry.blob),'application/pdf',true));const send=action('Send to device',()=>sendFile(entry.name,entry.blob));toolbar.append(share,send);root.append(toolbar,viewport,controls);document.body.append(root);
    for(const n of document.body.children)if(n!==root&&n.id!=='toast'&&n.tagName!=='SCRIPT'&&!n.inert){n.inert=true;n.dataset.readerInert='true';}
    root.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...root.querySelectorAll('button:not(:disabled),summary')];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    workspace.setPreviewBack(()=>close());back.focus();
    let pdf,pageNumber=1,zoom=1,renderSequence=0;
    async function render(number){
      if(!pdf||number<1||number>pdf.numPages)return;const sequence=++renderSequence;
      const previousTask=renderTask;previousTask?.cancel();try{await previousTask?.promise;}catch{}
      if(sequence!==renderSequence||token!==revision)return;
      pageNumber=number;previous.disabled=number===1;next.disabled=number===pdf.numPages;zoomOut.disabled=zoom<=.75;zoomIn.disabled=zoom>=2;
      const page=await pdf.getPage(number);if(sequence!==renderSequence||token!==revision)return;
      const original=page.getViewport({scale:1});const width=Math.min(viewport.clientWidth-32,1000)*zoom;const v=page.getViewport({scale:width/original.width});const dpr=Math.min(devicePixelRatio||1,2,Math.sqrt(6000000/(v.width*v.height)));
      canvas.width=Math.floor(v.width*dpr);canvas.height=Math.floor(v.height*dpr);canvas.style.width=`${v.width}px`;canvas.style.height=`${v.height}px`;
      canvas.setAttribute('aria-label',`Page ${number} of ${pdf.numPages}. Read page text below.`);
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport:v,transform:[dpr,0,0,dpr,0,0]});
      try{await renderTask.promise;}catch(e){if(e.name==='RenderingCancelledException')return;throw e;}
      if(sequence!==renderSequence||token!==revision)return;
      const content=await page.getTextContent();if(sequence!==renderSequence||token!==revision)return;
      textContent.textContent=content.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('')||'This page contains no extractable text. Scanned pages need OCR.';
      status.textContent=`${number} / ${pdf.numPages} · ${Math.round(zoom*100)}%`;viewport.scrollTop=0;
    }
    try{
      const lib=await import('pdfjs-dist/legacy/build/pdf.mjs');if(token!==revision)return;
      lib.GlobalWorkerOptions.workerSrc=new URL('js/pdf.worker.mjs',document.baseURI).href;
      task=lib.getDocument({data:new Uint8Array(await entry.blob.arrayBuffer()),isEvalSupported:false,cMapUrl:new URL('pdf/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('pdf/standard_fonts/',document.baseURI).href,wasmUrl:new URL('pdf/wasm/',document.baseURI).href});
      task.onPassword=()=>{task.destroy();status.textContent='Password-protected PDF. Open an unlocked copy.';};
      pdf=await task.promise;if(token!==revision)return;await render(1);
    }catch(e){if(token===revision){status.textContent='Could not open this PDF.';viewport.append(node('p','The file may be damaged or password protected. Return to Documents and choose another PDF.'));}}
  }
  async function close(returnToList=true){revision++;renderTask?.cancel();renderTask=null;const old=task;task=null;activeFile=null;document.getElementById('document-reader')?.remove();document.querySelectorAll('[data-reader-inert]').forEach(n=>{n.inert=false;delete n.dataset.readerInert;});workspace.setPreviewBack(null);try{await old?.destroy();}catch{}if(returnToList)await workspace.show('documents');}
  async function previewNote(){
    const notes=window.classNotepad;const tab=notes.tabs.find(t=>t.id===notes.activeTabId);const body=sheet('Note preview');
    const article=node('article',null,'note-print');article.append(node('h2',tab?.title||'Note'),node('pre',notes.editor.value));body.append(article);
    body.append(action('Print / Save as PDF',async()=>{
      if(nativePrint){const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));await nativePrint({title:tab?.title||'Note',html:`<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 sans-serif;padding:32px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(tab?.title||'Note')}</h1><pre>${escape(notes.editor.value)}</pre>`});}
      else window.print();
    },'primary'));
  }
  async function importBlob(name,blob){await validatePdf(blob);const entry={id:crypto.randomUUID(),name:name.slice(0,180),blob,updatedAt:Date.now()};await store('readwrite',s=>s.put(entry));await workspace.show('documents');await open(entry);}
  return {list,open,close,previewNote,importBlob,getActive:()=>activeFile};
}
export async function base64(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
