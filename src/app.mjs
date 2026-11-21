import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Purchases, ENTITLEMENT_VERIFICATION_MODE } from '@revenuecat/purchases-capacitor';
import { STORAGE_KEY, normalizeState, buildFullNoteVectorElements } from './store.mjs';
import { WhiteboardEngine } from './canvas-engine.mjs';

const FloatingOverlay = registerPlugin('FloatingOverlay');
const PrintDocument = registerPlugin('PrintDocument');
const config = typeof __MOBILE_CONFIG__ !== 'undefined' ? __MOBILE_CONFIG__ : { entitlement: 'pro', offering: 'default', androidPublicApiKey: '' };
const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();

const $ = (id) => document.getElementById(id);

let state = normalizeState(null);
let currentFolderId = 'all';
let activeNoteId = null;
let boardEngine = null;
let proActive = false;
let toastTimer = null;

function showToast(msg, ms = 3000) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

async function loadState() {
  try {
    let raw = null;
    if (isNative) {
      const res = await Preferences.get({ key: STORAGE_KEY });
      raw = res?.value;
    } else {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    if (raw) state = normalizeState(JSON.parse(raw));
  } catch {}
}

let saveTimer = null;
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistNow(), 250);
}

async function persistNow() {
  if (boardEngine) {
    state.boardPages = boardEngine.pages;
    state.activePageIndex = boardEngine.activePageIndex;
  }
  const serialized = JSON.stringify(state);
  try {
    if (isNative) await Preferences.set({ key: STORAGE_KEY, value: serialized });
    else localStorage.setItem(STORAGE_KEY, serialized);
  } catch {}
}

function go(screen) {
  document.body.dataset.screen = screen;
  hideEditorSubpanels();
  if (screen === 'folders') renderFolders();
  else if (screen === 'notes-list') renderNotesList();
  else if (screen === 'todo') renderTodos();
  else if (screen === 'reminders') renderReminders();
  else if (screen === 'board') {
    requestAnimationFrame(() => {
      boardEngine?.resize();
      updateBoardPageLabel();
    });
  }
}

// THEME ENGINE: Auto (System) / Crisp White / Pure Black OLED
const mediaDark = window.matchMedia?.('(prefers-color-scheme: dark)');
function applyTheme(mode) {
  const chosen = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
  state.settings.themeMode = chosen;
  const isDark = chosen === 'dark' || (chosen === 'auto' && Boolean(mediaDark?.matches));
  document.body.classList.toggle('theme-dark', isDark);
  document.body.classList.toggle('theme-light', !isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  boardEngine?.setDarkTheme(isDark);
  queueSave();
}
mediaDark?.addEventListener?.('change', () => {
  if (state.settings.themeMode === 'auto') applyTheme('auto');
});

// MODAL HELPERS
function openModal(title, builder) {
  $('modal-title').textContent = title;
  const body = $('modal-body');
  body.replaceChildren();
  builder(body);
  $('modal-backdrop').classList.remove('hidden');
}
function closeModal() {
  $('modal-backdrop').classList.add('hidden');
}
function modalBtn(label, onClick, cls = 'modal-btn') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.onclick = () => Promise.resolve().then(onClick).catch((e) => showToast(e?.message || 'Action failed'));
  return b;
}

// PAGE 1: FOLDERS HOME
function renderFolders() {
  $('count-all-notes').textContent = String(state.notes.length);
  const doneCount = state.todos.filter((t) => t.done).length;
  $('count-todos').textContent = `${doneCount}/${state.todos.length}`;
  $('count-reminders').textContent = String(state.reminders.filter((r) => !r.done).length);

  const box = $('subjects-list');
  box.replaceChildren();
  for (const folder of state.folders) {
    const count = state.notes.filter((n) => n.folderId === folder.id).length;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'folder-row';
    row.innerHTML = `<span class="row-left"><span class="gold-ico">📒</span><span class="row-title"></span></span><span class="row-right">${count} <span class="chev">›</span></span>`;
    row.querySelector('.row-title').textContent = folder.name;
    row.onclick = () => {
      currentFolderId = folder.id;
      go('notes-list');
    };
    box.append(row);
  }
}

