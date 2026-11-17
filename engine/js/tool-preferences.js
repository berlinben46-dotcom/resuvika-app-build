'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const board=window.drawingCanvas;
  const key='resuvika_tool_preferences_v1';
  const tools=['pen','calligraphy','highlighter','laser','shape','bucket','text','eraser-stroke'];
  const shapes=[...document.querySelectorAll('.shape-opt')].map(button=>button.dataset.shape);
  function render(){
    document.querySelectorAll('.tool-btn[data-tool]').forEach(button=>button.classList.toggle('active',button.dataset.tool===board.activeTool));
    document.getElementById('shapes-dropdown-btn').classList.toggle('active',board.activeTool==='shape');
    const shape=document.querySelector(`.shape-opt[data-shape="${board.activeShape}"]`);
    document.querySelectorAll('.shape-opt').forEach(button=>button.classList.toggle('active',button===shape));
    if(shape){document.getElementById('active-shape-icon').textContent=shape.querySelector('.opt-icon').textContent;document.getElementById('active-shape-name').textContent=shape.textContent.trim().replace(shape.querySelector('.opt-icon').textContent,'').trim();}
    document.querySelectorAll('.fill-btn').forEach(button=>button.classList.toggle('active',button.dataset.fill===board.shapeFill));
    document.querySelectorAll('.color-swatch').forEach(button=>button.classList.toggle('active',button.dataset.color.toLowerCase()===board.currentColor.toLowerCase()));
    document.getElementById('custom-color-input').value=board.currentColor;
    document.getElementById('stroke-size-slider').value=board.currentSize;
    document.getElementById('size-val').textContent=board.currentSize+'px';
    const preview=document.getElementById('size-preview');preview.style.backgroundColor=board.currentColor;
    document.body.classList.toggle('text-tool-active',board.activeTool==='text');
    document.getElementById('touch-draw-mode')?.classList.toggle('active',!board.pencilOnly);
    document.getElementById('pencil-only-mode')?.classList.toggle('active',Boolean(board.pencilOnly));
  }
  function save(){
    try{localStorage.setItem(key,JSON.stringify({tool:board.activeTool,shape:board.activeShape,fill:board.shapeFill,color:board.currentColor,size:board.currentSize,pencilOnly:Boolean(board.pencilOnly)}));}catch{}
    render();
  }
  try{
    const saved=JSON.parse(localStorage.getItem(key)||'{}');
    if(tools.includes(saved.tool))board.activeTool=saved.tool;
    if(shapes.includes(saved.shape))board.activeShape=saved.shape;
    if(['none','tint','solid'].includes(saved.fill))board.shapeFill=saved.fill;
    if(/^#[a-f0-9]{6}$/i.test(saved.color))board.currentColor=saved.color;
    if(Number.isFinite(saved.size))board.currentSize=Math.min(50,Math.max(1,saved.size));
    board.pencilOnly=Boolean(saved.pencilOnly);
  }catch{}
  document.addEventListener('click',event=>{if(event.target.closest('.tool-btn,.shape-opt,.fill-btn,.color-swatch'))save();});
  document.getElementById('custom-color-input').addEventListener('input',save);
  document.getElementById('stroke-size-slider').addEventListener('input',save);
  document.getElementById('touch-draw-mode')?.addEventListener('click',()=>{board.pencilOnly=false;save();});
  document.getElementById('pencil-only-mode')?.addEventListener('click',()=>{board.pencilOnly=true;save();});
  window.toolPreferences={save,render};render();
});
