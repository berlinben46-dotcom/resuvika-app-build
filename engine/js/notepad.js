/**
 * Resuvika Omniball - Advanced Class Notepad & Evernote/OneNote Suite
 * Developed by Vikashya Resuvika Private Limited
 * Features:
 * - Multi-note / Notebook management with search & filter
 * - Rich formatting (H1, H2, H3, Bold, Italic, Underline, Strikethrough, Highlight, Checkboxes, Lists, Quotes, Code, Formulas)
 * - 1-Click WhatsApp Direct Share
 * - 1-Click Native System Share (WhatsApp, Telegram, Drive, Gmail, etc.)
 * - 1-Click Download (Text, Markdown, Print / PDF)
 * - Stamp Note onto Whiteboard Canvas as a Sticky Card
 * - Live Word Count & Character Count
 * - Auto-save with local storage persistence and multi-device sync
 */

class ClassNotepad {
  constructor() {
    this.panel = document.getElementById('floating-notepad');
    this.header = document.getElementById('notepad-drag-handle');
    this.editor = document.getElementById('np-editor');
    this.tabsBar = document.getElementById('np-tabs-bar');
    this.saveStatus = document.getElementById('np-save-status');
    this.wordCountEl = document.getElementById('np-word-count');

    this.tabs = [
      {
        id: 'tab-1',
        title: 'Class Notes',
        content: '# 🎓 Lecture 1: Core Concepts\n\n- [ ] 1. Introduction & Key Terminology\n- [ ] 2. Live Diagram & Visual Breakdown\n- [ ] 3. Real-world Examples & Formulas\n- [ ] 4. Summary & Q&A\n\n> "Simplicity is the soul of efficiency."\n\n==Important formula to remember==\n`E = mc²`'
      },
      {
        id: 'tab-2',
        title: 'Ideas & Tasks',
        content: '## 💡 Video Talking Points\n\n• Highlight Step 3 in Neon Red\n• Show coordinate axis at t=12:30\n• Add YouTube description links\n\n- [x] Record lecture audio\n- [ ] Export HD whiteboard diagram'
      }
    ];
    this.activeTabId = 'tab-1';
    this.isPinned = false;
    this.isMinimized = false;
    this.fontSize = 16;
    this.searchQuery = '';

    this.initDraggable();
    this.bindEvents();
    this.loadFromStorage();
    this.renderTabs();
    this.loadActiveTabContent();
    this.updateStats();
  }