function createNewNote(folderId = null) {
  const targetFolder = folderId && folderId !== 'all' ? folderId : state.folders[0]?.id || 'folder-class';
  const note = {
    id: `note-${Date.now()}`,
    folderId: targetFolder,
    title: '',
    content: '',
    paper: state.settings.defaultPaper || 'plain',
    pinned: false,
    updatedAt: Date.now()
  };
  state.notes.unshift(note);
  queueSave();
  openNoteEditor(note.id);
}

// PAGE 2: NOTES LIST
function renderNotesList() {
  const folder = state.folders.find((f) => f.id === currentFolderId);
  $('list-folder-title').textContent = currentFolderId === 'all' ? 'All Notes' : (folder?.name || 'Notes');
  const q = ($('list-search').value || '').trim().toLowerCase();

  const matching = state.notes.filter((n) => {
    if (currentFolderId !== 'all' && n.folderId !== currentFolderId) return false;
    if (!q) return true;
    return `${n.title}\n${n.content}`.toLowerCase().includes(q);
  });

  $('list-note-count').textContent = `${matching.length} ${matching.length === 1 ? 'Note' : 'Notes'}`;

  const pinned = matching.filter((n) => n.pinned);
  const regular = matching.filter((n) => !n.pinned);

  const container = $('notes-list-container');
  container.replaceChildren();

  const appendGroup = (label, items) => {
    if (!items.length) return;
    const lbl = document.createElement('div');
    lbl.className = 'section-label';
    lbl.textContent = label;
    container.append(lbl);

    const card = document.createElement('div');
    card.className = 'grouped-card';
    for (const note of items) {
      const row = document.createElement('div');
      row.className = 'note-card-row';

      const main = document.createElement('div');
      main.className = 'note-card-main';
      const titleEl = document.createElement('div');
      titleEl.className = 'note-card-title';
      titleEl.textContent = note.title.trim() || 'Untitled Note';
      const subEl = document.createElement('div');
      subEl.className = 'note-card-sub';
      const snippet = (note.content || '').replace(/\s+/g, ' ').trim() || 'No additional text';
      subEl.textContent = `${new Date(note.updatedAt).toLocaleDateString()} · ${snippet}`;
      main.append(titleEl, subEl);
      main.onclick = () => openNoteEditor(note.id);

      const acts = document.createElement('div');
      acts.className = 'note-mini-actions';
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = 'mini-act-btn';
      pinBtn.textContent = note.pinned ? 'Unpin' : 'Pin';
      pinBtn.onclick = (e) => {
        e.stopPropagation();
        note.pinned = !note.pinned;
        queueSave();
        renderNotesList();
      };
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'mini-act-btn';
      delBtn.textContent = 'Del';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        state.notes = state.notes.filter((x) => x.id !== note.id);
        queueSave();
        renderNotesList();
      };
      acts.append(pinBtn, delBtn);

      row.append(main, acts);
      card.append(row);
    }
    container.append(card);
  };

  if (!matching.length) {
    const empty = document.createElement('p');
    empty.className = 'muted-lbl';
    empty.style.cssText = 'text-align:center;margin-top:48px;';
    empty.textContent = 'No notes yet. Tap the golden button below to start writing.';
    container.append(empty);
  } else {
    appendGroup('PINNED', pinned);
    appendGroup('NOTES', regular);
  }
}

// PAGE 3: FOCUSED NOTE EDITOR
function getActiveNote() {
  return state.notes.find((n) => n.id === activeNoteId) || state.notes[0];
}

function openNoteEditor(noteId) {
  activeNoteId = noteId;
  const note = getActiveNote();
  if (!note) return;
  $('editor-title').value = note.title || '';
  $('editor-body').value = note.content || '';
  applyNotePaper(note.paper || 'plain');
  renderInteractiveChecklists();
  go('editor');
}

