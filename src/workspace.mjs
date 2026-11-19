const icons = {
  board: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h5"/>',
  notes: '<path d="M8 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM3 7h4M3 12h4M3 17h4M11 8h6M11 12h6"/>',
  documents: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5"/>',
  connect: '<path d="m8 7 8 10V3L8 10l8 11v-7L8 7ZM5 12h.01M20 12h.01"/>',
  library: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
export const node = (tag, text, cls) => { const n = document.createElement(tag); if(text != null)n.textContent=text; if(cls)n.className=cls; return n; };
export function action(label, fn, cls='') { const b=node('button',label,cls); b.type='button'; b.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>window.showToast(e.message,5000))); return b; }
function iconButton(label,id,fn){const b=action('',fn);b.setAttribute('aria-label',label);b.title=label;b.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id]}</svg>`;return b;}

export function initWorkspace(actions) {
  let view='board', previewBack=null, navigationRevision=0;
  const header=node('header',null,'workspace-header');header.id='workspace-header';
  const brand=node('div',null,'workspace-brand');brand.append(node('span','o','workspace-mark'));
  const heading=node('div');heading.append(node('strong','Omniball'));const status=node('span','A little space for big ideas.','workspace-subtitle');heading.append(status);brand.append(heading);
  const controls=node('div',null,'workspace-header-actions');controls.append(iconButton('Your boards','library',actions.library),iconButton('Workspace options','more',actions.more));header.append(brand,controls);
  const main=node('main',null,'workspace-page');main.id='workspace-page';main.hidden=true;main.tabIndex=-1;
  const nav=node('nav',null,'workspace-nav');nav.id='workspace-nav';nav.setAttribute('aria-label','Main navigation');
  const views=[['board','Board'],['notes','Notes'],['documents','Documents'],['connect','Connect']];
  for(const [id,label] of views){const b=iconButton(label,id,()=>show(id));b.append(node('span',label));b.dataset.view=id;nav.append(b);}
  const welcome=node('section',null,'workspace-welcome');welcome.setAttribute('aria-label','Start creating');welcome.append(node('div','A PLACE FOR YOUR NEXT IDEA','eyebrow'),node('h1','Think freely.\nMake it yours.'),node('p','Sketch a thought. Capture a moment.\nGive your next big idea a little space.'),action('Start a note ↗',()=>show('notes')));document.body.append(header,main,nav,welcome);
  const reflectWelcome=()=>welcome.hidden=window.drawingCanvas.elements.length>0;
  document.getElementById('draw-canvas').addEventListener('pointerdown',()=>welcome.hidden=true);
  window.addEventListener('boardchanged',reflectWelcome);reflectWelcome();
  function reflect(){
    reflectWelcome();
    document.body.dataset.view=view;
    nav.querySelectorAll('button').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  }
  async function show(next) {
    if(!views.some(([id])=>id===next))return;
    const navigation=++navigationRevision;await actions.persist();if(navigation!==navigationRevision)return;previewBack=null;actions.closeSheet();window.mobileShell.close();
    document.getElementById('floating-notepad').classList.add('hidden');
    view=next;main.hidden=true;main.replaceChildren();reflect();
    if(view==='notes'){
      const notes=document.getElementById('floating-notepad');notes.classList.remove('hidden','minimized');notes.style.removeProperty('left');notes.style.removeProperty('top');
      document.getElementById('np-editor').setAttribute('aria-label','Note content');
    } else if(view==='documents'||view==='connect'){
      const content=node('div');main.replaceChildren(content);main.hidden=false;await actions[view](content);if(navigation!==navigationRevision)return;main.focus({preventScroll:true});
    }
    status.textContent=view==='board'?'Your ideas, beautifully connected.':view==='notes'?'Capture a thought. Make it yours.':view==='documents'?'Read, keep, and share.':'Your devices. One creative space.';
  }
  function updateSave(title,state='Saved on this device'){
    header.querySelector('strong').textContent='Omniball';
    header.title=`${title} · ${state}`;
    document.getElementById('workspace-save-status')?.remove();
    const save=node('span',state,'workspace-save-status');save.id='workspace-save-status';save.setAttribute('role','status');header.append(save);
  }
  async function back(){
    if(previewBack){const close=previewBack;previewBack=null;await close();return true;}
    if(!document.getElementById('mobile-dialog').hidden){actions.closeSheet();return true;}
    if(document.getElementById('active-screen-text-input')){window.drawingCanvas.textEditor?.commit();return true;}
    if(document.body.classList.contains('recording-mode')){window.restoreControls();return true;}
    if(document.getElementById('recording-panel').classList.contains('show')){document.getElementById('recording-panel').classList.remove('show');return true;}
    if(!document.getElementById('omni-palette').hidden){window.mobileShell.close();return true;}
    if(view!=='board'){await show('board');return true;}
    return false;
  }
  document.getElementById('np-close-btn').addEventListener('click',()=>show('board'));
  document.getElementById('np-minimize-btn').addEventListener('click',()=>show('board'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();back().catch(actions.report);}},true);
  // Swipe only on navigation. Finger and stylus marks on the canvas remain drawing gestures.
  let start;
  nav.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
  nav.addEventListener('pointercancel',()=>{start=null;});
  nav.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)<48||Math.abs(dx)<Math.abs(dy)*2)return;const index=views.findIndex(([id])=>id===view);const next=views[index+(dx<0?1:-1)];if(next){nav.dataset.swiped='true';show(next[0]).catch(actions.report);setTimeout(()=>delete nav.dataset.swiped,400);}});
  nav.addEventListener('click',e=>{if(nav.dataset.swiped){e.preventDefault();e.stopImmediatePropagation();}},true);
  for(const b of document.querySelectorAll('button[title]'))if(!b.hasAttribute('aria-label'))b.setAttribute('aria-label',b.title);
  const toast=document.getElementById('toast');toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  document.getElementById('np-search-input').setAttribute('aria-label','Search notes');
  document.getElementById('draw-canvas').setAttribute('aria-label','Drawing board. Use Notes for keyboard and screen-reader friendly writing.');
  reflect();
  return {show,back,updateSave,getView:()=>view,setPreviewBack:fn=>previewBack=fn,main};
}
