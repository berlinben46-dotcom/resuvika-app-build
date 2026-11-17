/**
 * Resuvika Omni Pen - Core Canvas & Vector Engine
 * Developed by Vikashya Resuvika Private Limited
 * 100% Royalty-Free & Zero-Cost Dependencies
 * High-DPI, Apple Pencil Pressure Sensitivity, Shapes with Full/Tint Fill, Paint Bucket & On-Screen Text
 */

class DrawingCanvas {
  constructor() {
    this.bgCanvas = document.getElementById('bg-canvas');
    this.drawCanvas = document.getElementById('draw-canvas');
    this.laserCanvas = document.getElementById('laser-canvas');
    this.screenVideo = document.getElementById('screen-video');
    this.liveCanvas=document.createElement('canvas');this.liveCanvas.id='live-canvas';
    this.drawCanvas.after(this.liveCanvas);this.liveCtx=this.liveCanvas.getContext('2d');

    this.bgCtx = this.bgCanvas.getContext('2d');
    this.ctx = this.drawCanvas.getContext('2d');
    this.laserCtx = this.laserCanvas.getContext('2d');

    // Drawing state
    this.activeTool = 'pen'; // 'pen', 'calligraphy', 'highlighter', 'laser', 'shape', 'bucket', 'text', 'eraser-stroke'
    this.activeShape = 'rect'; // 'rect', 'rounded-rect', 'circle', 'line', 'arrow', 'double-arrow', 'triangle', 'right-triangle', 'star', 'axes', 'step-badge'
    this.shapeFill = 'none'; // 'none', 'tint', 'solid'
    this.currentColor = '#ef4444';
    this.currentSize = 4;
    this.textFontSize = Math.min(240, Math.max(8, Number(localStorage.getItem('omniball_text_size')) || 32));
    this.textEditor = null;
    this.currentBackground = 'transparent'; // 'transparent', 'whiteboard', 'blackboard', 'chalkboard', 'grid'
    this.stepCounter = 1;

    // Elements stack for vector rendering and undo/redo
    this.elements = [];
    this.redoStack = [];

    // Pointer drawing state
    this.isDrawing = false;
    this.activePointerId = null;
    this.activePointerType = null;
    this.currentStroke = null;

    // Laser pointer decay trail
    this.laserTrail = [];
    this.isLaserActive = false;
    this.pencilOnly = false;

    this.initCanvasSize();
    this.bindEvents();
    this.renderBackground();
    this.startLaserAnimationLoop();
  }

  setBoardSize(width, height) {
    this.boardWidth = Number(width) || 1440; this.boardHeight = Number(height) || 900;
    this.initCanvasSize();
  }
  initCanvasSize() {
    this.dpr = window.devicePixelRatio || 1;
    this.width = this.boardWidth || window.innerWidth;
    this.height = this.boardHeight || window.innerHeight;
    this.boardScale = Math.min(window.innerWidth / this.width, window.innerHeight / this.height);
    this.offsetX = (window.innerWidth - this.width * this.boardScale) / 2;
    this.offsetY = (window.innerHeight - this.height * this.boardScale) / 2;
    [this.bgCanvas, this.drawCanvas, this.liveCanvas,this.laserCanvas].forEach(canvas => {
      canvas.width = Math.round(window.innerWidth * this.dpr); canvas.height = Math.round(window.innerHeight * this.dpr);
      canvas.style.width = window.innerWidth + 'px'; canvas.style.height = window.innerHeight + 'px';
    });
    for (const ctx of [this.bgCtx, this.ctx, this.liveCtx,this.laserCtx]) {
      ctx.setTransform(this.dpr * this.boardScale, 0, 0, this.dpr * this.boardScale, this.offsetX * this.dpr, this.offsetY * this.dpr);
    }
    this.redrawAllElements(); this.renderBackground(); this.refreshTextEditor?.();
    this.renderLivePreviews();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.initCanvasSize());
    window.visualViewport?.addEventListener('resize', () => this.initCanvasSize());

    this.drawCanvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.drawCanvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.drawCanvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.drawCanvas.addEventListener('pointercancel', (e) => this.cancelPointer(e));
    this.drawCanvas.addEventListener('lostpointercapture', (e) => {if(this.isDrawing)this.cancelPointer(e);});

