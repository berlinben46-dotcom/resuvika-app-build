/**
 * Resuvika Omniball - OneNote / Evernote Classpad & Organizer Suite
 * Developed by Vikashya Resuvika Private Limited
 * Features:
 * - Left Organizer Sidebar: Multiple Classpads (Notebooks), Chapters (Pages), & Reminders Tab
 * - Keypad Mode + Pen Mode (Draw/Handwrite directly on Notepad paper over ruled lines/grid!)
 * - Notepad Paper Background Switcher (White, Cream, Ruled Notebook, Math Grid, Dark Slate)
 * - Resizable Window + Maximize/Restore + Font Size Controls
 * - 1-Click WhatsApp Share, System Share, PDF Export, & Stamp to Board
 */

class ClassNotepad {
  constructor() {
    this.panel = document.getElementById('floating-notepad');
    this.header = document.getElementById('notepad-drag-handle');
    this.editor = document.getElementById('np-editor');
    this.tabsBar = document.getElementById('np-tabs-bar');
    this.saveStatus = document.getElementById('np-save-status');
    this.wordCountEl = document.getElementById('np-word-count');
    this.paperArea = document.getElementById('np-paper-area');
    this.inkCanvas = document.getElementById('np-ink-canvas');

    this.classpads = [
      { id: 'cp-1', name: '📘 Physics & Math' },
      { id: 'cp-2', name: '📗 Classpad General' }
    ];
    this.activeClasspadId = 'cp-1';

    this.tabs = [
      {
        id: 'tab-1',
        classpadId: 'cp-1',
        title: 'Chapter 1: Motion & Laws',
        content: '🎓 Chapter 1: Motion & Laws\n\n📌 Key Concepts:\n• Newton\'s Second Law: F = m × a\n• Kinetic Energy: KE = ½mv²\n\n📐 Diagram & Drawing Space:\n(Tap \'✏️ Pen\' at the top to draw graphs & diagrams directly on this page!)\n\n☑ Homework Checklist:\n☐ Review lecture formulas\n☐ Practice vector diagram',
        inkData: null,
        bg: 'white'
      },
      {
        id: 'tab-2',
        classpadId: 'cp-1',
        title: 'Chapter 2: Geometry',
        content: '📐 Right Triangle & Theorem\n\n• Formula: a² + b² = c²\n• Tap Grid paper (📐) and use ✏️ Pen to draw triangles!',
        inkData: null,
        bg: 'grid'
      },
      {
        id: 'tab-3',
        classpadId: 'cp-2',
        title: 'Video & Class Plan',
        content: '🎥 Lecture & Video Outline\n\n• 0:00 - 1:00: Topic Introduction\n• 1:00 - 5:00: Live Screen Pen Demo\n☐ Share summary on WhatsApp',
        inkData: null,
        bg: 'ruled'
      }
    ];
    this.activeTabId = 'tab-1';

    this.reminders = [
      { id: 'rem-1', title: 'Live Physics Class', time: '', done: false },
      { id: 'rem-2', title: 'Upload YouTube Lecture', time: '', done: false }
    ];

    this.isPinned = false;
    this.isMinimized = false;
    this.isMaximized = false;
    this.fontSize = 16;
    this.searchQuery = '';
    this.inputMode = 'keypad'; // 'keypad' | 'pen'
    this.paperBg = 'white';

    // Pen ink state
    this.penColor = '#0f172a';
    this.penSize = 4;
    this.isEraser = false;
    this.inkHistory = [];

    this.initDraggable();
    this.initInkCanvas();
    this.loadFromStorage();
    this.bindEvents();
    this.renderTabs();
    this.renderReminders();
    this.loadActiveTabContent();
    this.updateStats();
  }

