/**
 * Vikashya OmniDraw Studio - UI Controller & Electron IPC Integration
 * Developed by Vikashya Resuvika Private Limited
 */

document.addEventListener('DOMContentLoaded', () => {
  window.drawingCanvas = new DrawingCanvas();
  window.classNotepad = new ClassNotepad();
  window.syncManager = new SyncManager();

  initToolbarDrag();
  initInteractionMode(); // Draw vs Mouse Pass-Through
  initToolSelection();
  initShapeFillSelector(); // Direct Shape Fill Options
  initColorAndStroke();
  initTextControls();
  initBackdropModes();
  initExportMenu();
  initPairModal();
  initAboutModal();
  initZenMode();
  initDesktopWindowControls();
  initHotkeys();
  initElectronIPCBridge();
  initLicenseBadge();
});

function initLicenseBadge(){
  if(!window.electronAPI)return;
  const dock=document.getElementById('top-quick-dock');if(!dock)return;
  const button=document.createElement('button');button.id='btn-license';button.className='dock-pill-btn';
  button.addEventListener('click',async()=>{await window.electronAPI.manageLicense();await refresh();});
  dock.insertBefore(button,dock.firstChild);
  async function refresh(){
    const status=await window.electronAPI.licenseStatus();
    button.textContent=status.isTrial?'Trial · '+Math.max(0,Math.ceil((status.trial.expiresAt-Date.now())/86400000))+' days left':status.active?'License active':'Enter license key';
    button.title=status.active?'Valid until '+new Date(status.license.expiresAt).toLocaleString()+' — click to enter or renew a key':status.message;
  }
  refresh();setInterval(refresh,60000);
}

// Toast notification helper
function showToast(msg, duration = 2800) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}
window.showToast = showToast;

/**
 * FAST INTERACTION MODE: Draw vs Mouse (Pass-Through)
 * Solves: "its not interswitching quiclkly between pencil note and screen... it stopped showing pencil"
 */
function initInteractionMode() {
  const btnDraw = document.getElementById('btn-mode-draw');
  const btnMouse = document.getElementById('btn-mode-mouse');
  if (!btnDraw || !btnMouse) return;
  const toolbar = document.getElementById('main-toolbar');
  const notepad = document.getElementById('floating-notepad');

  const setDrawMode = () => {
    btnDraw.classList.add('active');
    btnMouse.classList.remove('active');
    if (window.electronAPI) {
      window.electronAPI.setClickThrough(false);
    }
    showToast('✏️ Draw Mode: Click and draw anywhere on screen');
  };

  const setMouseMode = () => {
    btnMouse.classList.add('active');
    btnDraw.classList.remove('active');
    if (window.electronAPI) {
      window.electronAPI.setClickThrough(true);
    }
    showToast('🖱️ Mouse Mode: Click & control PowerPoint/Chrome underneath! (Alt+D to draw)', 3200);
  };

  btnDraw.addEventListener('click', setDrawMode);
  btnMouse.addEventListener('click', setMouseMode);

  window.toggleDrawMouseMode = () => {
    if (btnMouse.classList.contains('active')) {
      setDrawMode();
    } else {
      setMouseMode();
    }
  };

  // Ensure toolbar and notepad remain clickable even in pass-through mode
  [toolbar, notepad, document.getElementById('top-quick-dock'), document.getElementById('pair-modal'), document.getElementById('about-modal'), document.getElementById('text-controls')].forEach(elem => {
    if (!elem) return;
    elem.addEventListener('pointerenter', () => {
      if (window.electronAPI) {
        window.electronAPI.setIgnoreMouseEvents(false);
      }
    });
    elem.addEventListener('pointerleave', () => {
      if (window.electronAPI && btnMouse.classList.contains('active')) {
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });
  });
}

/**
 * DIRECT SHAPE FILL SELECTOR (Solves Issue #4!)
 */
function initShapeFillSelector() {
  const fillBtns = document.querySelectorAll('.fill-btn[data-fill]');
  fillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      fillBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const fillMode = btn.dataset.fill;
      window.drawingCanvas.shapeFill = fillMode;

      // Auto-switch to shape tool if not already on a shape
      if (window.drawingCanvas.activeTool !== 'shape') {
        const shapesBtn = document.getElementById('shapes-dropdown-btn');
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        shapesBtn.classList.add('active');
        window.drawingCanvas.activeTool = 'shape';
      }

      const label = fillMode === 'none' ? 'Outline only' : (fillMode === 'tint' ? 'Tint (25% opacity)' : 'Solid 100%');
      showToast(`🎨 Shape Fill: ${label}`);
    });
  });
}

/**
 * Floating Toolbar Dragging
 */
