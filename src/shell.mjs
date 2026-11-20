import { Capacitor, registerPlugin } from '@capacitor/core';
export const FloatingOverlay = registerPlugin('FloatingOverlay');
const key='resuvika_mobile_shell_v2';
const paths={pen:'m5 19 3-1 11-11-3-3L5 15v4Zm9-13 3 3',highlighter:'m5 17 6-12 6 3-6 12M3 21h12',eraser:'m4 14 9-10 7 7-9 10H8l-4-4v-3Zm4 7h13M9 9l7 7',rect:'M4 5h16v14H4z',circle:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',line:'m4 20 16-16',arrow:'M4 20 20 4M9 4h11v11',text:'M4 5h16M12 5v15M8 20h8',laser:'m13 2-8 12h7l-1 8 8-12h-7z',undo:'m9 5-5 5 5 5M4 10h10a6 6 0 0 1 0 12',redo:'m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',more:'M5 11v2m7-2v2m7-2v2',settings:'m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',close:'m6 6 12 12M6 18 18 6',palette:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a3 3 0 0 0 3-3c0-4-4-7-9-7ZM7 8h.01M12 6h.01M6 13h.01M17 8h.01',board:'M3 4h18v14H3zM8 22l4-4 4 4',layers:'m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',record:'M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',clear:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',touch:'M9 12V5a2 2 0 0 1 4 0v7-3a2 2 0 0 1 3 0v4-2a2 2 0 0 1 3 0v5c0 4-3 6-7 6-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l3 3',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',dot:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',v:'m4 5 8 15 8-15'};
const tools=[['pen','Pen'],['highlighter','Highlight'],['eraser','Eraser'],['rect','Rectangle'],['circle','Circle'],['line','Line'],['arrow','Arrow'],['text','Text'],['laser','Laser']];
Object.assign(paths,{'rounded-rect':'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3','triangle':'m12 3 10 18H2z','axes':'M3 12h18M12 21V3m-3 3 3-3 3 3m3 3 3 3-3 3','step-badge':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m-3 5 3-1v10m-3 0h6','double-arrow':'M3 12h18M7 8l-4 4 4 4m10-8 4 4-4 4','bucket':'m5 9 7-7 9 9-7 7L5 9Zm-2 4-1 6c0 3 5 3 5 0l-4-6m0 10h19'});
const defaults={favorites:['pen','rect','eraser','text'],size:52,color:'#5557D9',opacity:1,icon:'pen',side:'right',y:.65,orientation:'portrait',autoClose:true};
export function normalizeSettings(value={}){
  const favorites=[...new Set((Array.isArray(value.favorites)?value.favorites:defaults.favorites).filter(id=>tools.some(t=>t[0]===id)))].slice(0,6);
  return {...defaults,favorites:favorites.length?favorites:defaults.favorites,size:[44,52,60].includes(Number(value.size))?Number(value.size):52,color:/^#[a-f0-9]{6}$/i.test(value.color)?value.color:defaults.color,opacity:Math.min(1,Math.max(.55,Number(value.opacity)||1)),icon:['pen','spark','dot','v'].includes(value.icon)?value.icon:'pen',side:value.side==='left'?'left':'right',y:Math.min(.9,Math.max(.1,Number(value.y)||.65)),orientation:['portrait','landscape','auto'].includes(value.orientation)?value.orientation:'portrait',autoClose:value.autoClose!==false,pencilOnly:Boolean(value.pencilOnly)};
}
const icon=id=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[id]||paths.pen}"/></svg>`;
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
export function initMobileShell(actions){
  let settings;try{settings=normalizeSettings(JSON.parse(localStorage.getItem(key)||'{}'));}catch{settings=normalizeSettings();}
  const nativeAndroid=Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
  window.drawingCanvas.pencilOnly=settings.pencilOnly;window.toolPreferences.save();
  const legacy=document.getElementById('compact-controls');legacy.classList.add('legacy-mobile-controls');
  const root=node('div',null,'omni-shell');root.id='omni-shell';
  const bubble=node('button',null,'omni-bubble');bubble.id='omni-bubble';bubble.type='button';bubble.setAttribute('aria-label','Open quick tools');bubble.setAttribute('aria-expanded','false');
  const panel=node('section',null,'omni-palette');panel.id='omni-palette';panel.hidden=true;panel.setAttribute('aria-label','Quick tools');
  root.append(bubble,panel);document.body.append(root);
  function button(label,id,fn,cls='omni-action'){const b=node('button',null,cls);b.type='button';b.innerHTML=icon(id);b.append(node('span',label));b.title=label;b.setAttribute('aria-label',label);b.addEventListener('click',()=>Promise.resolve().then(fn).catch(actions.report));return b;}
  function close(){panel.hidden=true;bubble.setAttribute('aria-expanded','false');}
  function position(){
    const h=window.innerHeight;root.style.setProperty('--omni-accent',settings.color);bubble.style.width=bubble.style.height=settings.size+'px';bubble.style.opacity=String(settings.opacity);
    root.style.left=settings.side==='left'?'max(12px, env(safe-area-inset-left))':'auto';root.style.right=settings.side==='right'?'max(12px, env(safe-area-inset-right))':'auto';
    const top=Math.min(h-settings.size-116,Math.max(100,h*settings.y));root.style.top=top+'px';panel.style.left=settings.side==='left'?'0':'auto';panel.style.right=settings.side==='right'?'0':'auto';
    panel.style.bottom=settings.y>.5?`${settings.size+10}px`:'auto';panel.style.top=settings.y<=.5?`${settings.size+10}px`:'auto';
    panel.style.maxHeight=Math.max(96,settings.y>.5?top-22:h-top-settings.size-22)+'px';
  }
  function save(){localStorage.setItem(key,JSON.stringify(settings));position();bubble.innerHTML=icon(settings.icon);if(nativeAndroid)FloatingOverlay.configure({settings}).catch(actions.report);}
  function current(){const b=window.drawingCanvas;return b.activeTool==='shape'?b.activeShape:b.activeTool==='eraser-stroke'?'eraser':b.activeTool;}
  function choose(id){
    if(!actions.canEdit()){actions.paywall();return;}
    const b=window.drawingCanvas;b.textEditor?.commit();
    if(['rect','circle','line','arrow','rounded-rect','triangle','axes','step-badge','double-arrow'].includes(id)){b.activeTool='shape';b.activeShape=id;}else b.activeTool=id==='eraser'?'eraser-stroke':id;
    window.toolPreferences.save();document.body.classList.toggle('mobile-text-tool',id==='text');
    if(settings.autoClose)close();else render();
  }
  function editAction(fn){if(!actions.canEdit()){actions.paywall();return;}fn();actions.closeSheet();}
  function render(){
    panel.replaceChildren();const head=node('div',null,'omni-palette-head');head.append(node('strong','Quick tools'),button('Customize','settings',showSettings,'omni-small-icon'));panel.append(head);
    const grid=node('div',null,'omni-tool-grid');for(const id of settings.favorites){const item=tools.find(t=>t[0]===id);const b=button(item[1],id,()=>choose(id),'omni-tool');b.classList.toggle('selected',current()===id);grid.append(b);}panel.append(grid);
    const row=node('div',null,'omni-command-row');row.append(button('Undo','undo',()=>window.drawingCanvas.undo()),button('Style','palette',showStyle),button('More','more',showMore));panel.append(row);
  }
  function open(){render();panel.hidden=false;bubble.setAttribute('aria-expanded','true');position();}
  let drag;
  bubble.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,moved:false};bubble.setPointerCapture(event.pointerId);});
  bubble.addEventListener('pointermove',event=>{if(!drag)return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>8)drag.moved=true;if(drag.moved){close();settings.y=Math.min(.9,Math.max(.1,event.clientY/window.innerHeight));settings.side=event.clientX<window.innerWidth/2?'left':'right';position();}});
  bubble.addEventListener('pointerup',()=>{if(!drag)return;const moved=drag.moved;drag=null;if(moved)save();});
  bubble.addEventListener('pointercancel',()=>{drag=null;close();save();});
  bubble.addEventListener('click',event=>{if(drag?.moved)return;if(bubble.dataset.suppress==='true'){bubble.dataset.suppress='false';return;}panel.hidden?open():close();});
  // Suppress the synthetic click following a drag without blocking keyboard activation.
  bubble.addEventListener('pointerup',()=>{if(drag?.moved)bubble.dataset.suppress='true';},true);
  document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();});window.addEventListener('resize',position);
  function sheet(title){close();return actions.sheet(title);}
  function showStyle(){
    const body=sheet('Ink & canvas');body.append(node('p','Make the board feel right for your lesson.','muted'));
    const swatches=node('div',null,'omni-swatches');for(const color of ['#ef4444','#2563eb','#0f766e','#5557d9','#f59e0b','#111827','#ffffff']){const b=button(color,'dot',()=>{window.drawingCanvas.currentColor=color;window.toolPreferences.save();for(const s of swatches.children)s.classList.toggle('selected',s===b);},'omni-swatch');b.style.background=color;b.style.color=color==='#ffffff'?'#111827':'#fff';swatches.append(b);}body.append(swatches);
    const color=node('input');color.type='color';color.value=window.drawingCanvas.currentColor;color.setAttribute('aria-label','Custom ink color');color.oninput=()=>{window.drawingCanvas.currentColor=color.value;window.toolPreferences.save();};body.append(color);
    const width=node('label','Stroke width');const size=node('input');size.type='range';size.min=1;size.max=32;size.value=window.drawingCanvas.currentSize;size.setAttribute('aria-label','Stroke width');size.oninput=()=>{window.drawingCanvas.currentSize=Number(size.value);window.toolPreferences.save();};width.append(size);body.append(width);
    const text=node('label','Text size (px)');const font=node('input');font.type='number';font.min=8;font.max=240;font.value=window.drawingCanvas.textFontSize;font.setAttribute('aria-label','Board text size');font.oninput=()=>{window.drawingCanvas.setTextFontSize(font.value);document.getElementById('text-font-size').value=window.drawingCanvas.textFontSize;};text.append(font);body.append(text);
    const boards=node('div',null,'omni-setting-row');for(const [bg,title]of[['whiteboard','White'],['blackboard','Dark'],['chalkboard','Chalk'],['grid','Grid']])boards.append(button(title,'board',()=>{if(actions.canEdit()){window.drawingCanvas.setBackground(bg);actions.closeSheet();}else actions.paywall();}));body.append(node('h2','Board background'),boards,button('Fit canvas to this screen','board',actions.fitCanvas),button('More tools','layers',showAllTools));
    const fills=node('div',null,'omni-setting-row');for(const [fill,label]of[['none','Outline'],['tint','Soft fill'],['solid','Solid fill']])fills.append(button(label,'rect',()=>{window.drawingCanvas.shapeFill=fill;window.toolPreferences.save();}));body.append(node('h2','Shape fill'),fills);
  }
  function showAllTools(){const body=sheet('Choose a tool');const grid=node('div',null,'omni-all-tools');for(const [id,label]of [...tools,['rounded-rect','Rounded box'],['triangle','Triangle'],['axes','XY axes'],['step-badge','Step badge'],['double-arrow','Dual arrow'],['bucket','Fill color']])grid.append(button(label,id,()=>{if(!actions.canEdit()){actions.paywall();return;}choose(id);actions.closeSheet();},'omni-tool'));body.append(grid);}
  function showMore(){
    const body=sheet('Your workspace');const list=node('div',null,'omni-menu-list');
    for(const [label,id,fn] of [['All drawing tools','layers',showAllTools],['Boards & export','board',actions.boards],['Class notes','text',()=>window.omniball.workspace.show('notes')],['Undo','undo',()=>editAction(()=>window.drawingCanvas.undo())],['Redo','redo',()=>editAction(()=>window.drawingCanvas.redo())],['Clear screen','clear',()=>editAction(()=>window.drawingCanvas.clear())],['Recording view','record',()=>{actions.closeSheet();document.getElementById('recording-options').click();}],['Customize controls','settings',showSettings],['Full version & purchases','spark',actions.paywall]])list.append(button(label,id,fn,'omni-menu-item'));
    if(Capacitor.getPlatform()!=='ios')list.prepend(button('Draw over other apps','layers',showOverlay,'omni-menu-item'));
    body.append(list);
  }
  function selectControl(body,label,id,values,currentValue,change){const wrap=node('label',label);const select=node('select');select.id=id;for(const [value,text]of values){const o=node('option',text);o.value=value;select.append(o);}select.value=String(currentValue);select.onchange=()=>{change(select.value);save();};wrap.append(select);body.append(wrap);}
  function showSettings(){
    const body=sheet('Make it yours');body.append(node('p','One small button. Your favorite tools, exactly where you need them.','muted'),node('h2','Quick tools'));
    const grid=node('div',null,'omni-favorite-grid');for(const [id,label]of tools){const l=node('label',null,'omni-checkbox');const input=node('input');input.type='checkbox';input.value=id;input.checked=settings.favorites.includes(id);input.onchange=()=>{if(input.checked&&settings.favorites.length>=6){input.checked=false;actions.toast('Choose up to six quick tools.');return;}if(!input.checked&&settings.favorites.length===1){input.checked=true;return;}settings.favorites=input.checked?[...settings.favorites,id]:settings.favorites.filter(x=>x!==id);save();};l.append(input,node('span',label));grid.append(l);}body.append(grid,node('h2','Floating button'));
    selectControl(body,'Icon','omni-icon',[['pen','Pen'],['spark','Spark'],['dot','Minimal dot'],['v','Vikashya V']],settings.icon,v=>settings.icon=v);
    selectControl(body,'Size','omni-size',[[44,'Small · 44'],[52,'Medium · 52'],[60,'Large · 60']],settings.size,v=>settings.size=Number(v));
    selectControl(body,'Dock edge','omni-side',[['right','Right'],['left','Left']],settings.side,v=>settings.side=v);
    const colorLabel=node('label','Accent color');const color=node('input');color.type='color';color.id='omni-accent';color.value=settings.color;color.oninput=()=>{settings.color=color.value;save();};colorLabel.append(color);body.append(colorLabel);
    const opacityLabel=node('label','Button opacity');const opacity=node('input');opacity.type='range';opacity.min=.55;opacity.max=1;opacity.step=.05;opacity.value=settings.opacity;opacity.oninput=()=>{settings.opacity=Number(opacity.value);save();};opacityLabel.append(opacity);body.append(opacityLabel);
    selectControl(body,'App orientation','omni-orientation',[['portrait','Portrait'],['landscape','Landscape'],['auto','Follow device']],settings.orientation,v=>settings.orientation=v);
    selectControl(body,'Background theme','omni-theme-mode',[['auto','Auto (White / Black)'],['light','White (Light)'],['dark','Black (Dark)']],localStorage.getItem('resuvika_theme_mode_v1')||'auto',v=>window.setAppTheme?.(v));
    selectControl(body,'Drawing input','omni-input-mode',[['both','Finger + stylus'],['stylus','Stylus only']],window.drawingCanvas.pencilOnly?'stylus':'both',v=>{settings.pencilOnly=v==='stylus';window.drawingCanvas.pencilOnly=settings.pencilOnly;window.toolPreferences.save();});
    const auto=node('label',null,'omni-checkbox');const check=node('input');check.type='checkbox';check.checked=settings.autoClose;check.onchange=()=>{settings.autoClose=check.checked;save();};auto.append(check,node('span','Close quick tools after choosing'));body.append(auto,node('p','Drag the floating button to move it. Large-screen Android devices and emulators can control orientation themselves; the tool palette stays compact in either layout.','muted'));
    if(nativeAndroid)body.append(button('Draw over apps setup','layers',showOverlay));
    body.append(button('Reset controls','undo',()=>{settings=normalizeSettings();save();showSettings();}));
  }
  async function showOverlay(){
    const body=sheet('Draw over other apps');body.append(node('p','Keep a small Omniball button above your apps. Choose a pen or shape to annotate, then tap the floating button to use the app underneath.'));
    if(!nativeAndroid){body.append(node('p','This mode requires the installed Android app. The whiteboard and quick tools work here.','status'));return;}
    const status=await FloatingOverlay.status();
    if(!body.isConnected)return;
    body.append(node('p',status.allowed?'Display over other apps is enabled.':'Android permission is needed before the floating tool can appear.','status'));
    if(!status.allowed)body.append(button('Allow display over other apps','layers',()=>FloatingOverlay.requestPermission(),'primary'));
    body.append(button(status.running?'Return to floating tools':'Start floating tools','pen',async()=>{
      if(!actions.canEdit()){actions.paywall();return;}
      await actions.persist();await actions.syncAccess();await FloatingOverlay.configure({settings});await FloatingOverlay.start();actions.closeSheet();
    },'primary'),button('Stop floating tools','close',async()=>{await FloatingOverlay.stop();actions.toast('Floating tools stopped.');}),button('Refresh permission status','redo',showOverlay),node('p','Start it here, then open another Android app. In BlueStacks, it draws over apps inside the emulator. Protected apps and Android system screens may hide overlays. No screen capture or Accessibility service is used.','muted'));
  }
  // The old tablet panel never reopens automatically, including after an upgrade or recording.
  document.getElementById('main-toolbar').setAttribute('aria-hidden','true');document.body.classList.add('menus-hidden','tablet-tools-hidden');
  window.restoreControls=()=>{document.body.classList.remove('recording-mode','recording-hide-brand','zen-mode');document.getElementById('recording-panel').classList.remove('show');close();};
  save();position();
  return {close,open,showSettings,showMore,showOverlay,getSettings:()=>({...settings}),nativeAndroid};
}