  initDraggable() {
    if (!this.header || !this.panel) return;
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    this.header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('.np-input-mode-switch')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      this.panel.style.right = 'auto';
      this.panel.style.left = initialLeft + 'px';
      this.panel.style.top = initialTop + 'px';

      try { this.header.setPointerCapture(e.pointerId); } catch (_) {}
    });

    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(10, Math.min(window.innerWidth - 300, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - 100, initialTop + dy));

      this.panel.style.left = newLeft + 'px';
      this.panel.style.top = newTop + 'px';
    });

    window.addEventListener('pointerup', () => {
      isDragging = false;
    });
  }

  initInkCanvas() {
    if (!this.inkCanvas || !this.paperArea) return;
    this.inkCtx = this.inkCanvas.getContext('2d');
    let drawing = false;

    const ensureSize = () => {
      const rect = this.paperArea.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10 && (this.inkCanvas.width !== Math.round(rect.width) || this.inkCanvas.height !== Math.round(rect.height))) {
        const snapshot = this.inkCanvas.width > 0 ? this.inkCanvas.toDataURL() : null;
        this.inkCanvas.width = Math.round(rect.width);
        this.inkCanvas.height = Math.round(rect.height);
        if (snapshot) {
          const img = new Image();
          img.onload = () => this.inkCtx.drawImage(img, 0, 0);
          img.src = snapshot;
        }
      }
    };

    if (window.ResizeObserver) {
      new ResizeObserver(() => ensureSize()).observe(this.paperArea);
    }

    this.inkCanvas.addEventListener('pointerdown', (e) => {
      if (this.inputMode !== 'pen') return;
      ensureSize();
      this.inkHistory.push(this.inkCanvas.toDataURL());
      if (this.inkHistory.length > 25) this.inkHistory.shift();

      drawing = true;
      try { this.inkCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      const r = this.inkCanvas.getBoundingClientRect();
      this.inkCtx.save();
      this.inkCtx.lineCap = 'round';
      this.inkCtx.lineJoin = 'round';
      this.inkCtx.globalCompositeOperation = this.isEraser ? 'destination-out' : 'source-over';
      this.inkCtx.strokeStyle = this.penColor;
      this.inkCtx.lineWidth = this.isEraser ? Math.max(16, this.penSize * 2) : this.penSize;
      this.inkCtx.beginPath();
      this.inkCtx.moveTo(e.clientX - r.left, e.clientY - r.top);
    });

    this.inkCanvas.addEventListener('pointermove', (e) => {
      if (!drawing || this.inputMode !== 'pen') return;
      const r = this.inkCanvas.getBoundingClientRect();
      this.inkCtx.lineTo(e.clientX - r.left, e.clientY - r.top);
      this.inkCtx.stroke();
    });

    const stopDrawing = () => {
      if (!drawing) return;
      drawing = false;
      this.inkCtx.restore();
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (activeTab) {
        activeTab.inkData = this.inkCanvas.toDataURL();
        this.saveToStorage();
      }
    };

    this.inkCanvas.addEventListener('pointerup', stopDrawing);
    this.inkCanvas.addEventListener('pointercancel', stopDrawing);
  }

  setInputMode(mode) {
    this.inputMode = mode === 'pen' ? 'pen' : 'keypad';
    const keypadBtn = document.getElementById('np-mode-keypad');
    const penBtn = document.getElementById('np-mode-pen');
    const penBar = document.getElementById('np-pen-bar');

    if (keypadBtn) keypadBtn.classList.toggle('active', this.inputMode === 'keypad');
    if (penBtn) penBtn.classList.toggle('active', this.inputMode === 'pen');
    if (penBar) penBar.classList.toggle('hidden', this.inputMode !== 'pen');
    if (this.panel) this.panel.classList.toggle('np-pen-active', this.inputMode === 'pen');

    if (this.inkCanvas) {
      this.inkCanvas.style.pointerEvents = this.inputMode === 'pen' ? 'auto' : 'none';
    }
    if (this.inputMode === 'keypad' && this.editor) {
      this.editor.focus();
    }
    if (window.showToast) {
      showToast(this.inputMode === 'pen' ? '✏️ Pen Mode inside Notepad: Draw directly on your page!' : '⌨️ Keypad Mode: Type notes freely');
    }
  }

  setPaperBackground(bg) {
    this.paperBg = bg || 'white';
    if (this.paperArea) {
      this.paperArea.className = `notepad-body np-paper-${this.paperBg}`;
    }
    document.querySelectorAll('.np-bg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.npBg === this.paperBg);
    });
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (activeTab) {
      activeTab.bg = this.paperBg;
      this.saveToStorage();
    }
  }

  bindEvents() {
    if (!this.editor) return;

    // Editor input listener with debounce auto-save & sync
    let saveTimeout = null;
    let syncTimeout = null;
    this.editor.addEventListener('input', () => {
      if (this.saveStatus) this.saveStatus.textContent = '✏️ Typing...';
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (activeTab) {
        activeTab.content = this.editor.value;
      }
      this.updateStats();

      clearTimeout(saveTimeout);
      if (!syncTimeout) syncTimeout = setTimeout(() => { syncTimeout = null; this.broadcastNotepadUpdate(); }, 80);
      saveTimeout = setTimeout(() => {
        this.saveToStorage();
        if (this.saveStatus) this.saveStatus.textContent = '💾 Auto-saved';
      }, 500);
    });

    // Keypad vs Pen switch
    document.getElementById('np-mode-keypad')?.addEventListener('click', () => this.setInputMode('keypad'));
    document.getElementById('np-mode-pen')?.addEventListener('click', () => this.setInputMode('pen'));

    // Organizer Tabs (Classpads vs Reminders)
    const orgTabNotes = document.getElementById('np-org-tab-notes');
    const orgTabRem = document.getElementById('np-org-tab-reminders');
    const orgNotesPane = document.getElementById('np-org-notes-pane');
    const orgRemPane = document.getElementById('np-org-reminders-pane');

    orgTabNotes?.addEventListener('click', () => {
      orgTabNotes.classList.add('active');
      orgTabRem?.classList.remove('active');
      orgNotesPane?.classList.remove('hidden');
      orgRemPane?.classList.add('hidden');
    });

    orgTabRem?.addEventListener('click', () => {
      orgTabRem.classList.add('active');
      orgTabNotes?.classList.remove('active');
      orgRemPane?.classList.remove('hidden');
      orgNotesPane?.classList.add('hidden');
    });

    // Toggle Organizer Sidebar
    document.getElementById('np-toggle-org')?.addEventListener('click', () => {
      document.getElementById('np-organizer')?.classList.toggle('collapsed');
    });

    // Add Classpad (Inline creator - works in Electron without prompt())
    document.getElementById('np-add-classpad')?.addEventListener('click', () => {
      let box = document.getElementById('np-inline-cp-box');
      if (box) { box.remove(); return; }
      const actions = document.querySelector('.np-org-actions');
      if (!actions) return;

      box = document.createElement('div');
      box.id = 'np-inline-cp-box';
      box.className = 'np-inline-creator';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Subject / Classpad name...';
      input.className = 'np-search-bar';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = '✓';
      okBtn.className = 'np-inline-ok';

      const create = () => {
        const raw = input.value.trim();
        box.remove();
        if (!raw) return;
        const cpId = 'cp-' + Date.now();
        this.classpads.push({ id: cpId, name: '📘 ' + raw });
        this.activeClasspadId = cpId;

        const tabId = 'tab-' + (Date.now() + 1);
        this.tabs.push({
          id: tabId,
          classpadId: cpId,
          title: 'Chapter 1',
          content: `# ${raw} — Chapter 1\n\n• Key concepts:\n`,
          inkData: null,
          bg: this.paperBg
        });
        this.activeTabId = tabId;
        this.renderTabs();
        this.loadActiveTabContent();
        this.saveToStorage();
        this.broadcastNotepadUpdate();
        if (window.showToast) showToast(`📘 Created Classpad: ${raw}`);
      };

      okBtn.addEventListener('click', create);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); create(); }
        if (e.key === 'Escape') box.remove();
      });

      box.append(input, okBtn);
      actions.insertAdjacentElement('afterend', box);
      input.focus();
    });

    // Add Chapter / Note
    document.getElementById('np-add-tab')?.addEventListener('click', () => {
      const count = this.tabs.filter(t => (t.classpadId || 'cp-1') === this.activeClasspadId).length + 1;
      const newId = 'tab-' + Date.now();
      this.tabs.push({
        id: newId,
        classpadId: this.activeClasspadId,
        title: `Chapter ${count}`,
        content: `# Chapter ${count}\n\n`,
        inkData: null,
        bg: this.paperBg
      });
      this.activeTabId = newId;
      this.renderTabs();
      this.loadActiveTabContent();
      this.saveToStorage();
      this.broadcastNotepadUpdate();
      if (window.showToast) showToast(`Added Chapter ${count}`);
    });

    // Reminders Add
    document.getElementById('np-rem-add-btn')?.addEventListener('click', () => {
      const titleInput = document.getElementById('np-rem-title');
      const timeInput = document.getElementById('np-rem-time');
      const title = titleInput?.value.trim();
      if (!title) {
        if (window.showToast) showToast('Enter a reminder title first');
        return;
      }
      const newRem = {
        id: 'rem-' + Date.now(),
        title,
        time: timeInput?.value || '',
        done: false,
        notified: false
      };
      this.reminders.unshift(newRem);
      if (newRem.time && window.scheduleNativeReminder) {
        window.scheduleNativeReminder(newRem);
      }
      if (titleInput) titleInput.value = '';
      if (timeInput) timeInput.value = '';
      this.renderReminders();
      this.saveToStorage();
      if (window.showToast) showToast('⏰ Reminder scheduled!');
    });

    // Check due reminders every 10 seconds while app is open
    if (!this._remInterval) {
      this._remInterval = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const rem of this.reminders) {
          if (!rem.done && !rem.notified && rem.time) {
            const target = Date.parse(rem.time);
            if (Number.isFinite(target) && target <= now) {
              rem.notified = true;
              changed = true;
              if (window.showToast) window.showToast(`⏰ Reminder: ${rem.title}`, 8000);
            }
          }
        }
        if (changed) {
          this.renderReminders();
          this.saveToStorage();
        }
      }, 10000);
    }

    // Paper Background Switcher
    document.querySelectorAll('.np-bg-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setPaperBackground(btn.dataset.npBg));
    });

    // Pen Tool Controls inside Notepad
    document.querySelectorAll('.np-pen-color').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.np-pen-color').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.penColor = btn.dataset.penColor;
        this.isEraser = false;
        document.getElementById('np-pen-eraser')?.classList.remove('active');
      });
    });

    document.getElementById('np-pen-size')?.addEventListener('change', (e) => {
      this.penSize = parseInt(e.target.value, 10) || 4;
    });

    document.getElementById('np-pen-eraser')?.addEventListener('click', (e) => {
      this.isEraser = !this.isEraser;
      e.currentTarget.classList.toggle('active', this.isEraser);
    });

    document.getElementById('np-pen-undo')?.addEventListener('click', () => {
      if (!this.inkHistory.length || !this.inkCanvas) return;
      const prev = this.inkHistory.pop();
      const img = new Image();
      img.onload = () => {
        this.inkCtx.clearRect(0, 0, this.inkCanvas.width, this.inkCanvas.height);
        this.inkCtx.drawImage(img, 0, 0);
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        if (activeTab) { activeTab.inkData = prev; this.saveToStorage(); }
      };
      img.src = prev;
    });

    document.getElementById('np-pen-clear')?.addEventListener('click', () => {
      if (!this.inkCanvas) return;
      this.inkHistory.push(this.inkCanvas.toDataURL());
      this.inkCtx.clearRect(0, 0, this.inkCanvas.width, this.inkCanvas.height);
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (activeTab) { activeTab.inkData = null; this.saveToStorage(); }
      if (window.showToast) showToast('Note ink cleared');
    });

    // Formatting buttons
    document.querySelectorAll('.np-fmt-btn[data-fmt]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.applyFormat(btn.dataset.fmt);
      });
    });

    // Font size controls
    const setFont = (size) => {
      this.fontSize = Math.min(72, Math.max(10, size));
      this.editor.style.fontSize = this.fontSize + 'px';
      const sizeControl = document.getElementById('np-font-size');
      if (sizeControl) sizeControl.value = this.fontSize;
      this.saveToStorage();
      this.broadcastNotepadUpdate();
    };
    document.getElementById('np-font-size')?.addEventListener('input', (e) => setFont(Number(e.target.value) || 16));
    document.getElementById('np-font-dec')?.addEventListener('click', () => setFont(this.fontSize - 2));
    document.getElementById('np-font-inc')?.addEventListener('click', () => setFont(this.fontSize + 2));

    // Stamp to Canvas
    document.getElementById('np-stamp-to-canvas')?.addEventListener('click', () => {
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      if (!activeTab || !activeTab.content.trim()) {
        if (window.showToast) showToast('Note is empty');
        return;
      }
      if (window.drawingCanvas) {
        window.drawingCanvas.addElement({
          type: 'sticky',
          x: Math.max(40, Math.round(window.innerWidth / 4)),
          y: Math.max(40, Math.round(window.innerHeight / 4)),
          width: 280,
          height: 200,
          text: activeTab.content,
          bg: '#fef08a'
        });
        if (window.showToast) showToast('📌 Note stamped onto drawing canvas!');
      }
    });

    // Sharing & Export
    document.getElementById('np-share-whatsapp')?.addEventListener('click', () => this.shareToWhatsApp());
    document.getElementById('np-share-native')?.addEventListener('click', () => this.shareNative());
    document.getElementById('np-export-txt')?.addEventListener('click', () => this.downloadAsFile());
    document.getElementById('np-export-pdf')?.addEventListener('click', () => this.printOrExportPDF());
    document.getElementById('np-template-btn')?.addEventListener('click', () => this.insertTemplate());

    document.getElementById('np-draw-canvas')?.addEventListener('click', () => {
      if (window.drawingCanvas) {
        window.drawingCanvas.activeTool = 'pen';
        document.querySelector('.tool-btn[data-tool="pen"]')?.click();
        if (window.showToast) showToast('✏️ Screen Pen active — draw anywhere on screen');
      }
    });

    // Search filter
    document.getElementById('np-search-input')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderTabs();
    });

    // Header actions
    document.getElementById('np-close-btn')?.addEventListener('click', () => this.panel.classList.add('hidden'));
    document.getElementById('np-minimize-btn')?.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      this.panel.classList.toggle('minimized', this.isMinimized);
      document.getElementById('np-minimize-btn').textContent = this.isMinimized ? '＋' : '−';
    });
    document.getElementById('np-max-btn')?.addEventListener('click', () => {
      this.isMaximized = !this.isMaximized;
      this.panel.classList.toggle('maximized', this.isMaximized);
      document.getElementById('np-max-btn').textContent = this.isMaximized ? '❐' : '⛶';
    });
    document.getElementById('np-pin-btn')?.addEventListener('click', () => {
      this.isPinned = !this.isPinned;
      document.getElementById('np-pin-btn').style.color = this.isPinned ? '#3b82f6' : '';
      if (window.showToast) showToast(this.isPinned ? '📌 Notepad pinned' : 'Notepad unpinned');
    });
  }

  renderReminders() {
    const list = document.getElementById('np-rem-list');
    if (!list) return;
    list.replaceChildren();

    if (this.reminders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'np-rem-empty';
      empty.textContent = 'No reminders yet. Add one above!';
      list.appendChild(empty);
      return;
    }

    this.reminders.forEach(rem => {
      const item = document.createElement('div');
      item.className = 'np-rem-item' + (rem.done ? ' done' : '');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = rem.done;
      cb.addEventListener('change', () => {
        rem.done = cb.checked;
        item.classList.toggle('done', rem.done);
        this.saveToStorage();
      });

      const info = document.createElement('div');
      info.className = 'np-rem-info';
      const title = document.createElement('div');
      title.className = 'np-rem-title';
      title.textContent = rem.title;
      info.appendChild(title);
      if (rem.time) {
        const dt = document.createElement('div');
        dt.className = 'np-rem-dt';
        dt.textContent = new Date(rem.time).toLocaleString();
        info.appendChild(dt);
      }

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'np-tab-del';
      del.textContent = '×';
      del.addEventListener('click', () => {
        this.reminders = this.reminders.filter(r => r.id !== rem.id);
        this.renderReminders();
        this.saveToStorage();
      });

      item.append(cb, info, del);
      list.appendChild(item);
    });
  }

  renderTabs() {
    if (!this.tabsBar) return;
    this.tabsBar.replaceChildren();

    this.classpads.forEach(cp => {
      const cpTabs = this.tabs.filter(t => (t.classpadId || 'cp-1') === cp.id);
      const matchingTabs = this.searchQuery
        ? cpTabs.filter(t => t.title.toLowerCase().includes(this.searchQuery) || t.content.toLowerCase().includes(this.searchQuery))
        : cpTabs;

      if (this.searchQuery && matchingTabs.length === 0) return;

      const cpGroup = document.createElement('div');
      cpGroup.className = 'np-cp-group';

      const cpHeader = document.createElement('div');
      cpHeader.className = 'np-cp-header' + (cp.id === this.activeClasspadId ? ' active' : '');
      cpHeader.textContent = cp.name;
      cpHeader.addEventListener('click', () => {
        this.activeClasspadId = cp.id;
        this.renderTabs();
      });
      cpHeader.addEventListener('dblclick', () => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = cp.name;
        inp.className = 'np-search-bar';
        cpHeader.replaceChildren(inp);
        inp.focus();
        inp.select();
        const commit = () => {
          if (inp.value.trim()) cp.name = inp.value.trim();
          this.renderTabs();
          this.saveToStorage();
        };
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') this.renderTabs(); });
      });
      cpGroup.appendChild(cpHeader);

      matchingTabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'np-tab' + (tab.id === this.activeTabId ? ' active' : '');

        const titleSpan = document.createElement('span');
        titleSpan.className = 'np-tab-title';
        titleSpan.textContent = '📄 ' + tab.title;
        tabEl.appendChild(titleSpan);

        if (this.tabs.length > 1) {
          const delBtn = document.createElement('span');
          delBtn.className = 'np-tab-del';
          delBtn.textContent = '×';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.tabs = this.tabs.filter(t => t.id !== tab.id);
            if (this.activeTabId === tab.id) this.activeTabId = this.tabs[0].id;
            this.renderTabs();
            this.loadActiveTabContent();
            this.saveToStorage();
            this.broadcastNotepadUpdate();
          });
          tabEl.appendChild(delBtn);
        }

        tabEl.addEventListener('click', () => {
          this.activeClasspadId = tab.classpadId || 'cp-1';
          this.activeTabId = tab.id;
          this.renderTabs();
          this.loadActiveTabContent();
        });

        tabEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = tab.title;
          inp.className = 'np-search-bar';
          tabEl.replaceChildren(inp);
          inp.focus();
          inp.select();
          const commit = () => {
            if (inp.value.trim()) tab.title = inp.value.trim();
            this.renderTabs();
            this.saveToStorage();
            this.broadcastNotepadUpdate();
          };
          inp.addEventListener('blur', commit);
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') this.renderTabs(); });
        });

        cpGroup.appendChild(tabEl);
      });

      this.tabsBar.appendChild(cpGroup);
    });
  }

  loadActiveTabContent() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (this.editor) {
      this.editor.value = activeTab ? activeTab.content : '';
      this.editor.style.fontSize = this.fontSize + 'px';
    }
    const sizeControl = document.getElementById('np-font-size');
    if (sizeControl) sizeControl.value = this.fontSize;

    // Restore paper background
    this.setPaperBackground(activeTab?.bg || 'white');

    // Restore ink canvas
    if (this.inkCanvas && this.inkCtx) {
      this.inkCtx.clearRect(0, 0, this.inkCanvas.width, this.inkCanvas.height);
      if (activeTab?.inkData) {
        const img = new Image();
        img.onload = () => this.inkCtx.drawImage(img, 0, 0);
        img.src = activeTab.inkData;
      }
    }

    this.updateStats();
  }

  insertTemplate() {
    let pop = document.getElementById('np-template-popover');
    if (pop) { pop.remove(); return; }

    const templates = [
      {
        name: '🎓 Lecture & Diagram Sheet',
        text: '\n\n# 🎓 Lecture Topic: \n**Date:** Today\n\n### 📌 Key Definitions\n• Concept 1: \n• Concept 2: \n\n### 📐 Diagram Space\n(Switch to ✏️ Pen mode to draw diagram here)\n\n### ☑ Homework\n- [ ] Review notes\n'
      },
      {
        name: '📐 Geometry & Math Proof',
        text: '\n\n## 📐 Geometry & Formula\n• **Given:** \n• **Formula:** `a² + b² = c²`\n'
      },
      {
        name: '🎥 Video Recording Outline',
        text: '\n\n## 🎥 Video Recording Outline\n• 0:00 - 1:00: Hook\n• 1:00 - 5:00: Live Screen Demo\n'
      }
    ];

    pop = document.createElement('div');
    pop.id = 'np-template-popover';
    pop.className = 'np-template-popover';

    templates.forEach(tpl => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'np-tpl-item';
      btn.textContent = tpl.name;
      btn.addEventListener('click', () => {
        const start = this.editor.selectionStart;
        this.editor.setRangeText(tpl.text, start, this.editor.selectionEnd, 'end');
        this.editor.focus();
        this.editor.dispatchEvent(new Event('input'));
        pop.remove();
        if (window.showToast) showToast(`Inserted ${tpl.name}`);
      });
      pop.appendChild(btn);
    });

    const formatBar = document.querySelector('.notepad-format-bar');
    if (formatBar) {
      formatBar.insertAdjacentElement('afterend', pop);
    }
  }

  applyFormat(fmt) {
    const textarea = this.editor;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const sel = textarea.value.substring(start, end);

    let replacement = '';
    switch (fmt) {
      case 'h1': replacement = `# ${sel || 'Heading 1'}\n`; break;
      case 'h2': replacement = `## ${sel || 'Heading 2'}\n`; break;
      case 'h3': replacement = `### ${sel || 'Heading 3'}\n`; break;
      case 'bold': replacement = `**${sel || 'Bold Text'}**`; break;
      case 'italic': replacement = `*${sel || 'Italic Text'}*`; break;
      case 'underline': replacement = `<u>${sel || 'Underlined Text'}</u>`; break;
      case 'strike': replacement = `~~${sel || 'Strikethrough'}~~`; break;
      case 'highlight': replacement = `==${sel || 'Highlighted'}==`; break;
      case 'bullet': replacement = `\n• ${sel || 'List item'}`; break;
      case 'number': replacement = `\n1. ${sel || 'Numbered item'}`; break;
      case 'check': replacement = `\n- [ ] ${sel || 'To-do task'}`; break;
      case 'quote': replacement = `\n> "${sel || 'Quote'}"`; break;
      case 'code': replacement = `\`${sel || 'Formula'}\``; break;
      case 'toggle-check': {
        const before = textarea.value.substring(0, start);
        const lineStart = before.lastIndexOf('\n') + 1;
        const lineEnd = textarea.value.indexOf('\n', start);
        const currentLine = textarea.value.substring(lineStart, lineEnd === -1 ? textarea.value.length : lineEnd);
        let toggledLine = currentLine;
        if (currentLine.includes('- [ ]')) toggledLine = currentLine.replace('- [ ]', '- [x]');
        else if (currentLine.includes('- [x]')) toggledLine = currentLine.replace('- [x]', '- [ ]');
        else toggledLine = '- [ ] ' + currentLine;
        textarea.setRangeText(toggledLine, lineStart, lineEnd === -1 ? textarea.value.length : lineEnd, 'select');
        textarea.focus();
        textarea.dispatchEvent(new Event('input'));
        return;
      }
    }
    textarea.setRangeText(replacement, start, end, 'end');
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
  }

  updateStats() {
    const text = this.editor ? this.editor.value : '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    if (this.wordCountEl) this.wordCountEl.textContent = `${words} words • ${text.length} chars`;
  }

  shareToWhatsApp() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab || !activeTab.content.trim()) return;
    const message = `📝 *${activeTab.title}*\n\n${activeTab.content}\n\n---\n*Created with Resuvika Omniball (Vikashya Resuvika Pvt Ltd)*`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(waUrl, window.Capacitor?.isNativePlatform() ? '_system' : '_blank', 'noopener');
  }

  async shareNative() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab || !activeTab.content.trim()) return;
    if (navigator.share) {
      try { await navigator.share({ title: activeTab.title, text: activeTab.content }); return; } catch (_) {}
    }
    this.shareToWhatsApp();
  }

  downloadAsFile() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    const title = (activeTab ? activeTab.title : 'note').replace(/[^a-zA-Z0-9_-]/g, '_');
    const blob = new Blob([this.editor.value], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  printOrExportPDF() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    const title = activeTab ? activeTab.title : 'Resuvika Note';
    const printWin = window.open('', '_blank');
    if (!printWin) { window.print(); return; }
    const htmlContent = (this.editor.value || '').replace(/\n/g, '<br>');
    printWin.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:40px;line-height:1.6}</style></head><body><h3>VIKASHYA RESUVIKA PRIVATE LIMITED</h3><h2>${title}</h2><div>${htmlContent}</div><script>window.onload=()=>window.print()</script></body></html>`);
    printWin.document.close();
  }

  saveToStorage() {
    try {
      localStorage.setItem('omnidraw_notepad', JSON.stringify({
        classpads: this.classpads,
        activeClasspadId: this.activeClasspadId,
        tabs: this.tabs,
        reminders: this.reminders,
        fontSize: this.fontSize,
        activeTabId: this.activeTabId
      }));
    } catch (_) {}
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('omnidraw_notepad');
      if (saved) {
        const data = JSON.parse(saved);
        this.fontSize = Math.min(72, Math.max(10, Number(data.fontSize) || 16));
        if (Array.isArray(data.classpads) && data.classpads.length > 0) this.classpads = data.classpads;
        if (data.activeClasspadId) this.activeClasspadId = data.activeClasspadId;
        if (Array.isArray(data.tabs) && data.tabs.length > 0) {
          this.tabs = data.tabs;
          this.activeTabId = data.activeTabId || this.tabs[0].id;
        }
        if (Array.isArray(data.reminders)) this.reminders = data.reminders;
      }
    } catch (_) {}
  }

  broadcastNotepadUpdate() {
    if (window.syncManager) {
      window.syncManager.broadcastNotepad({
        fontSize: this.fontSize,
        tabs: this.tabs,
        activeTabId: this.activeTabId
      });
    }
  }

  syncFromRemote(notepadData) {
    if (!notepadData || !notepadData.tabs) return;
    this.tabs = notepadData.tabs;
    this.fontSize = Math.min(72, Math.max(10, Number(notepadData.fontSize) || 16));
    if (notepadData.activeTabId) this.activeTabId = notepadData.activeTabId;
    this.renderTabs();
    this.loadActiveTabContent();
    this.saveToStorage();
    if (this.saveStatus) this.saveStatus.textContent = '🔄 Synced';
  }
}

window.ClassNotepad = ClassNotepad;