function applyNotePaper(paper) {
  const el = $('editor-paper');
  el.classList.remove('paper-plain', 'paper-ruled', 'paper-grid', 'paper-dots');
  el.classList.add(`paper-${paper || 'plain'}`);
  const note = getActiveNote();
  if (note) {
    note.paper = paper;
    queueSave();
  }
}

function renderInteractiveChecklists() {
  const bar = $('interactive-checklist-bar');
  const text = $('editor-body').value || '';
  const lines = text.split(/\r?\n/);
  bar.replaceChildren();
  lines.forEach((line, idx) => {
    const m = line.match(/^\s*(☐|☑|\[ \]|\[x\])\s+(.*)$/i);
    if (!m) return;
    const done = m[1] === '☑' || m[1].toLowerCase() === '[x]';
    const item = document.createElement('div');
    item.className = 'chk-pill' + (done ? ' done' : '');
    item.innerHTML = `<span class="chk-circle">${done ? '✓' : ''}</span><span class="chk-txt"></span>`;
    item.querySelector('.chk-txt').textContent = m[2];
    item.onclick = () => {
      const updated = $('editor-body').value.split(/\r?\n/);
      updated[idx] = `${done ? '☐' : '☑'} ${m[2]}`;
      $('editor-body').value = updated.join('\n');
      syncEditorToNote();
      renderInteractiveChecklists();
    };
    bar.append(item);
  });
}

function syncEditorToNote() {
  const note = getActiveNote();
  if (!note) return;
  note.title = $('editor-title').value;
  note.content = $('editor-body').value;
  note.updatedAt = Date.now();
  queueSave();
}

function hideEditorSubpanels() {
  $('editor-format-panel')?.classList.add('hidden');
  $('editor-paper-panel')?.classList.add('hidden');
  $('editor-attach-panel')?.classList.add('hidden');
}

function toggleSubpanel(id) {
  const el = $(id);
  const wasHidden = el.classList.contains('hidden');
  hideEditorSubpanels();
  if (wasHidden) el.classList.remove('hidden');
}

async function transferWholeNoteToBoard() {
  syncEditorToNote();
  const note = getActiveNote();
  const title = (note?.title || '').trim();
  const content = (note?.content || '').trim();
  if (!title && !content) {
    showToast('Write something in your note first');
    return;
  }
  const isDark = document.body.classList.contains('theme-dark');
  const vecEls = buildFullNoteVectorElements({
    title,
    content,
    boardWidth: boardEngine?.width || window.innerWidth,
    isDark
  });

  if (boardEngine.page.elements.length > 0) {
    boardEngine.addNewPage();
  }
  for (const el of vecEls) {
    boardEngine.page.elements.push(el);
  }
  boardEngine.renderAll();
  queueSave();
  go('board');
  showToast('Full note placed on Whiteboard in crisp HD!');
}

