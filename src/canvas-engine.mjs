/**
 * High-DPI Infinite Vector Whiteboard Engine for Resuvika Notes Studio.
 * Supports infinite pan (zero bounds lockout), multi-page docs, pen, highlighter,
 * eraser, photo/diagram markup, and crisp vector text.
 */

export class WhiteboardEngine {
  constructor(bgCanvas, drawCanvas, onChange) {
    this.bgCanvas = bgCanvas;
    this.drawCanvas = drawCanvas;
    this.bgCtx = bgCanvas.getContext('2d');
    this.ctx = drawCanvas.getContext('2d');
    this.onChange = onChange;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.activeTool = 'pen'; // 'pen' | 'highlighter' | 'eraser-stroke' | 'pan'
    this.currentColor = '#0f172a';
    this.currentSize = 4;

    this.pages = [{ id: 'page-1', paper: 'dots', panX: 0, panY: 0, elements: [] }];
    this.activePageIndex = 0;
    this.redoStack = [];

    this.isDark = false;
    this.isDrawing = false;
    this.isPanning = false;
    this.activePointerId = null;
    this.activeTouches = new Map();
    this.panStart = null;
    this.currentStroke = null;
    this._imgCache = new Map();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindEvents();
  }

  get page() {
    if (!this.pages[this.activePageIndex]) {
      this.pages[this.activePageIndex] = { id: `page-${Date.now()}`, paper: 'dots', panX: 0, panY: 0, elements: [] };
    }
    return this.pages[this.activePageIndex];
  }

  setPages(pages, index = 0) {
    this.pages = Array.isArray(pages) && pages.length ? pages : [{ id: 'page-1', paper: 'dots', panX: 0, panY: 0, elements: [] }];
    this.activePageIndex = Math.max(0, Math.min(index, this.pages.length - 1));
    this.redoStack = [];
    this.renderAll();
  }

  setDarkTheme(isDark) {
    this.isDark = Boolean(isDark);
    if (this.currentColor === '#0f172a' && this.isDark) this.currentColor = '#f8fafc';
    else if (this.currentColor === '#f8fafc' && !this.isDark) this.currentColor = '#0f172a';
    this.renderAll();
  }

  setPaper(paper) {
    this.page.paper = paper || 'dots';
    this.renderBackground();
    this.onChange?.();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = this.drawCanvas.clientWidth || window.innerWidth;
    this.height = this.drawCanvas.clientHeight || window.innerHeight;
    for (const c of [this.bgCanvas, this.drawCanvas]) {
      c.width = Math.max(1, Math.round(this.width * this.dpr));
      c.height = Math.max(1, Math.round(this.height * this.dpr));
    }
    this.renderAll();
  }

