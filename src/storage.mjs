export const LIBRARY_KEY = 'resuvika_mobile_library_v1';
export function validateDocument(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (data?.format !== 'resuvika-mobile-board' || data.version !== 1 || !Array.isArray(data.elements) ||
      data.elements.length > 30000 || !Number.isFinite(data.width) || !Number.isFinite(data.height) ||
      data.width < 100 || data.width > 10000 || data.height < 100 || data.height > 10000) {
    throw new Error('This is not a supported Resuvika board backup.');
  }
  const backgrounds = new Set(['whiteboard', 'blackboard', 'chalkboard', 'grid']);
  if (!backgrounds.has(data.background)) throw new Error('Unsupported board background.');
  if(data.title!=null&&(typeof data.title!=='string'||data.title.length>120))throw new Error('Invalid board title.');
  const number=value=>Number.isFinite(value)&&Math.abs(value)<=100000;
  const shapes=new Set(['rect','rounded-rect','circle','line','arrow','double-arrow','triangle','right-triangle','star','axes']);
  const safe = data.elements.every(e => {
    if(!e||typeof e!=='object')return false;
    if(e.type==='sticky')return number(e.x)&&number(e.y)&&Number.isFinite(e.width)&&e.width>0&&e.width<=10000&&Number.isFinite(e.height)&&e.height>0&&e.height<=10000&&typeof e.text==='string'&&e.text.length<=100000&&typeof e.bg==='string'&&e.bg.length<=100;
    if(typeof e.color!=='string'||e.color.length>100)return false;
    if(e.type==='stroke')return Number.isFinite(e.size)&&e.size>0&&e.size<=500&&Array.isArray(e.points)&&e.points.length>0&&e.points.length<=100000&&e.points.every(p=>p&&number(p.x)&&number(p.y));
    if(e.type==='shape')return shapes.has(e.shape)&&['startX','startY','endX','endY'].every(k=>number(e[k]))&&Number.isFinite(e.size)&&e.size>0&&e.size<=500;
    if(e.type==='text')return typeof e.text==='string'&&e.text.length<=100000&&number(e.x)&&number(e.y)&&Number.isFinite(e.fontSize)&&e.fontSize>=8&&e.fontSize<=240;
    if(e.type==='step-badge')return number(e.x)&&number(e.y)&&number(e.number)&&Number.isFinite(e.size)&&e.size>0&&e.size<=1000;
    return false;
  });
  if (!safe) throw new Error('The backup contains invalid drawing data.');
  if (data.notes && (!Array.isArray(data.notes.tabs) || data.notes.tabs.length > 100 ||
      !data.notes.tabs.every(t => typeof t.id === 'string' && typeof t.title === 'string' && typeof t.content === 'string'))) {
    throw new Error('The backup contains invalid notes.');
  }
  return data;
}
export function snapshot(board, notes, title = 'Untitled board') {
  return { format: 'resuvika-mobile-board', version: 1, title: title.slice(0, 120), updatedAt: Date.now(),
    width: board.width, height: board.height, background: board.currentBackground,
    elements: structuredClone(board.elements), notes: { tabs: structuredClone(notes.tabs), activeTabId: notes.activeTabId, fontSize: notes.fontSize } };
}