function initToolbarDrag() {
  const toolbar = document.getElementById('main-toolbar');
  const handle = toolbar.querySelector('.toolbar-drag-handle');
  if (!handle) return;
  let isDragging = false;
  let startX, startY, initLeft, initTop;

  handle.addEventListener('pointerdown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = toolbar.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;

    toolbar.style.transform = 'none';
    toolbar.style.left = initLeft + 'px';
    toolbar.style.top = initTop + 'px';
    handle.setPointerCapture(e.pointerId);
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const newLeft = Math.max(10, Math.min(window.innerWidth - toolbar.offsetWidth - 10, initLeft + dx));
    const newTop = Math.max(10, Math.min(window.innerHeight - toolbar.offsetHeight - 10, initTop + dy));

    toolbar.style.left = newLeft + 'px';
    toolbar.style.top = newTop + 'px';
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
  });
}

/**
 * Tool Selection & Shapes Popover
 */
function initToolSelection() {
  const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
  const shapesBtn = document.getElementById('shapes-dropdown-btn');
  const shapesMenu = document.getElementById('shapes-menu');
  if(document.body.classList.contains('tablet-app'))document.body.appendChild(shapesMenu);
  const shapeOpts = document.querySelectorAll('.shape-opt');

  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toolBtns.forEach(b => b.classList.remove('active'));
      shapesBtn.classList.remove('active');
      shapesMenu.classList.remove('show');

      btn.classList.add('active');
      const tool = btn.dataset.tool;
      window.drawingCanvas.activeTool = tool;

      // Friendly guidance for Screen Text & Paint Bucket
      if (tool === 'text') {
        showToast('✍️ Screen Text active: Click anywhere on screen to type text directly!', 3500);
      } else if (tool === 'bucket') {
        showToast('🪣 Paint Bucket active: Click on any shape to fill it with the active color!', 3500);
      }

      // Ensure in draw mode if drawing tool clicked
      const btnDraw = document.getElementById('btn-mode-draw');
      if (btnDraw && !btnDraw.classList.contains('active')) {
        btnDraw.click();
      }
    });
  });

  shapesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.drawingCanvas.activeTool='shape';
    toolBtns.forEach(button=>button.classList.remove('active'));shapesBtn.classList.add('active');
    shapesMenu.classList.remove('show');
    document.getElementById('btn-mode-draw')?.click();
    window.toolPreferences?.save();
  });
  document.getElementById('shape-picker-toggle').addEventListener('click',event=>{
    event.stopPropagation();const visible=shapesMenu.classList.toggle('show');
    event.currentTarget.setAttribute('aria-expanded',String(visible));
  });

  shapeOpts.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      shapeOpts.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');

      const shapeType = opt.dataset.shape;
      window.drawingCanvas.activeTool = 'shape';
      window.drawingCanvas.activeShape = shapeType;
      window.toolPreferences?.save();

      toolBtns.forEach(b => b.classList.remove('active'));
      shapesBtn.classList.add('active');

      const icon = opt.querySelector('.opt-icon').textContent;
      document.getElementById('active-shape-icon').textContent = icon;
      document.getElementById('active-shape-name').textContent = opt.textContent.trim().split(' ')[1] || 'Shape';

      shapesMenu.classList.remove('show');

      // Ensure draw mode is active
      const btnDraw = document.getElementById('btn-mode-draw');
      if (btnDraw && !btnDraw.classList.contains('active')) {
        btnDraw.click();
      }
    });
  });

  window.addEventListener('click', (e) => {
    if (!e.target.closest('#shapes-menu') && !e.target.closest('#shapes-dropdown-btn') && !e.target.closest('#shape-picker-toggle')) {
      shapesMenu.classList.remove('show');
    }
  });

  document.getElementById('btn-undo').addEventListener('click', () => window.drawingCanvas.undo());
  document.getElementById('btn-redo').addEventListener('click', () => window.drawingCanvas.redo());
  document.getElementById('btn-clear').addEventListener('click', () => {
    window.drawingCanvas.clear();
    showToast('Drawings cleared. Undo restores them.');
  });

  document.getElementById('btn-toggle-notepad').addEventListener('click', () => {
    const np = document.getElementById('floating-notepad');
    np.classList.toggle('hidden');
  });
}

/**
 * Color Swatches & Stroke Width
 */
function initColorAndStroke() {
  const swatches = document.querySelectorAll('.color-swatch');
  const customColorInput = document.getElementById('custom-color-input');
  const sizeSlider = document.getElementById('stroke-size-slider');
  const sizeVal = document.getElementById('size-val');
  const sizePreview = document.getElementById('size-preview');

  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      const color = swatch.dataset.color;
      window.drawingCanvas.currentColor = color;
      sizePreview.style.backgroundColor = color;
    });
  });

  customColorInput.addEventListener('input', () => {
    swatches.forEach(s => s.classList.remove('active'));
    const color = customColorInput.value;
    window.drawingCanvas.currentColor = color;
    sizePreview.style.backgroundColor = color;
  });

  sizeSlider.addEventListener('input', () => {
    const val = parseInt(sizeSlider.value, 10);
    window.drawingCanvas.currentSize = val;
    sizeVal.textContent = val + 'px';
    sizePreview.style.width = Math.min(val * 1.5, 20) + 'px';
    sizePreview.style.height = Math.min(val * 1.5, 20) + 'px';
  });
}