  initDraggable() {
    if (!this.header || !this.panel) return;
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    this.header.addEventListener('pointerdown', (e) => {
      if(document.body.classList.contains('mobile-app'))return;
      if (e.target.closest('.notepad-header-actions')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      this.panel.style.right = 'auto';
      this.panel.style.left = initialLeft + 'px';
      this.panel.style.top = initialTop + 'px';

      this.header.setPointerCapture(e.pointerId);
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

    // Formatting buttons
    document.querySelectorAll('.np-fmt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.applyFormat(btn.dataset.fmt);
      });
    });

    // Font size controls
    const sizeControl = document.getElementById('np-font-size');
    if (sizeControl) {
      sizeControl.addEventListener('input', () => {
        this.fontSize = Math.min(72, Math.max(10, Number(sizeControl.value) || 16));
        this.editor.style.fontSize = this.fontSize + 'px';
        this.saveToStorage();
        this.broadcastNotepadUpdate();
      });
    }

    // Add Tab
    document.getElementById('np-add-tab')?.addEventListener('click', () => {
      const tabNum = this.tabs.length + 1;
      const newId = 'tab-' + Date.now();
      this.tabs.push({
        id: newId,
        title: `Note ${tabNum}`,
        content: ''
      });
      this.activeTabId = newId;
      this.renderTabs();
      this.loadActiveTabContent();
      this.saveToStorage();
      this.broadcastNotepadUpdate();
      if (window.showToast) showToast('New note created');
    });

    // Full-Page Crisp Vector Transfer to Whiteboard (no hazy cropped sticky)
    document.getElementById('np-stamp-to-canvas')?.addEventListener('click', () => {
      const activeTab = this.tabs.find(t => t.id === this.activeTabId);
      const rawText = (document.getElementById('np-editor')?.value || activeTab?.content || '').trim();
      if (!rawText) {
        if (window.showToast) showToast('Note is empty');
        return;
      }

      const board = window.drawingCanvas;
      if (board) {
        const fontSize = Math.max(16, Math.min(26, Math.round((board.width || 380) / 20)));
        const lineHeight = Math.round(fontSize * 1.45);
        const maxChars = Math.max(24, Math.floor(((board.width || 380) - 48) / (fontSize * 0.56)));
        const inkColor = (board.currentBackground === 'blackboard' || board.currentBackground === 'chalkboard') ? '#f8fafc' : '#0f172a';

        const wrappedLines = [];
        for (const para of rawText.split(/\r?\n/)) {
          const trimmed = para.trim();
          if (!trimmed) { wrappedLines.push(''); continue; }
          let cur = '';
          for (const word of trimmed.split(/\s+/)) {
            if ((cur + ' ' + word).trim().length > maxChars && cur) {
              wrappedLines.push(cur);
              cur = word;
            } else {
              cur = (cur + ' ' + word).trim();
            }
          }
          if (cur) wrappedLines.push(cur);
        }

        const startX = 24;
        let y = 110;
        for (const line of wrappedLines) {
          if (line) {
            board.addElement({
              type: 'text',
              x: startX,
              y,
              text: line,
              color: inkColor,
              fontSize
            });
          }
          y += lineHeight;
        }
        window.dispatchEvent(new Event('boardchanged'));
        window.omniball?.workspace?.show?.('board');
        if (window.showToast) showToast('Full note transferred to Whiteboard in crisp HD!');
      }
    });

    // 1-Click Direct WhatsApp Share
    document.getElementById('np-share-whatsapp')?.addEventListener('click', () => {
      this.shareToWhatsApp();
    });

    // 1-Click Native Social Share (WhatsApp, Telegram, Drive, etc.)
    document.getElementById('np-share-native')?.addEventListener('click', () => {
      this.shareNative();
    });

    // 1-Click Download as Text/Markdown
    document.getElementById('np-export-txt')?.addEventListener('click', () => {
      this.downloadAsFile();
    });

    // 1-Click Print / PDF
    document.getElementById('np-export-pdf')?.addEventListener('click', () => {
      this.printOrExportPDF();
    });

    // Search Notes Filter
    const searchInput = document.getElementById('np-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchQuery = searchInput.value.toLowerCase().trim();
        this.renderTabs();
      });
    }

    // Toggle Task Checkboxes on double-click or shortcut in editor
    this.editor.addEventListener('keydown', (e) => {
      // Tab key indent
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        this.editor.setRangeText('  ', start, end, 'end');
      }
    });

    // Header buttons
    document.getElementById('np-close-btn')?.addEventListener('click', () => {
      this.panel.classList.add('hidden');
    });

    document.getElementById('np-minimize-btn')?.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      this.panel.classList.toggle('minimized', this.isMinimized);
      document.getElementById('np-minimize-btn').textContent = this.isMinimized ? '＋' : '−';
    });

    document.getElementById('np-pin-btn')?.addEventListener('click', () => {
      this.isPinned = !this.isPinned;
      document.getElementById('np-pin-btn').style.color = this.isPinned ? '#3b82f6' : '';
      if (window.showToast) showToast(this.isPinned ? '📌 Notepad pinned on top' : 'Notepad unpinned');
    });

    document.getElementById('np-copy-text')?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.editor.value).then(() => {
        if (window.showToast) showToast('📋 Note copied to clipboard!');
      });
    });
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
      case 'highlight': replacement = `==${sel || 'Highlighted Text'}==`; break;
      case 'bullet': replacement = `\n• ${sel || 'List item'}`; break;
      case 'number': replacement = `\n1. ${sel || 'Numbered item'}`; break;
      case 'check': replacement = `\n- [ ] ${sel || 'To-do task'}`; break;
      case 'quote': replacement = `\n> "${sel || 'Inspiring quote or key takeaway'}"`; break;
      case 'code': replacement = sel.includes('\n') ? `\n\`\`\`\n${sel || 'code block'}\n\`\`\`\n` : `\`${sel || 'Code/Formula'}\``; break;
      case 'divider': replacement = `\n\n---\n\n`; break;
      case 'toggle-check': {
        // Find line where cursor is and toggle [ ] to [x]
        const before = textarea.value.substring(0, start);
        const lineStart = before.lastIndexOf('\n') + 1;
        const lineEnd = textarea.value.indexOf('\n', start);
        const currentLine = textarea.value.substring(lineStart, lineEnd === -1 ? textarea.value.length : lineEnd);
        let toggledLine = currentLine;
        if (currentLine.includes('- [ ]')) {
          toggledLine = currentLine.replace('- [ ]', '- [x]');
        } else if (currentLine.includes('- [x]')) {
          toggledLine = currentLine.replace('- [x]', '- [ ]');
        } else {
          toggledLine = '- [ ] ' + currentLine;
        }
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
    const chars = text.length;
    if (this.wordCountEl) {
      this.wordCountEl.textContent = `${words} words • ${chars} chars`;
    }
  }

  /**
   * 1-Click Direct WhatsApp Share
   */
  shareToWhatsApp() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab || !activeTab.content.trim()) {
      if (window.showToast) showToast('Note is empty to share');
      return;
    }

    const title = activeTab.title || 'Resuvika Note';
    const message = `📝 *${title}*\n\n${activeTab.content}\n\n---\n*Created with Resuvika Omni Pen (Vikashya Resuvika Pvt Ltd)*`;
    const encoded = encodeURIComponent(message);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;

    if (window.Capacitor?.isNativePlatform()) {
      window.open(waUrl, '_system');
    } else {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }

    if (window.showToast) showToast('Opening WhatsApp to share note...');
  }

  /**
   * 1-Click Native Social Share (WhatsApp, Telegram, Email, Drive, Notes)
   */
  async shareNative() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    if (!activeTab || !activeTab.content.trim()) {
      if (window.showToast) showToast('Note is empty to share');
      return;
    }

    const title = activeTab.title || 'Resuvika Note';
    const text = `${activeTab.content}\n\n---\nShared via Resuvika Omni Pen`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text
        });
        if (window.showToast) showToast('Shared successfully!');
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          this.shareToWhatsApp();
        }
        return;
      }
    }

    // Fallback directly to WhatsApp
    this.shareToWhatsApp();
  }

  /**
   * 1-Click Download as Text/Markdown
   */
  downloadAsFile() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    const title = (activeTab ? activeTab.title : 'note').replace(/[^a-zA-Z0-9_-]/g, '_');
    const content = this.editor.value;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (window.showToast) showToast(`📥 Downloaded ${title}.md`);
  }

  /**
   * 1-Click Print / PDF
   */
  printOrExportPDF() {
    const activeTab = this.tabs.find(t => t.id === this.activeTabId);
    const title = activeTab ? activeTab.title : 'Resuvika Note';
    const content = this.editor.value;

    const printWin = window.open('', '_blank');
    if (!printWin) {
      window.print();
      return;
    }

    // Convert markdown to clean HTML for print
    const htmlContent = content
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/==(.*?)==/gim, '<mark style="background:#fef08a;padding:2px 4px;border-radius:3px;">$1</mark>')
      .replace(/^- \[ \] (.*$)/gim, '<div style="margin:4px 0;">☐ $1</div>')
      .replace(/^- \[x\] (.*$)/gim, '<div style="margin:4px 0;text-decoration:line-through;color:#64748b;">☑ $1</div>')
      .replace(/^• (.*$)/gim, '<li>$1</li>')
      .replace(/^> (.*$)/gim, '<blockquote style="border-left:3px solid #3b82f6;padding-left:12px;color:#475569;margin:8px 0;">$1</blockquote>')
      .replace(/\n/gim, '<br>');

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title} - Vikashya Resuvika</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; line-height: 1.6; }
          h1, h2, h3 { color: #0f172a; margin-top: 20px; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:1px;text-transform:uppercase;">VIKASHYA RESUVIKA PRIVATE LIMITED</div>
        <h2>${title}</h2>
        <div>${htmlContent}</div>
        <div class="footer">
          <span>Resuvika Omni Pen / Omniball</span>
          <span>Printed on ${new Date().toLocaleDateString()}</span>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  renderTabs() {
    if (!this.tabsBar) return;
    const addBtn = document.getElementById('np-add-tab');
    this.tabsBar.querySelectorAll('.np-tab').forEach(t => t.remove());

    const filteredTabs = this.searchQuery
      ? this.tabs.filter(t => t.title.toLowerCase().includes(this.searchQuery) || t.content.toLowerCase().includes(this.searchQuery))
      : this.tabs;

    filteredTabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = 'np-tab' + (tab.id === this.activeTabId ? ' active' : '');
      
      const titleSpan = document.createElement('button');
      titleSpan.type='button';titleSpan.setAttribute('aria-label',`Open note ${tab.title}`);titleSpan.setAttribute('aria-pressed',String(tab.id===this.activeTabId));
      titleSpan.className = 'np-tab-title';
      titleSpan.textContent = tab.title;
      tabEl.appendChild(titleSpan);

      // Delete button for tab (if more than 1 tab)
      if (this.tabs.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.type='button';
        delBtn.className = 'np-tab-del';
        delBtn.textContent = '×';
        delBtn.title = 'Delete note';
        delBtn.setAttribute('aria-label',`Delete note ${tab.title}`);
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete "${tab.title}"?`)) {
            this.tabs = this.tabs.filter(t => t.id !== tab.id);
            if (this.activeTabId === tab.id) {
              this.activeTabId = this.tabs[0].id;
            }
            this.renderTabs();
            this.loadActiveTabContent();
            this.saveToStorage();
            this.broadcastNotepadUpdate();
          }
        });
        tabEl.appendChild(delBtn);
      }

      // Click to switch
      tabEl.addEventListener('click', () => {
        this.activeTabId = tab.id;
        this.renderTabs();
        this.loadActiveTabContent();
      });

      // Double-click to rename tab
      tabEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const newName = prompt('Rename note:', tab.title);
        if (newName && newName.trim()) {
          tab.title = newName.trim();
          this.renderTabs();
          this.saveToStorage();
          this.broadcastNotepadUpdate();
        }
      });

      this.tabsBar.insertBefore(tabEl, addBtn);
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
    this.updateStats();
  }

  saveToStorage() {
    try {
      localStorage.setItem('omnidraw_notepad', JSON.stringify({
        tabs: this.tabs,
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
        if (data.tabs && data.tabs.length > 0) {
          this.tabs = data.tabs;
          this.activeTabId = data.activeTabId || this.tabs[0].id;
        }
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
    if (this.saveStatus) this.saveStatus.textContent = '🔄 Synced from device';
  }
}

window.ClassNotepad = ClassNotepad;
