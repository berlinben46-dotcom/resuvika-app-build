/**
 * Offline-first state store for Resuvika Notes & Whiteboard Studio.
 */

export const STORAGE_KEY = 'resuvika_notes_studio_v1';

export function createInitialState() {
  const now = Date.now();
  return {
    version: 1,
    settings: {
      themeMode: 'auto', // 'auto' | 'light' | 'dark'
      sidebarTint: '#f2f2f7',
      defaultPaper: 'plain',
      boardPaper: 'dots',
      boardColor: '#0f172a',
      boardSize: 4
    },
    folders: [
      { id: 'folder-physics', name: 'Physics & Math' },
      { id: 'folder-class', name: 'Class Notes' }
    ],
    notes: [
      {
        id: 'note-welcome-1',
        folderId: 'folder-physics',
        title: 'Chapter 1: Motion & Laws',
        content:
          "Newton's Second Law: F = m × a\nKinetic Energy: KE = ½mv²\n\n☐ Review lecture formulas\n☑ Draw vector diagram",
        paper: 'plain',
        pinned: true,
        updatedAt: now
      },
      {
        id: 'note-welcome-2',
        folderId: 'folder-class',
        title: 'Kinetic Energy & Vectors',
        content: 'Tap ✏️ below anytime to sketch triangles or transfer this full note to the Whiteboard in crisp HD.',
        paper: 'ruled',
        pinned: false,
        updatedAt: now - 3600000
      }
    ],
    todos: [
      { id: 'todo-1', title: 'Review lecture formulas', done: true },
      { id: 'todo-2', title: 'Practice vector diagram on Whiteboard', done: false },
      { id: 'todo-3', title: 'Record voice summary in class', done: false }
    ],
    reminders: [],
    boardPages: [
      { id: 'page-1', paper: 'dots', panX: 0, panY: 0, elements: [] }
    ],
    activePageIndex: 0
  };
}

export function normalizeState(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    settings: { ...base.settings, ...(raw.settings || {}) },
    folders: Array.isArray(raw.folders) && raw.folders.length ? raw.folders : base.folders,
    notes: Array.isArray(raw.notes) ? raw.notes : base.notes,
    todos: Array.isArray(raw.todos) ? raw.todos : base.todos,
    reminders: Array.isArray(raw.reminders) ? raw.reminders : base.reminders,
    boardPages:
      Array.isArray(raw.boardPages) && raw.boardPages.length
        ? raw.boardPages
        : base.boardPages,
    activePageIndex: Number.isInteger(raw.activePageIndex)
      ? Math.max(0, Math.min(raw.activePageIndex, (raw.boardPages?.length || 1) - 1))
      : 0
  };
}

export function wrapNoteTextLines(rawText, maxCharsPerLine = 30) {
  const lines = [];
  for (const para of String(rawText || '').split(/\r?\n/)) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of trimmed.split(/\s+/)) {
      if ((current + ' ' + word).trim().length > maxCharsPerLine && current) {
        lines.push(current);
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export function buildFullNoteVectorElements({ title, content, boardWidth = 390, isDark = false }) {
  const titleSize = Math.max(20, Math.min(28, Math.round(boardWidth / 16)));
  const bodySize = Math.max(15, Math.min(22, Math.round(boardWidth / 22)));
  const maxChars = Math.max(24, Math.floor((boardWidth - 48) / (bodySize * 0.56)));
  const color = isDark ? '#f8fafc' : '#0f172a';
  const accentColor = '#eab308';

  const elements = [];
  let y = 96;

  if (title && title.trim()) {
    for (const tLine of wrapNoteTextLines(title.trim(), Math.max(18, maxChars - 6))) {
      elements.push({ type: 'text', x: 24, y, text: tLine, color: accentColor, fontSize: titleSize, bold: true });
      y += Math.round(titleSize * 1.38);
    }
    y += 10;
  }

  for (const line of wrapNoteTextLines(content, maxChars)) {
    if (line) {
      elements.push({ type: 'text', x: 24, y, text: line, color, fontSize: bodySize });
    }
    y += Math.round(bodySize * 1.48);
  }

  return elements;
}