/**
 * Backdrop Modes
 */
function initBackdropModes() {
  const modeBtns = document.querySelectorAll('.mode-btn[data-bg]');

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const bg = btn.dataset.bg;
      window.drawingCanvas.setBackground(bg);
      showToast(`Backdrop: ${btn.textContent.trim()}`);
    });
  });
}

/**
 * Export & Clipboard Menu
 */
function initExportMenu() {
  const exportBtn = document.getElementById('btn-export-menu');
  const exportMenu = document.getElementById('export-menu');
  if (!exportBtn || !exportMenu) return;

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
  });

  window.addEventListener('click', () => {
    exportMenu.classList.remove('show');
  });

  const getMergedCanvas = () => {
    const merged = document.createElement('canvas');
    merged.width = window.drawingCanvas.drawCanvas.width;
    merged.height = window.drawingCanvas.drawCanvas.height;
    const mCtx = merged.getContext('2d');

    // Draw background (or white if transparent)
    if (window.drawingCanvas.currentBackground === 'transparent') {
      mCtx.fillStyle = '#ffffff';
      mCtx.fillRect(0, 0, merged.width, merged.height);
    } else {
      mCtx.drawImage(window.drawingCanvas.bgCanvas, 0, 0);
    }
    mCtx.drawImage(window.drawingCanvas.drawCanvas, 0, 0);

    // Corporate watermark
    mCtx.save();
    mCtx.font = '14px sans-serif';
    mCtx.fillStyle = 'rgba(100, 116, 139, 0.6)';
    mCtx.fillText('Resuvika Omniball | Vikashya Resuvika Private Limited', 20, merged.height - 20);
    mCtx.restore();

    return merged;
  };

  document.getElementById('btn-copy-clipboard').addEventListener('click', async () => {
    exportMenu.classList.remove('show');
    try {
      const merged = getMergedCanvas();
      merged.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        showToast('📋 HD Snapshot copied to clipboard! Ready to paste into Word, Slack, Teams.');
      }, 'image/png');
    } catch (err) {
      showToast('Could not copy directly to clipboard');
    }
  });

  document.getElementById('btn-download-png').addEventListener('click', () => {
    exportMenu.classList.remove('show');
    const merged = getMergedCanvas();
    const link = document.createElement('a');
    link.download = `Vikashya_OmniDraw_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = merged.toDataURL('image/png');
    link.click();
    showToast('🖼️ HD Image downloaded!');
  });

  document.getElementById('btn-download-pdf').addEventListener('click', () => {
    exportMenu.classList.remove('show');
    window.print();
  });
}

/**
 * Connect iPad Pairing Modal
 */
function initPairModal() {
  const modal = document.getElementById('pair-modal'); const open = document.getElementById('btn-connect-ipad');
  if (!modal || !open) return;
  open.title = 'Connect iPad or tablet on local Wi-Fi';
  open.addEventListener('click', () => { modal.classList.add('show'); window.syncManager.fetchNetworkInfo(); });
  for (const id of ['modal-close','btn-modal-done']) document.getElementById(id).onclick = () => modal.classList.remove('show');
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
  document.getElementById('network-address').onchange = () => window.syncManager.updatePairingLink();
  document.getElementById('network-refresh').onclick = () => window.syncManager.fetchNetworkInfo();
  document.getElementById('btn-copy-ip-url').onclick = async () => {
    const input = document.getElementById('ipad-direct-url');
    try { await navigator.clipboard.writeText(input.value); showToast('Pairing link copied'); }
    catch { input.select(); showToast('Select and copy this pairing link.'); }
  };
  document.getElementById('connection-test').onclick = async () => {
    const result = document.getElementById('connection-result');
    try { const res = await fetch('/api/ping'); if (!res.ok) throw Error(); result.textContent = 'Computer server responds. Scan the QR on the iPad to test Wi-Fi reachability.'; }
    catch { result.textContent = 'Server unavailable. Restart Omniball.'; }
  };
  document.getElementById('repair-firewall').onclick = async () => {
    const result = document.getElementById('connection-result');
    if (!window.electronAPI?.repairFirewall) { result.textContent = 'Use the Windows desktop app to run the firewall helper.'; return; }
    result.textContent = 'Waiting for Windows administrator permission…';
    const response = await window.electronAPI.repairFirewall(); result.textContent = response.message;
  };
}
function initTextControls() {
  const input = document.getElementById('text-font-size'); input.value = window.drawingCanvas.textFontSize;
  const apply = value => { window.drawingCanvas.setTextFontSize(value); input.value = window.drawingCanvas.textFontSize; };
  input.addEventListener('input', () => { if (input.value) apply(input.value); });
  input.addEventListener('change', () => apply(input.value || 32));
  document.getElementById('text-smaller').onclick = () => apply(Number(input.value) - 4);
  document.getElementById('text-larger').onclick = () => apply(Number(input.value) + 4);
  const noteSize = document.getElementById('np-font-size');
  noteSize.oninput = () => {
    window.classNotepad.fontSize = Math.min(72, Math.max(10, Number(noteSize.value) || 16));
    window.classNotepad.editor.style.fontSize = window.classNotepad.fontSize + 'px';
    window.classNotepad.saveToStorage(); window.classNotepad.broadcastNotepadUpdate();
  };
}

/**
 * Corporate About Modal
 */
function initAboutModal() {
  const aboutModal = document.getElementById('about-modal');
  if (!aboutModal) return;
  document.getElementById('manage-license')?.addEventListener('click',async()=>{
    if(window.electronAPI)await window.electronAPI.manageLicense();
  });
  if(window.electronAPI)window.electronAPI.licenseStatus().then(status=>{
    const summary=document.getElementById('license-summary');
    if(summary)summary.textContent=status.isTrial?'Free trial ends '+new Date(status.trial.expiresAt).toLocaleString():status.active?'Licensed to '+status.license.buyer+' until '+new Date(status.license.expiresAt).toLocaleString():status.message;
  });
  const openBtn = document.getElementById('btn-show-about');
  const closeBtn = document.getElementById('about-close');
  const doneBtn = document.getElementById('btn-about-done');

  openBtn.addEventListener('click', () => aboutModal.classList.add('show'));
  [closeBtn, doneBtn].forEach(btn => {
    btn.addEventListener('click', () => aboutModal.classList.remove('show'));
  });
  aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) aboutModal.classList.remove('show');
  });
}

/**
 * Desktop Window Controls
 */
function initDesktopWindowControls() {
  const minBtn = document.getElementById('btn-app-min');
  const closeBtn = document.getElementById('btn-app-close');
  if (!minBtn || !closeBtn) return;

  if (window.electronAPI) {
    minBtn.addEventListener('click', () => window.electronAPI.minimize());
    closeBtn.addEventListener('click', () => window.electronAPI.quit());
  } else {
    minBtn.style.display = 'none';
    closeBtn.style.display = 'none';
  }
}

/**
 * Zen / Clean Mode for YouTube Recording
 */
function initZenMode() {
  window.initPresentationControls();
}

/**
 * Keyboard Shortcuts
 */
function initHotkeys() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      window.toggleDrawMouseMode();
      return;
    }
    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      window.drawingCanvas.clear();
      showToast('Screen cleared');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      window.drawingCanvas.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      e.preventDefault();
      window.drawingCanvas.redo();
      return;
    }
    if (e.key === 'z' || e.key === 'Z') {
      window.toggleZenMode();
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'p':
        document.querySelector('.tool-btn[data-tool="pen"]').click();
        break;
      case 'c':
        document.querySelector('.tool-btn[data-tool="calligraphy"]').click();
        break;
      case 'h':
        document.querySelector('.tool-btn[data-tool="highlighter"]').click();
        break;
      case 'l':
        document.querySelector('.tool-btn[data-tool="laser"]').click();
        break;
      case 't':
        document.querySelector('.tool-btn[data-tool="text"]').click();
        break;
      case 'e':
        document.querySelector('.tool-btn[data-tool="eraser-stroke"]').click();
        break;
      case 'escape':
        document.getElementById('shapes-menu').classList.remove('show');
        document.getElementById('export-menu')?.classList.remove('show');
        document.getElementById('pair-modal')?.classList.remove('show');
        document.getElementById('about-modal')?.classList.remove('show');
        window.restoreControls?.();
        break;
    }
  });
}

/**
 * Electron IPC Handlers
 */
function initElectronIPCBridge() {
  if (!window.electronAPI) return;

  window.electronAPI.onToggleDrawMode(() => window.toggleDrawMouseMode());
  window.electronAPI.onSetModeDraw(() => document.getElementById('btn-mode-draw').click());
  window.electronAPI.onSetModeMouse(() => document.getElementById('btn-mode-mouse').click());
  window.electronAPI.onTriggerClear(() => window.drawingCanvas.clear());
  window.electronAPI.onToggleZenMode(() => window.toggleZenMode());
  window.electronAPI.onShowControls(()=>window.restoreControls());
  window.electronAPI.onShowIpadModal(() => document.getElementById('btn-connect-ipad').click());
  window.electronAPI.onShowAboutModal(() => document.getElementById('btn-show-about').click());
}