// TO-DO LIST VIEW
function renderTodos() {
  const doneCount = state.todos.filter((t) => t.done).length;
  $('todo-progress-lbl').textContent = `${doneCount}/${state.todos.length} done`;
  const box = $('todo-list-items');
  box.replaceChildren();
  if (!state.todos.length) {
    const p = document.createElement('p');
    p.className = 'muted-lbl';
    p.style.textAlign = 'center';
    p.textContent = 'No tasks yet. Add your first task above.';
    box.append(p);
    return;
  }
  for (const t of state.todos) {
    const row = document.createElement('div');
    row.className = 'task-item' + (t.done ? ' done' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!t.done;
    cb.onchange = () => {
      t.done = cb.checked;
      queueSave();
      renderTodos();
    };
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = t.title;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mini-act-btn';
    del.textContent = 'Del';
    del.onclick = () => {
      state.todos = state.todos.filter((x) => x.id !== t.id);
      queueSave();
      renderTodos();
    };
    row.append(cb, title, del);
    box.append(row);
  }
}

// REMINDERS VIEW + EXACT ANDROID NOTIFICATION
function renderReminders() {
  const box = $('rem-list-items');
  box.replaceChildren();
  if (!state.reminders.length) {
    const p = document.createElement('p');
    p.className = 'muted-lbl';
    p.style.textAlign = 'center';
    p.textContent = 'No scheduled reminders yet.';
    box.append(p);
    return;
  }
  for (const r of state.reminders) {
    const row = document.createElement('div');
    row.className = 'task-item' + (r.done ? ' done' : '');
    const info = document.createElement('div');
    info.style.flex = '1';
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = r.title;
    const sub = document.createElement('div');
    sub.className = 'note-card-sub';
    sub.textContent = r.time ? new Date(r.time).toLocaleString() : 'No time set';
    info.append(title, sub);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mini-act-btn';
    del.textContent = 'Del';
    del.onclick = () => {
      state.reminders = state.reminders.filter((x) => x.id !== r.id);
      queueSave();
      renderReminders();
    };
    row.append(info, del);
    box.append(row);
  }
}

function updateBoardPageLabel() {
  if (!boardEngine) return;
  $('wb-page-label').textContent = `${boardEngine.activePageIndex + 1} / ${boardEngine.pages.length}`;
}

async function shareCurrentNote() {
  syncEditorToNote();
  const note = getActiveNote();
  const title = note?.title?.trim() || 'Resuvika Note';
  const text = `${title}\n\n${note?.content || ''}`.trim();
  if (!text) return showToast('Write a note first');
  try {
    if (isNative) await Share.share({ title, text, dialogTitle: 'Share Note' });
    else if (navigator.share) await navigator.share({ title, text });
    else {
      await navigator.clipboard?.writeText(text);
      showToast('Copied to clipboard');
    }
  } catch {}
}

async function shareBoardPng() {
  const dataUrl = boardEngine.exportPngDataUrl();
  const b64 = dataUrl.split(',')[1];
  try {
    if (isNative) {
      const res = await Filesystem.writeFile({
        path: `exports/Board-${Date.now()}.png`,
        data: b64,
        directory: Directory.Cache,
        recursive: true
      });
      await Share.share({ title: 'Resuvika Whiteboard', files: [res.uri] });
    } else {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Resuvika-Board-${Date.now()}.png`;
      a.click();
    }
  } catch (e) {
    showToast(e?.message || 'Could not share board');
  }
}

// SETTINGS MODAL (Theme Auto/White/Black + Draw Over Apps + Pro Ad Removal)
function openSettingsModal() {
  openModal('Settings', (body) => {
    const lbl = document.createElement('div');
    lbl.className = 'section-label';
    lbl.style.margin = '0 0 4px';
    lbl.textContent = 'APPEARANCE (AUTO WHITE / BLACK)';
    body.append(lbl);

    const row = document.createElement('div');
    row.className = 'theme-row';
    for (const [m, text] of [['auto', 'Auto'], ['light', 'White'], ['dark', 'Black']]) {
      const b = modalBtn(text, () => {
        applyTheme(m);
        openSettingsModal();
      }, 'theme-opt' + (state.settings.themeMode === m ? ' active' : ''));
      row.append(b);
    }
    body.append(row);

    body.append(
      modalBtn('Draw Over Other Apps (Floating Creator Pen)', () => openDrawOverAppsModal()),
      modalBtn(proActive ? 'Ad-Free Pro Active' : 'Remove Ads (Upgrade to Pro)', () => openProModal())
    );
  });
}

async function openDrawOverAppsModal() {
  let allowed = false;
  if (isNative && platform === 'android') {
    try {
      const st = await FloatingOverlay.status();
      allowed = !!st?.allowed;
    } catch {}
  }
  openModal('Draw Over Other Apps', (body) => {
    const info = document.createElement('p');
    info.className = 'muted-lbl';
    info.textContent = allowed
      ? 'Permission is enabled! Start the floating pen to draw over YouTube, PDFs, or any app.'
      : 'Allow "Display over other apps" in Android Settings first, then tap Start Floating Tools.';
    body.append(info);
    if (isNative && platform === 'android') {
      if (!allowed) {
        body.append(modalBtn('Allow Display Over Other Apps', () => FloatingOverlay.requestPermission(), 'modal-btn gold'));
      }
      body.append(
        modalBtn('Start Floating Tools', async () => {
          await FloatingOverlay.start();
          closeModal();
        }, 'modal-btn gold'),
        modalBtn('Stop Floating Tools', async () => {
          await FloatingOverlay.stop();
          closeModal();
          showToast('Floating tools stopped');
        })
      );
    }
  });
}

async function openProModal() {
  openModal('Resuvika Notes Pro', (body) => {
    const p = document.createElement('p');
    p.className = 'muted-lbl';
    p.textContent = proActive
      ? 'Your Ad-Free Pro subscription is active!'
      : 'All note & drawing tools are 100% free with ads. Upgrade anytime to remove ads permanently.';
    body.append(p);
    if (!proActive && isNative) {
      body.append(
        modalBtn('Restore Purchases', async () => {
          const info = await Purchases.restorePurchases();
          proActive = Boolean(info?.customerInfo?.entitlements?.active?.[config.entitlement]);
          document.body.classList.toggle('pro-active', proActive);
          showToast(proActive ? 'Pro restored!' : 'No active purchase found');
          closeModal();
        }, 'modal-btn gold')
      );
    }
  });
}

function openBoardConnectModal() {
  openModal('Share & Smart TV Mirror', (body) => {
    const p = document.createElement('p');
    p.className = 'muted-lbl';
    p.textContent = 'Zero IP addresses required — mirror directly to any Smart TV or share cleanly:';
    body.append(p);
    if (isNative && platform === 'android') {
      body.append(modalBtn('Cast Screen to Smart TV (Smart View)', () => FloatingOverlay.openCastSettings(), 'modal-btn gold'));
    }
    body.append(
      modalBtn('Share Whiteboard Image (PNG)', () => { closeModal(); shareBoardPng(); }),
      modalBtn('Switch Board Paper (Dots / Grid / Plain / Black)', () => {
        const order = ['dots', 'grid', 'ruled', 'white', 'black'];
        const next = order[(order.indexOf(boardEngine.page.paper) + 1) % order.length];
        boardEngine.setPaper(next);
        closeModal();
        showToast(`Paper: ${next}`);
      }),
      modalBtn('Clear Current Whiteboard Page', () => {
        boardEngine.clearPage();
        closeModal();
      })
    );
  });
}

async function init() {
  await loadState();

  boardEngine = new WhiteboardEngine($('wb-bg'), $('wb-draw'), queueSave);
  boardEngine.setPages(state.boardPages, state.activePageIndex);
  applyTheme(state.settings.themeMode || 'auto');

  // Reminder ticker (fires Android notification + toast while app is open)
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const r of state.reminders) {
      if (!r.done && !r.notified && r.time) {
        const ts = new Date(r.time).getTime();
        if (Number.isFinite(ts) && ts <= now) {
          r.notified = true;
          changed = true;
          showToast(`Reminder: ${r.title}`, 6000);
          if (isNative && platform === 'android') {
            FloatingOverlay.showReminderNow({ id: Math.abs(now & 0x7fffffff), title: r.title }).catch(() => {});
          }
        }
      }
    }
    if (changed) { queueSave(); if (document.body.dataset.screen === 'reminders') renderReminders(); }
  }, 10000);

  // Page 1 Events
  $('btn-open-settings').onclick = openSettingsModal;
  $('btn-modal-close').onclick = closeModal;
  $('modal-backdrop').onclick = (e) => { if (e.target === $('modal-backdrop')) closeModal(); };

  $('btn-new-folder').onclick = () => {
    openModal('New Subject Folder', (body) => {
      const inp = document.createElement('input');
      inp.className = 'ios-input';
      inp.placeholder = 'Folder name (e.g. Chemistry)';
      body.append(inp, modalBtn('Create Folder', () => {
        const name = inp.value.trim();
        if (!name) return;
        state.folders.push({ id: `folder-${Date.now()}`, name });
        queueSave();
        closeModal();
        renderFolders();
      }, 'modal-btn gold'));
      requestAnimationFrame(() => inp.focus());
    });
  };

  $('global-search').oninput = () => {
    const q = $('global-search').value.trim().toLowerCase();
    const resBox = $('global-search-results');
    const mainGroups = $('folders-main-groups');
    if (!q) {
      resBox.classList.add('hidden');
      mainGroups.classList.remove('hidden');
      return;
    }
    mainGroups.classList.add('hidden');
    resBox.classList.remove('hidden');
    resBox.replaceChildren();
    const hits = state.notes.filter((n) => `${n.title}\n${n.content}`.toLowerCase().includes(q));
    if (!hits.length) {
      const p = document.createElement('div');
      p.className = 'folder-row';
      p.textContent = 'No matching notes found';
      resBox.append(p);
      return;
    }
    for (const n of hits) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'folder-row';
      b.textContent = n.title.trim() || 'Untitled Note';
      b.onclick = () => openNoteEditor(n.id);
      resBox.append(b);
    }
  };

  $('row-all-notes').onclick = () => { currentFolderId = 'all'; go('notes-list'); };
  $('row-todo-list').onclick = () => go('todo');
  $('row-reminders').onclick = () => go('reminders');
  $('nav-tab-board').onclick = () => go('board');
  $('btn-compose-from-folders').onclick = () => createNewNote('all');

  // Page 2 Events
  $('btn-list-back').onclick = () => go('folders');
  $('list-search').oninput = renderNotesList;
  $('btn-compose-from-list').onclick = () => createNewNote(currentFolderId);
  $('btn-list-more').onclick = () => {
    openModal('Notes Options', (body) => {
      body.append(
        modalBtn('New Note Here', () => { closeModal(); createNewNote(currentFolderId); }, 'modal-btn gold'),
        modalBtn('Theme Settings (Auto / White / Black)', () => openSettingsModal())
      );
    });
  };

  // Page 3 Editor Events
  $('btn-editor-back').onclick = () => { syncEditorToNote(); go('notes-list'); };
  $('btn-editor-share').onclick = shareCurrentNote;
  $('btn-editor-done').onclick = () => {
    $('editor-title').blur();
    $('editor-body').blur();
    hideEditorSubpanels();
    syncEditorToNote();
    showToast('Saved');
  };
  $('btn-editor-more').onclick = () => {
    openModal('Note Options', (body) => {
      body.append(
        modalBtn('Transfer Full Note to Whiteboard (HD)', () => { closeModal(); transferWholeNoteToBoard(); }, 'modal-btn gold'),
        modalBtn('Export Clean PDF', () => { closeModal(); $('btn-export-pdf').click(); }),
        modalBtn('Share via WhatsApp', () => { closeModal(); $('btn-share-wa').click(); }),
        modalBtn('Theme (Auto / White / Black)', () => openSettingsModal())
      );
    });
  };

  $('editor-title').oninput = syncEditorToNote;
  $('editor-body').oninput = () => { syncEditorToNote(); renderInteractiveChecklists(); };

  // 2-Finger Swipe Right -> Folders Home
  let twoFX = null;
  $('screen-editor').addEventListener('touchstart', (e) => {
    twoFX = e.touches?.length === 2 ? (e.touches[0].clientX + e.touches[1].clientX) / 2 : null;
  }, { passive: true });
  $('screen-editor').addEventListener('touchmove', (e) => {
    if (twoFX !== null && e.touches?.length === 2) {
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      if (cx - twoFX > 55) { twoFX = null; syncEditorToNote(); go('folders'); }
    }
  }, { passive: true });
  $('screen-editor').addEventListener('touchend', () => { twoFX = null; }, { passive: true });

  // Editor Capsule Dock
  $('dock-aa').onclick = () => toggleSubpanel('editor-format-panel');
  $('dock-paper').onclick = () => toggleSubpanel('editor-paper-panel');
  $('dock-attach').onclick = () => toggleSubpanel('editor-attach-panel');
  $('dock-board').onclick = () => { syncEditorToNote(); go('board'); };
  $('dock-check').onclick = () => {
    const ed = $('editor-body');
    const pos = ed.selectionStart ?? ed.value.length;
    const prefix = pos > 0 && ed.value[pos - 1] !== '\n' ? '\n☐ ' : '☐ ';
    ed.value = ed.value.slice(0, pos) + prefix + ed.value.slice(pos);
    ed.focus();
    ed.selectionStart = ed.selectionEnd = pos + prefix.length;
    syncEditorToNote();
    renderInteractiveChecklists();
  };
  $('dock-voice').onclick = async () => {
    let spoken = '';
    if (isNative && platform === 'android') {
      try {
        const res = await FloatingOverlay.dictateSpeech({ language: '' });
        if (!res?.cancelled) spoken = String(res?.text || '').trim();
      } catch (e) { showToast(e?.message || 'Speech unavailable'); }
    } else {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        spoken = await new Promise((resolve) => {
          const r = new SR();
          r.lang = navigator.language || 'en-IN';
          r.onresult = (ev) => resolve(ev.results?.[0]?.[0]?.transcript || '');
          r.onerror = () => resolve('');
          r.onend = () => resolve('');
          r.start();
        });
      }
    }
    if (spoken) {
      const ed = $('editor-body');
      ed.value = (ed.value.trim() ? `${ed.value}\n` : '') + spoken;
      syncEditorToNote();
      renderInteractiveChecklists();
      showToast('Added dictated text');
    }
  };

  document.querySelectorAll('#editor-format-panel [data-fmt]').forEach((b) => {
    b.onclick = () => {
      const ed = $('editor-body');
      const fmt = b.dataset.fmt;
      const prefix = fmt === 'h1' ? '# ' : fmt === 'bullet' ? '• ' : fmt === 'quote' ? '> ' : '**';
      const suffix = fmt === 'bold' ? '**' : '';
      const pos = ed.selectionStart ?? ed.value.length;
      ed.value = ed.value.slice(0, pos) + prefix + suffix + ed.value.slice(pos);
      ed.focus();
      syncEditorToNote();
    };
  });
  let editorFontPx = 17;
  $('btn-font-dec').onclick = () => { editorFontPx = Math.max(13, editorFontPx - 2); $('editor-body').style.fontSize = `${editorFontPx}px`; };
  $('btn-font-inc').onclick = () => { editorFontPx = Math.min(28, editorFontPx + 2); $('editor-body').style.fontSize = `${editorFontPx}px`; };
  document.querySelectorAll('#editor-paper-panel [data-paper]').forEach((b) => {
    b.onclick = () => { applyNotePaper(b.dataset.paper); hideEditorSubpanels(); };
  });

  $('btn-to-board-hd').onclick = () => { hideEditorSubpanels(); transferWholeNoteToBoard(); };
  $('btn-export-pdf').onclick = async () => {
    const note = getActiveNote();
    const html = `<html><body style="font-family:sans-serif;padding:24px;"><h1>${(note?.title || 'Note').replace(/</g, '&lt;')}</h1><pre style="white-space:pre-wrap;font:inherit;">${(note?.content || '').replace(/</g, '&lt;')}</pre></body></html>`;
    if (isNative && platform === 'android') {
      try { await PrintDocument.print({ html, name: note?.title || 'Resuvika-Note' }); }
      catch { window.print(); }
    } else window.print();
  };
  $('btn-share-wa').onclick = () => {
    const n = getActiveNote();
    const txt = `*${n?.title || 'Note'}*\n\n${n?.content || ''}`.trim();
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  };
  $('btn-export-md').onclick = async () => {
    const n = getActiveNote();
    const md = `# ${n?.title || 'Note'}\n\n${n?.content || ''}`;
    if (isNative) {
      const res = await Filesystem.writeFile({ path: `exports/${Date.now()}.md`, data: md, directory: Directory.Cache, encoding: 'utf8', recursive: true });
      await Share.share({ title: n?.title || 'Note', files: [res.uri] });
    } else {
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Note.md'; a.click();
    }
  };

  // To-Do & Reminders Events
  $('btn-todo-back').onclick = () => go('folders');
  $('btn-add-todo').onclick = () => {
    const inp = $('todo-input');
    const title = inp.value.trim();
    if (!title) return;
    state.todos.unshift({ id: `todo-${Date.now()}`, title, done: false });
    inp.value = '';
    queueSave();
    renderTodos();
  };

  $('btn-rem-back').onclick = () => go('folders');
  $('btn-add-rem').onclick = async () => {
    const title = $('rem-title-input').value.trim();
    const time = $('rem-time-input').value;
    if (!title) return showToast('Enter a reminder title');
    const rem = { id: `rem-${Date.now()}`, title, time, done: false, notified: false };
    state.reminders.unshift(rem);
    $('rem-title-input').value = '';
    $('rem-time-input').value = '';
    queueSave();
    renderReminders();
    if (time && isNative && platform === 'android') {
      const triggerAt = new Date(time).getTime();
      if (Number.isFinite(triggerAt)) {
        const nid = Math.abs(Date.now() & 0x7fffffff);
        FloatingOverlay.scheduleReminder({ id: nid, title, triggerAt }).catch(() => {});
      }
    }
    showToast('Reminder scheduled!');
  };

  // Page 4 Whiteboard Events
  $('btn-wb-notes').onclick = () => go(activeNoteId ? 'editor' : 'folders');
  $('btn-wb-prev').onclick = () => { boardEngine.prevPage(); updateBoardPageLabel(); };
  $('btn-wb-next').onclick = () => { boardEngine.nextPage(); updateBoardPageLabel(); };
  $('btn-wb-add-page').onclick = () => { boardEngine.addNewPage(); updateBoardPageLabel(); showToast('New blank page'); };
  $('btn-wb-connect').onclick = openBoardConnectModal;
  $('btn-draw-over-apps').onclick = openDrawOverAppsModal;
  $('btn-remove-ads').onclick = openProModal;

  document.querySelectorAll('.wb-tool[data-wb-tool]').forEach((b) => {
    b.onclick = () => {
      boardEngine.activeTool = b.dataset.wbTool;
      document.querySelectorAll('.wb-tool[data-wb-tool]').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  $('btn-wb-undo').onclick = () => boardEngine.undo();
  document.querySelectorAll('.ink-dot[data-ink]').forEach((d) => {
    d.onclick = () => {
      boardEngine.currentColor = d.dataset.ink;
      document.querySelectorAll('.ink-dot').forEach((x) => x.classList.toggle('active', x === d));
    };
  });
  $('btn-wb-photo').onclick = () => $('wb-photo-input').click();
  $('wb-photo-input').onchange = (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = Math.min(boardEngine.width - 32, 680);
        const sc = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * sc);
        const h = Math.round(img.height * sc);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        boardEngine.addElement({
          type: 'image',
          x: Math.round((boardEngine.width - w) / 2 - (boardEngine.page.panX || 0)),
          y: Math.round(96 - (boardEngine.page.panY || 0)),
          width: w, height: h,
          src: c.toDataURL('image/jpeg', 0.88)
        });
        showToast('Photo added! Draw directly over it.');
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
    ev.target.value = '';
  };

  // Android Hardware Back Navigation
  if (isNative) {
    App.addListener('backButton', () => {
      if (!$('modal-backdrop').classList.contains('hidden')) return closeModal();
      const s = document.body.dataset.screen;
      if (s === 'editor') return go('notes-list');
      if (s === 'notes-list' || s === 'todo' || s === 'reminders') return go('folders');
      if (s === 'board') return go('folders');
      App.minimizeApp();
    });
  }

  // RevenueCat Init (Non-blocking)
  if (isNative && platform === 'android' && config.androidPublicApiKey) {
    Purchases.configure({
      apiKey: config.androidPublicApiKey,
      entitlementVerificationMode: ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL
    }).then(() => Purchases.getCustomerInfo()).then((res) => {
      proActive = Boolean(res?.customerInfo?.entitlements?.active?.[config.entitlement]);
      document.body.classList.toggle('pro-active', proActive);
    }).catch(() => {});
  }

  renderFolders();
  go('folders');
}

document.addEventListener('DOMContentLoaded', () => init().catch(() => {}));