  getPoint(e) {
    const rect = this.drawCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left - (this.page.panX || 0),
      y: e.clientY - rect.top - (this.page.panY || 0)
    };
  }

  bindEvents() {
    const el = this.drawCanvas;
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onCancel(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onDown(e) {
    if (!this.isDrawing && !this.isPanning) this.activePointerId = null;

    if (e.pointerType === 'touch') {
      if (e.isPrimary && !this.isPanning && !this.isDrawing) this.activeTouches.clear();
      this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activeTouches.size >= 2) {
        this.isDrawing = false;
        this.currentStroke = null;
        this.activePointerId = null;
        this.isPanning = true;
        const pts = [...this.activeTouches.values()];
        this.panStart = {
          cx: (pts[0].x + pts[1].x) / 2,
          cy: (pts[0].y + pts[1].y) / 2,
          panX: this.page.panX || 0,
          panY: this.page.panY || 0
        };
        return;
      }
    }

    if (this.activeTool === 'pan') {
      this.isPanning = true;
      this.activePointerId = e.pointerId;
      this.panStart = {
        cx: e.clientX,
        cy: e.clientY,
        panX: this.page.panX || 0,
        panY: this.page.panY || 0
      };
      try { this.drawCanvas.setPointerCapture(e.pointerId); } catch {}
      return;
    }

    if (this.activePointerId !== null) return;
    e.preventDefault?.();

    const pt = this.getPoint(e);
    this.isDrawing = true;
    this.activePointerId = e.pointerId;
    try { this.drawCanvas.setPointerCapture(e.pointerId); } catch {}

    if (this.activeTool === 'eraser-stroke') {
      this.eraseAt(pt.x, pt.y);
      return;
    }

    const isHighlighter = this.activeTool === 'highlighter';
    this.currentStroke = {
      type: 'stroke',
      tool: this.activeTool,
      color: this.currentColor,
      size: isHighlighter ? Math.max(16, this.currentSize * 3.5) : this.currentSize,
      alpha: isHighlighter ? 0.34 : 1,
      points: [pt]
    };
    this.renderDrawLayer();
  }

  onMove(e) {
    if (e.pointerType === 'touch' && this.activeTouches.has(e.pointerId)) {
      this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.isPanning && this.activeTouches.size >= 2 && this.panStart) {
        const pts = [...this.activeTouches.values()];
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        this.page.panX = this.panStart.panX + (cx - this.panStart.cx);
        this.page.panY = this.panStart.panY + (cy - this.panStart.cy);
        this.renderAll();
        return;
      }
    }

    if (this.isPanning && this.activeTool === 'pan' && this.panStart) {
      this.page.panX = this.panStart.panX + (e.clientX - this.panStart.cx);
      this.page.panY = this.panStart.panY + (e.clientY - this.panStart.cy);
      this.renderAll();
      return;
    }

    if (!this.isDrawing || e.pointerId !== this.activePointerId) return;
    const pt = this.getPoint(e);

    if (this.activeTool === 'eraser-stroke') {
      this.eraseAt(pt.x, pt.y);
      return;
    }

    if (this.currentStroke) {
      this.currentStroke.points.push(pt);
      this.renderDrawLayer();
    }
  }

  onUp(e) {
    if (e.pointerType === 'touch') {
      this.activeTouches.delete(e.pointerId);
      if (this.isPanning && this.activeTouches.size < 2 && this.activeTool !== 'pan') {
        this.isPanning = false;
        this.panStart = null;
        this.activePointerId = null;
        this.onChange?.();
        return;
      }
    }

    if (this.isPanning && this.activeTool === 'pan') {
      this.isPanning = false;
      this.panStart = null;
      this.activePointerId = null;
      this.onChange?.();
      return;
    }

    if (!this.isDrawing || e.pointerId !== this.activePointerId) return;
    this.isDrawing = false;
    this.activePointerId = null;

    if (this.currentStroke && this.currentStroke.points.length) {
      if (this.currentStroke.points.length === 1) {
        const p = this.currentStroke.points[0];
        this.currentStroke.points.push({ x: p.x + 0.5, y: p.y + 0.5 });
      }
      this.page.elements.push(this.currentStroke);
      this.redoStack = [];
      this.currentStroke = null;
      this.renderDrawLayer();
      this.onChange?.();
    }
  }

  onCancel(e) {
    this.activeTouches.delete(e.pointerId);
    this.isDrawing = false;
    this.isPanning = false;
    this.activePointerId = null;
    this.currentStroke = null;
    this.renderDrawLayer();
  }

  eraseAt(x, y) {
    const hitRadius = 18;
    const before = this.page.elements.length;
    this.page.elements = this.page.elements.filter((elem) => {
      if (elem.type === 'stroke') {
        return !elem.points.some((p) => Math.hypot(p.x - x, p.y - y) <= hitRadius + (elem.size || 4) / 2);
      }
      if (elem.type === 'text') {
        const w = (elem.text?.length || 1) * (elem.fontSize || 18) * 0.6;
        const h = elem.fontSize || 18;
        return !(x >= elem.x - 10 && x <= elem.x + w + 10 && y >= elem.y - h && y <= elem.y + 12);
      }
      if (elem.type === 'image') {
        return !(x >= elem.x && x <= elem.x + elem.width && y >= elem.y && y <= elem.y + elem.height);
      }
      return true;
    });
    if (this.page.elements.length !== before) {
      this.renderDrawLayer();
      this.onChange?.();
    }
  }

  addElement(elem) {
    this.page.elements.push(elem);
    this.redoStack = [];
    this.renderDrawLayer();
    this.onChange?.();
  }

  undo() {
    if (!this.page.elements.length) return false;
    this.redoStack.push(this.page.elements.pop());
    this.renderDrawLayer();
    this.onChange?.();
    return true;
  }

  clearPage() {
    if (!this.page.elements.length) return;
    this.page.elements = [];
    this.redoStack = [];
    this.renderDrawLayer();
    this.onChange?.();
  }

  addNewPage() {
    this.pages.splice(this.activePageIndex + 1, 0, {
      id: `page-${Date.now()}`,
      paper: this.page.paper || 'dots',
      panX: 0,
      panY: 0,
      elements: []
    });
    this.activePageIndex += 1;
    this.redoStack = [];
    this.renderAll();
    this.onChange?.();
  }

  prevPage() {
    if (this.activePageIndex <= 0) return;
    this.activePageIndex -= 1;
    this.redoStack = [];
    this.renderAll();
    this.onChange?.();
  }

  nextPage() {
    if (this.activePageIndex >= this.pages.length - 1) return;
    this.activePageIndex += 1;
    this.redoStack = [];
    this.renderAll();
    this.onChange?.();
  }

  renderAll() {
    this.renderBackground();
    this.renderDrawLayer();
  }

  renderBackground() {
    const ctx = this.bgCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);

    const paper = this.page.paper || 'dots';
    const isBlack = paper === 'black' || (this.isDark && paper !== 'white');
    ctx.fillStyle = isBlack ? '#000000' : '#ffffff';
    ctx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const ox = ((this.page.panX || 0) % 24 + 24) % 24;
    const oy = ((this.page.panY || 0) % 24 + 24) % 24;

    if (paper === 'dots') {
      ctx.fillStyle = isBlack ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.16)';
      for (let x = ox; x < this.width; x += 24) {
        for (let y = oy; y < this.height; y += 24) {
          ctx.beginPath();
          ctx.arc(x, y, 1.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (paper === 'grid' || paper === 'ruled') {
      ctx.strokeStyle = isBlack ? 'rgba(255,255,255,0.11)' : 'rgba(15,23,42,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const step = paper === 'ruled' ? 32 : 24;
      const sy = ((this.page.panY || 0) % step + step) % step;
      for (let y = sy; y < this.height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
      }
      if (paper === 'grid') {
        for (let x = ox; x < this.width; x += 24) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, this.height);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  renderDrawLayer() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);

    ctx.save();
    ctx.setTransform(
      this.dpr,
      0,
      0,
      this.dpr,
      (this.page.panX || 0) * this.dpr,
      (this.page.panY || 0) * this.dpr
    );

    for (const elem of this.page.elements) {
      this.drawElement(ctx, elem);
    }
    if (this.currentStroke) {
      this.drawElement(ctx, this.currentStroke);
    }
    ctx.restore();
  }

  drawElement(ctx, elem) {
    if (!elem) return;
    if (elem.type === 'stroke' && elem.points?.length) {
      ctx.save();
      ctx.globalAlpha = elem.alpha ?? 1;
      ctx.strokeStyle = elem.color || '#0f172a';
      ctx.lineWidth = elem.size || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(elem.points[0].x, elem.points[0].y);
      for (let i = 1; i < elem.points.length; i++) {
        const p0 = elem.points[i - 1];
        const p1 = elem.points[i];
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }
      const last = elem.points[elem.points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
      ctx.restore();
    } else if (elem.type === 'text' && elem.text) {
      ctx.save();
      ctx.fillStyle = elem.color || (this.isDark ? '#f8fafc' : '#0f172a');
      ctx.font = `${elem.bold ? '700' : '500'} ${elem.fontSize || 18}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(elem.text, elem.x || 24, elem.y || 80);
      ctx.restore();
    } else if (elem.type === 'image' && elem.src) {
      let img = this._imgCache.get(elem.src);
      if (!img) {
        img = new Image();
        img.onload = () => this.renderDrawLayer();
        img.src = elem.src;
        this._imgCache.set(elem.src, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.drawImage(img, elem.x || 0, elem.y || 0, elem.width || img.naturalWidth, elem.height || img.naturalHeight);
        ctx.restore();
      }
    }
  }

  exportPngDataUrl() {
    const out = document.createElement('canvas');
    out.width = this.bgCanvas.width;
    out.height = this.bgCanvas.height;
    const octx = out.getContext('2d');
    octx.drawImage(this.bgCanvas, 0, 0);
    octx.drawImage(this.drawCanvas, 0, 0);
    return out.toDataURL('image/png');
  }
}