    this.drawCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  getPointerCoords(e) {
    const rect = this.drawCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offsetX) / this.boardScale,
      y: (e.clientY - rect.top - this.offsetY) / this.boardScale,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      type: e.pointerType || 'mouse'
    };
  }

  onPointerDown(e) {
    if(this.pencilOnly && e.pointerType==='touch')return;
    if(this.activePointerId!==null)return;
    e.preventDefault?.();
    // Palm rejection: if pencil active, ignore touch
    if (this.activePointerId !== null && this.activePointerType === 'pen' && e.pointerType !== 'pen') {
      return;
    }

    const pt = this.getPointerCoords(e);
    if (pt.x < 0 || pt.y < 0 || pt.x > this.width || pt.y > this.height) return;

    // 1. ON-SCREEN TEXT TOOL: Click anywhere on screen to type directly!
    if (this.activeTool === 'text') {
      const existingText = [...this.elements].reverse().find(elem => elem.type === 'text' && this.isHit(elem, pt.x, pt.y, 0));
      this.createOnScreenTextInput(existingText ? existingText.x : pt.x, existingText ? existingText.y - existingText.fontSize : pt.y, existingText);
      this.isDrawing = false;
      return;
    }

    // 2. PAINT BUCKET FILL TOOL: Click any drawn shape to fill it with color!
    if (this.activeTool === 'bucket') {
      this.fillShapeAt(pt.x, pt.y);
      this.isDrawing = false;
      return;
    }

    // 3. STEP BADGE TOOL: 1-click auto-increment badge ① ② ③
    if (this.activeTool === 'shape' && this.activeShape === 'step-badge') {
      const badgeElem = {
        type: 'step-badge',
        x: pt.x,
        y: pt.y,
        number: this.stepCounter++,
        color: this.currentColor,
        size: Math.max(this.currentSize * 4, 28)
      };
      this.addElement(badgeElem);
      this.isDrawing = false;
      return;
    }

    // 4. STROKE ERASER TOOL: Click line or shape to delete
    if (this.activeTool === 'eraser-stroke') {
      this.isDrawing=true;this.activePointerId=e.pointerId;this.activePointerType=e.pointerType;
      try{this.drawCanvas.setPointerCapture(e.pointerId);}catch{}
      this.eraseElementAt(pt.x, pt.y);
      return;
    }

    // 5. LASER POINTER TOOL
    if (this.activeTool === 'laser') {
      this.isLaserActive = true;
      this.activePointerId=e.pointerId;this.activePointerType=e.pointerType;
      try{this.drawCanvas.setPointerCapture(e.pointerId);}catch{}
      this.addLaserPoint(pt.x, pt.y);
      if (window.syncManager) {
        window.syncManager.broadcastLaser(pt.x, pt.y);
      }
      return;
    }

    // Standard drawing & shapes
    this.isDrawing = true;
    this.activePointerId = e.pointerId;
    this.activePointerType = e.pointerType;
    try {
      this.drawCanvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    if (this.activeTool === 'pen' || this.activeTool === 'calligraphy' || this.activeTool === 'highlighter') {
      this.currentStroke = {
        type: 'stroke',
        tool: this.activeTool,
        color: this.currentColor,
        size: this.currentSize,
        points: [pt]
      };
      if (window.syncManager) {
        window.syncManager.broadcastStrokeStart(this.currentStroke);
      }
    } else if (this.activeTool === 'shape') {
      this.currentStroke = {
        type: 'shape',
        shape: this.activeShape,
        fill: this.shapeFill, // Captures current fill mode (none, tint, solid)
        color: this.currentColor,
        size: this.currentSize,
        startX: pt.x,
        startY: pt.y,
        endX: pt.x,
        endY: pt.y
      };
    }
  }

  onPointerMove(e) {
    if(this.pencilOnly && e.pointerType==='touch')return;
    if(this.activeTool==='laser'&&!this.isLaserActive)return;
    if (!this.isDrawing && this.activeTool !== 'laser') return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    const pt = this.getPointerCoords(e);

    // Laser pointer
    if (this.activeTool === 'laser') {
      this.addLaserPoint(pt.x, pt.y);
      if (window.syncManager) {
        window.syncManager.broadcastLaser(pt.x, pt.y);
      }
      return;
    }

    // Stroke eraser dragging
    if (this.activeTool === 'eraser-stroke') {
      this.eraseElementAt(pt.x, pt.y);
      return;
    }

    if (!this.currentStroke) return;

    if (this.currentStroke.type === 'stroke') {
      const samples=e.getCoalescedEvents?.();
      const points=samples?.length?samples.map(sample=>this.getPointerCoords(sample)):[pt];
      for(const point of points){
        this.currentStroke.points.push(point);
        this.drawLiveStrokeSegment(this.liveCtx,this.currentStroke);
        window.syncManager?.broadcastStrokePoint(point);
      }
    } else if (this.currentStroke.type === 'shape') {
      this.currentStroke.endX = pt.x;
      this.currentStroke.endY = pt.y;
      this.scheduleLivePreview();
      window.syncManager?.broadcastShapePreview(this.currentStroke);
    }
  }

  onPointerUp(e) {
    if(this.activePointerId!==null&&e.pointerId!==this.activePointerId)return;
    if (!this.isDrawing && this.activeTool !== 'laser') return;
    const pointerId=this.activePointerId;this.isDrawing=false;this.activePointerId=null;this.activePointerType=null;

    try {
      this.drawCanvas.releasePointerCapture(pointerId);
    } catch (_) {}

    this.isDrawing = false;
    this.activePointerId = null;

    if (this.activeTool === 'laser') {
      this.isLaserActive = false;
      return;
    }

    if (this.currentStroke) {
      if (this.currentStroke.type === 'stroke' && this.currentStroke.points.length > 0) {
        this.addElement(this.currentStroke);
        if (window.syncManager) {
          window.syncManager.broadcastStrokeEnd();
        }
      } else if (this.currentStroke.type === 'shape') {
        this.addElement(this.currentStroke);
      }
      this.currentStroke = null;
      this.renderLivePreviews();
    }
  }

  cancelPointer(e) {
    if(this.activePointerId!==null && e.pointerId!==this.activePointerId)return;
    const pointerId=this.activePointerId;
    this.isDrawing=false;this.isLaserActive=false;this.activePointerId=null;this.activePointerType=null;this.currentStroke=null;
    try{this.drawCanvas.releasePointerCapture(pointerId);}catch{}
    window.syncManager?.broadcastStrokeEnd();this.renderLivePreviews();
  }

  /**
   * ON-SCREEN TEXT TOOL: Write anywhere on screen like a pen
   */
  setTextFontSize(value) {
    this.textFontSize = Math.min(240, Math.max(8, Math.round(Number(value) || 32)));
    localStorage.setItem('omniball_text_size', String(this.textFontSize));
    this.refreshTextEditor();
  }
  refreshTextEditor() {
    if (!this.textEditor) return;
    const { wrap, textarea, x, y } = this.textEditor;
    wrap.style.left = Math.min(window.innerWidth - 170, Math.max(0, this.offsetX + x * this.boardScale)) + 'px';
    wrap.style.top = Math.min(window.innerHeight - 130, Math.max(0, this.offsetY + y * this.boardScale)) + 'px';
    wrap.style.maxWidth = Math.max(170, window.innerWidth - parseFloat(wrap.style.left) - 12) + 'px';
    textarea.style.fontSize = this.textFontSize * this.boardScale + 'px';
    textarea.style.height = 'auto'; textarea.style.height = Math.min(window.innerHeight * .6, textarea.scrollHeight + 4) + 'px';
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    textarea.style.maxHeight = Math.max(70, viewportHeight * .5) + 'px';
    wrap.style.top = Math.max(8, Math.min(parseFloat(wrap.style.top), viewportHeight - wrap.offsetHeight - 82)) + 'px';
  }
  createOnScreenTextInput(x, y, existingText = null) {
    this.textEditor?.commit();
    if (existingText) this.setTextFontSize(existingText.fontSize);
    document.getElementById('text-font-size').value = this.textFontSize;
    const wrap = document.createElement('div'); wrap.id = 'active-screen-text-input'; wrap.className = 'screen-text-editor';
    const textarea = document.createElement('textarea'); textarea.rows = 1;
    textarea.placeholder = 'Type text…'; textarea.value = existingText?.text || '';
    textarea.style.color = existingText?.color || this.currentColor;
    const actions = document.createElement('div'); actions.className = 'text-edit-actions';
    const done = document.createElement('button'); done.textContent = 'Done'; done.type = 'button';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.type = 'button';
    actions.append(done, cancel); wrap.append(textarea, actions); document.body.append(wrap);
    let finished = false;
    const cleanup = () => { finished = true; document.removeEventListener('pointerdown', outside); wrap.remove(); this.textEditor = null; };
    const commit = () => {
      if (finished) return;
      const text = textarea.value.trim();
      if (text) {
        const element = { type: 'text', text, x, y: y + this.textFontSize, color: textarea.style.color, fontSize: this.textFontSize };
        if (existingText && this.elements.includes(existingText)) {
          Object.assign(existingText, element); this.redrawAllElements(); window.syncManager?.broadcastUpdateElements(this.elements);
        } else this.addElement(element);
      }
      cleanup();
    };
    const outside = event => {
      if (!wrap.contains(event.target) && !event.target.closest('#text-controls')) commit();
    };
    done.onclick = commit; cancel.onclick = cleanup;
    textarea.oninput = () => this.refreshTextEditor();
    textarea.onkeydown = event => {
      if (event.isComposing) return;
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commit(); }
      if (event.key === 'Escape') { event.preventDefault(); cleanup(); }
    };
    this.textEditor = { wrap, textarea, x, y, commit, cancel:cleanup };
    this.refreshTextEditor(); textarea.focus();
    // Use the next event turn so opening the editor cannot immediately commit it.
    setTimeout(() => { if (!finished) document.addEventListener('pointerdown', outside); }, 0);
  }

  fillShapeAt(x, y) {
    const hitRadius = Math.max(this.currentSize * 2, 20);
    // Find clicked shape (from top of stack down)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const elem = this.elements[i];
      if (elem.type === 'shape') {
        if (this.isHit(elem, x, y, hitRadius)) {
          // If shape has no fill, apply solid fill; if already has fill, cycle or match current fill mode
          elem.fill = this.shapeFill === 'none' ? 'solid' : this.shapeFill;
          elem.color = this.currentColor;
          this.redrawAllElements();
          if (window.syncManager) {
            window.syncManager.broadcastUpdateElements(this.elements);
          }
          showToast(`🪣 Shape filled with ${elem.color} (${elem.fill})!`);
          return;
        }
      }
    }
    showToast('Click directly on a shape (rectangle, circle, star) to fill it');
  }

  /**
   * Element Management
   */
  addElement(element, isRemote = false) {
    if (!element.id) element.id = globalThis.crypto?.randomUUID?.() || 'e-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    if (this.elements.some(item => item.id === element.id)) return;
    this.elements.push(element);
    this.redoStack = [];
    this.renderElement(this.ctx,element);

    if (!isRemote && window.syncManager) {
      window.syncManager.broadcastAddElement(element);
    }
  }

  eraseElementAt(x, y) {
    const hitRadius = Math.max(this.currentSize * 2, 18);
    const index = this.elements.findIndex(elem => this.isHit(elem, x, y, hitRadius));
    if (index !== -1) {
      const removed = this.elements.splice(index, 1)[0];
      this.redrawAllElements();
      if (window.syncManager) {
        window.syncManager.broadcastUpdateElements(this.elements);
      }
      return removed;
    }
    return null;
  }

  isHit(elem, x, y, radius) {
    if (elem.type === 'stroke') {
      return elem.points.some(p => Math.hypot(p.x - x, p.y - y) <= radius + elem.size);
    } else if (elem.type === 'shape' || elem.type === 'step-badge') {
      const minX = Math.min(elem.startX || elem.x, elem.endX || elem.x) - radius;
      const maxX = Math.max(elem.startX || elem.x, elem.endX || elem.x) + radius;
      const minY = Math.min(elem.startY || elem.y, elem.endY || elem.y) - radius;
      const maxY = Math.max(elem.startY || elem.y, elem.endY || elem.y) + radius;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    } else if (elem.type === 'text') {
      const lines = elem.text.split('\n');
      this.ctx.save(); this.ctx.font = '600 ' + elem.fontSize + 'px "Segoe UI", Arial, sans-serif';
      const width = Math.max(...lines.map(line => this.ctx.measureText(line).width)); this.ctx.restore();
      return x >= elem.x - 6 && x <= elem.x + width + 6 && y >= elem.y - elem.fontSize && y <= elem.y + (lines.length - 1) * elem.fontSize * 1.25 + 6;
    } else if (elem.type === 'sticky') {
      return x >= elem.x && x <= elem.x + (elem.width || 240) && y >= elem.y && y <= elem.y + (elem.height || 160);
    }
    return false;
  }

  redrawAllElements() {
    this.clearLayer(this.ctx,this.drawCanvas);
    for (const elem of this.elements) {
      this.renderElement(this.ctx, elem);
    }
  }

  clearLayer(ctx,canvas){
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();
  }
  scheduleLivePreview(){
    if(this.previewFrame)return;
    this.previewFrame=requestAnimationFrame(()=>{this.previewFrame=null;this.renderLivePreviews();});
  }
  renderLivePreviews(){
    if(!this.liveCtx)return;
    this.clearLayer(this.liveCtx,this.liveCanvas);
    if(this.currentStroke)this.renderElement(this.liveCtx,this.currentStroke);
    for(const preview of window.syncManager?.remoteStrokes?.values()||[])this.renderElement(this.liveCtx,preview);
  }

  renderElement(ctx, elem) {
    if (elem.type === 'stroke') {
      this.renderStroke(ctx, elem);
    } else if (elem.type === 'shape') {
      this.renderShape(ctx, elem);
    } else if (elem.type === 'step-badge') {
      this.renderStepBadge(ctx, elem);
    } else if (elem.type === 'text') {
      this.renderTextElement(ctx, elem);
    } else if (elem.type === 'sticky') {
      this.renderStickyNote(ctx, elem);
    }
  }

  renderStroke(ctx, stroke) {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;

    ctx.save();
    ctx.lineCap = stroke.tool === 'calligraphy' ? 'square' : 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = stroke.size * 3.5;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = stroke.size;
    }

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      
      if (pts[i].type === 'pen' && pts[i].pressure) {
        ctx.lineWidth = Math.max(stroke.size * pts[i].pressure * 1.5, 1);
      }
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }

    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  }

  drawLiveStrokeSegment(ctx, stroke) {
    const pts = stroke.points;
    const len = pts.length;
    if (len < 2) return;

    ctx.save();
    ctx.lineCap = stroke.tool === 'calligraphy' ? 'square' : 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = stroke.size * 3.5;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = stroke.size;
    }

    const p1 = pts[len - 2];
    const p2 = pts[len - 1];

    if (p2.type === 'pen' && p2.pressure) {
      ctx.lineWidth = Math.max(stroke.size * p2.pressure * 1.5, 1);
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  getTintFillColor(hex, alpha = 0.28) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Fixed Shapes Rendering with Instant Fill Support
   */
  renderShape(ctx, shape) {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const sx = shape.startX;
    const sy = shape.startY;
    const ex = shape.endX;
    const ey = shape.endY;

    if (shape.fill === 'solid') {
      ctx.fillStyle = shape.color;
    } else if (shape.fill === 'tint') {
      ctx.fillStyle = this.getTintFillColor(shape.color, 0.28);
    }

    const hasFill = shape.fill && shape.fill !== 'none';

    switch (shape.shape) {
      case 'rect': {
        const x = Math.min(sx, ex);
        const y = Math.min(sy, ey);
        const w = Math.abs(ex - sx);
        const h = Math.abs(ey - sy);
        if (hasFill) ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        break;
      }

      case 'rounded-rect': {
        const x = Math.min(sx, ex);
        const y = Math.min(sy, ey);
        const w = Math.abs(ex - sx);
        const h = Math.abs(ey - sy);
        const r = Math.min(16, w / 4, h / 4);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        if (hasFill) ctx.fill();
        ctx.stroke();
        break;
      }

      case 'circle': {
        const radiusX = Math.abs(ex - sx) / 2;
        const radiusY = Math.abs(ey - sy) / 2;
        const centerX = Math.min(sx, ex) + radiusX;
        const centerY = Math.min(sy, ey) + radiusY;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        if (hasFill) ctx.fill();
        ctx.stroke();
        break;
      }

      case 'line': {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        break;
      }

      case 'arrow': {
        this.drawArrow(ctx, sx, sy, ex, ey, shape.color, shape.size, false);
        break;
      }

      case 'double-arrow': {
        this.drawArrow(ctx, sx, sy, ex, ey, shape.color, shape.size, true);
        break;
      }

      case 'triangle': {
        ctx.beginPath();
        ctx.moveTo((sx + ex) / 2, sy);
        ctx.lineTo(ex, ey);
        ctx.lineTo(sx, ey);
        ctx.closePath();
        if (hasFill) ctx.fill();
        ctx.stroke();
        break;
      }

      case 'right-triangle': {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, ey);
        ctx.lineTo(ex, ey);
        ctx.closePath();
        if (hasFill) ctx.fill();
        ctx.stroke();
        break;
      }

      case 'star': {
        const cx = (sx + ex) / 2;
        const cy = (sy + ey) / 2;
        const r = Math.hypot(ex - sx, ey - sy) / 2;
        this.drawStar(ctx, cx, cy, 5, r, r / 2.2);
        if (hasFill) ctx.fill();
        ctx.stroke();
        break;
      }

      case 'axes': {
        this.drawArrow(ctx, sx, ey, ex, ey, shape.color, shape.size, false);
        this.drawArrow(ctx, sx, ey, sx, sy, shape.color, shape.size, false);
        ctx.font = '12px ' + 'monospace';
        ctx.fillStyle = shape.color;
        ctx.fillText('(0,0)', sx - 24, ey + 18);
        break;
      }
    }

    ctx.restore();
  }

  drawArrow(ctx, fromX, fromY, toX, toY, color, size, doubleSided = false) {
    const headLen = Math.max(size * 3.5, 12);
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    if (doubleSided) {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(fromX + headLen * Math.cos(angle - Math.PI / 6), fromY + headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(fromX + headLen * Math.cos(angle + Math.PI / 6), fromY + headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }
  }

  drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  renderStepBadge(ctx, badge) {
    ctx.save();
    const radius = badge.size / 2;

    ctx.beginPath();
    ctx.arc(badge.x, badge.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = badge.color;
    ctx.shadowColor = badge.color;
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(radius * 1.1)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge.number, badge.x, badge.y);
    ctx.restore();
  }

  renderTextElement(ctx, elem) {
    ctx.save();
    ctx.font = `600 ${elem.fontSize}px Arial, sans-serif`;
    ctx.fillStyle = elem.color;
    // Support multiline text
    const lines = elem.text.split('\n');
    lines.forEach((line, idx) => {
      ctx.fillText(line, elem.x, elem.y + (idx * (elem.fontSize * 1.25)));
    });
    ctx.restore();
  }

  renderStickyNote(ctx, sticky) {
    ctx.save();
    const w = sticky.width || 240;
    const h = sticky.height || 160;

    ctx.fillStyle = sticky.bg || '#fef08a';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.roundRect(sticky.x, sticky.y, w, h, 8);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(sticky.x + w / 2, sticky.y + 12, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.font = '13px Arial, sans-serif';
    const lines = sticky.text.split('\n').slice(0, 7);
    lines.forEach((line, i) => {
      ctx.fillText(line, sticky.x + 14, sticky.y + 36 + i * 18, w - 28);
    });

    ctx.restore();
  }

  addLaserPoint(x, y) {
    this.laserTrail.push({
      x,
      y,
      alpha: 1.0,
      radius: Math.max(this.currentSize * 2, 8),
      time: Date.now()
    });
  }

  startLaserAnimationLoop() {
    const loop = () => {
      this.clearLayer(this.laserCtx,this.laserCanvas);

      if (this.laserTrail.length > 0) {
        for (let i = 0; i < this.laserTrail.length; i++) {
          const pt = this.laserTrail[i];
          pt.alpha -= 0.035;

          if (pt.alpha > 0) {
            this.laserCtx.save();
            this.laserCtx.beginPath();
            this.laserCtx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
            this.laserCtx.fillStyle = `rgba(239, 68, 68, ${pt.alpha})`;
            this.laserCtx.shadowColor = '#ef4444';
            this.laserCtx.shadowBlur = 14;
            this.laserCtx.fill();
            this.laserCtx.restore();
          }
        }
        this.laserTrail = this.laserTrail.filter(p => p.alpha > 0);
      }

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setBackground(mode, isRemote = false) {
    this.currentBackground = mode;
    this.renderBackground();

    if (!isRemote && window.syncManager) {
      window.syncManager.broadcastSetBackground(mode);
    }
  }

  renderBackground() {
    this.bgCtx.clearRect(0, 0, this.width, this.height);

    switch (this.currentBackground) {
      case 'transparent':
        break;

      case 'whiteboard':
        this.bgCtx.fillStyle = '#ffffff';
        this.bgCtx.fillRect(0, 0, this.width, this.height);
        break;

      case 'blackboard':
        this.bgCtx.fillStyle = '#0f172a';
        this.bgCtx.fillRect(0, 0, this.width, this.height);
        break;

      case 'chalkboard':
        this.bgCtx.fillStyle = '#143b2f';
        this.bgCtx.fillRect(0, 0, this.width, this.height);
        break;

      case 'grid': {
        this.bgCtx.fillStyle = '#f8fafc';
        this.bgCtx.fillRect(0, 0, this.width, this.height);
        this.bgCtx.strokeStyle = '#e2e8f0';
        this.bgCtx.lineWidth = 1;
        const gridSize = 28;
        for (let x = 0; x < this.width; x += gridSize) {
          this.bgCtx.beginPath();
          this.bgCtx.moveTo(x, 0);
          this.bgCtx.lineTo(x, this.height);
          this.bgCtx.stroke();
        }
        for (let y = 0; y < this.height; y += gridSize) {
          this.bgCtx.beginPath();
          this.bgCtx.moveTo(0, y);
          this.bgCtx.lineTo(this.width, y);
          this.bgCtx.stroke();
        }
        break;
      }
    }
  }

  undo(isRemote = false) {
    if(!this.elements.length&&this.clearUndo?.length){
      this.elements=this.clearUndo;this.clearUndo=null;this.redoStack=[];this.redrawAllElements();
      if(!isRemote)window.syncManager?.broadcastUpdateElements(this.elements);return;
    }
    if (this.elements.length > 0) {
      const popped = this.elements.pop();
      this.redoStack.push(popped);
      this.redrawAllElements();
      if (!isRemote && window.syncManager) {
        window.syncManager.broadcastUpdateElements(this.elements);
      }
    }
  }

  redo(isRemote = false) {
    if (this.redoStack.length > 0) {
      const item = this.redoStack.pop();
      this.elements.push(item);
      this.redrawAllElements();
      if (!isRemote && window.syncManager) {
        window.syncManager.broadcastUpdateElements(this.elements);
      }
    }
  }

  clear(isRemote = false) {
    if(this.elements.length){this.clearUndo=[...this.elements];this.redoStack=[];}
    const pointerId=this.activePointerId;
    this.elements=[];this.currentStroke=null;this.isDrawing=false;this.activePointerId=null;this.isLaserActive=false;
    this.stepCounter=1;this.laserTrail=[];this.textEditor?.cancel();
    try{this.drawCanvas.releasePointerCapture(pointerId);}catch{}
    if(this.previewFrame){cancelAnimationFrame(this.previewFrame);this.previewFrame=null;}
    window.syncManager?.clearTransient();
    this.clearLayer(this.ctx,this.drawCanvas);this.clearLayer(this.liveCtx,this.liveCanvas);this.clearLayer(this.laserCtx,this.laserCanvas);
    if(!isRemote)window.syncManager?.broadcastClear();
  }
}

window.DrawingCanvas = DrawingCanvas;
