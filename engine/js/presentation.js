'use strict';
window.initPresentationControls=function(){
  const tablet=document.body.classList.contains('tablet-app');
  const compact=document.createElement('nav');compact.id='compact-controls';compact.setAttribute('aria-label','Quick presentation controls');
  const toggle=document.getElementById('tablet-toolbar-toggle')||document.createElement('button');toggle.id='tablet-toolbar-toggle';toggle.type='button';
  const record=document.createElement('button');record.id='recording-options';record.textContent='🎥 Record';record.type='button';
  if(tablet)compact.append(toggle,record);else compact.append(toggle);
  document.body.append(compact);
  const fullscreen=document.getElementById('ipad-fs-btn');
  if(fullscreen){fullscreen.style.position='static';fullscreen.textContent='⛶';fullscreen.setAttribute('aria-label','Fullscreen');compact.append(fullscreen);}
  const brand=document.createElement('div');brand.id='vikashya-brand';
  brand.style.cursor='pointer';
  brand.title='Click logo to restore all menus and exit recording mode';
  const logo=document.createElement('img');logo.src='assets/app-icon.png';logo.alt='Resuvika Omniball';
  const name=document.createElement('span');name.textContent='VIKASHYA RESUVIKA';
  const product=document.createElement('small');product.textContent='Resuvika Omniball';
  brand.append(logo,name,product);document.body.append(brand);
  brand.addEventListener('click',()=>{
    if(document.body.classList.contains('recording-mode')||document.body.classList.contains('zen-mode')||document.body.classList.contains('menus-hidden')){
      leaveRecording();
      window.showToast?.('All menus and controls restored!');
    }
  });
  const panel=document.createElement('section');panel.id='recording-panel';panel.className='glass-panel';panel.setAttribute('aria-label','Recording options');
  const heading=document.createElement('h2');heading.textContent='Recording mode';
  const info=document.createElement('p');info.textContent='Hide every menu and control while using your screen recorder. '+(tablet?'Hold the top edge for one second to restore controls.':'Press Alt+Z or Escape, or use the tray menu, to restore controls.');
  const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='recording-hide-brand';
  checkbox.checked=localStorage.getItem('resuvika_hide_recording_brand')==='true';label.append(checkbox,document.createTextNode(' Hide Vikashya branding during recording'));
  const start=document.createElement('button');start.id='start-recording-view';start.textContent='Hide controls for recording';
  const cancel=document.createElement('button');cancel.id='cancel-recording-view';cancel.textContent='Cancel';
  panel.append(heading,info,label,start,cancel);document.body.append(panel);
  const hotspot=document.createElement('div');hotspot.id='recording-restore-edge';hotspot.setAttribute('aria-hidden','true');document.body.append(hotspot);
  function menuHidden(hidden){
    document.body.classList.toggle('menus-hidden',hidden);document.body.classList.toggle('tablet-tools-hidden',hidden);
    toggle.textContent=hidden?'Show menu':'Hide menu';toggle.setAttribute('aria-expanded',String(!hidden));
    document.getElementById('shapes-menu')?.classList.remove('show');
    localStorage.setItem('resuvika_menus_hidden',String(hidden));
  }
  function leaveRecording(){
    document.body.classList.remove('recording-mode','recording-hide-brand','zen-mode');panel.classList.remove('show');menuHidden(false);
  }
  function beginRecording(){
    window.drawingCanvas.textEditor?.commit();
    localStorage.setItem('resuvika_hide_recording_brand',String(checkbox.checked));
    for(const id of ['pair-modal','about-modal','shapes-menu','export-menu'])document.getElementById(id)?.classList.remove('show');
    panel.classList.remove('show');document.body.classList.add('recording-mode');
    document.body.classList.toggle('recording-hide-brand',checkbox.checked);
  }
  function options(){panel.classList.add('show');}
  toggle.onclick=()=>menuHidden(!document.body.classList.contains('menus-hidden'));
  record.onclick=options;start.onclick=beginRecording;cancel.onclick=()=>panel.classList.remove('show');
  const zen=document.getElementById('btn-zen-mode');if(zen){zen.textContent='🎥 Record';zen.className='dock-pill-btn rec-dock-btn';zen.title='Hide controls for lecture recording (Click left logo or press Alt+Z to restore)';zen.onclick=options;}
  window.toggleZenMode=()=>document.body.classList.contains('recording-mode')?leaveRecording():beginRecording();
  window.restoreControls=leaveRecording;
  if(tablet){
    for(const button of document.querySelectorAll('.tool-btn[data-tool],.shape-opt,#shapes-dropdown-btn'))button.addEventListener('click',()=>menuHidden(true));
  }
  let hold;
  hotspot.addEventListener('pointerdown',event=>{event.preventDefault();hold=setTimeout(leaveRecording,1000);});
  for(const type of ['pointerup','pointercancel','pointerleave'])hotspot.addEventListener(type,()=>clearTimeout(hold));
  for(const element of [compact,panel,hotspot,brand]){
    element.addEventListener('pointerenter',()=>window.electronAPI?.setIgnoreMouseEvents(false));
    element.addEventListener('pointerleave',()=>{if(document.getElementById('btn-mode-mouse')?.classList.contains('active'))window.electronAPI?.setIgnoreMouseEvents(true);});
  }
  menuHidden(localStorage.getItem('resuvika_menus_hidden')===null?tablet:localStorage.getItem('resuvika_menus_hidden')==='true');
};
