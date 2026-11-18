/**
 * Class Voice Notes: Multi-language Voice-to-Text Dictation (Whiteboard & Notepad)
 * + Offline Audio Recording (Native Android MediaRecorder + IndexedDB).
 */
import { Capacitor } from '@capacitor/core';
import { FloatingOverlay } from './shell.mjs';

const DB_NAME = 'resuvika_voice_notes_db';
const STORE_NAME = 'notes';
const LANG_KEY = 'resuvika_dictate_lang_v1';
const TARGET_KEY = 'resuvika_dictate_target_v1';

const LANGUAGES = [
  ['', 'Auto (Phone Language)'],
  ['en-IN', 'English (India)'],
  ['en-US', 'English (US)'],
  ['hi-IN', 'हिन्दी (Hindi)'],
  ['ta-IN', 'தமிழ் (Tamil)'],
  ['te-IN', 'తెలుగు (Telugu)'],
  ['bn-IN', 'বাংলা (Bengali)'],
  ['mr-IN', 'मराठी (Marathi)'],
  ['gu-IN', 'ગુજરાતી (Gujarati)'],
  ['kn-IN', 'ಕನ್ನಡ (Kannada)'],
  ['es-ES', 'Español (Spanish)'],
  ['fr-FR', 'Français (French)'],
  ['ar-SA', 'العربية (Arabic)']
];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function listNotes() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function saveNote(note) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(note);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteNote(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const type of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
  }
  return '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mimeType) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType || 'audio/mp4' });
}

function wrapText(text, maxChars = 28) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function createVoiceNotesManager({ sheet, closeSheet, el, button, shareFile, toast }) {
  const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  let nativeRecording = false;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = null;
  let needsMicSettings = false;
  let lastDictatedText = '';

  const pill = () => document.getElementById('mob-btn-voice');

  const resetPill = () => {
    clearInterval(timerId);
    timerId = null;
    const btn = pill();
    if (btn) {
      btn.classList.remove('recording');
      btn.textContent = '🎙️ Voice';
    }
  };

  const startTimerUi = () => {
    startedAt = Date.now();
    const btn = pill();
    if (btn) {
      btn.classList.add('recording');
      btn.textContent = '🔴 0:00';
    }
    timerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const b = pill();
      if (b) b.textContent = `🔴 ${formatDuration(elapsed)}`;
    }, 1000);
  };

  function writeToWhiteboard(text) {
    const clean = String(text || '').trim();
    const board = window.drawingCanvas;
    if (!clean || !board) return;
    const fontSize = Math.max(18, Math.min(36, board.textFontSize || 24));
    const lines = wrapText(clean, 26);
    const startX = Math.round(Math.max(24, (board.width / 2 - 140) - (board.panX || 0)));
    const startY = Math.round(Math.max(90, (board.height / 3) - (board.panY || 0)));
    lines.forEach((line, idx) => {
      board.addElement({
        type: 'text',
        x: startX,
        y: startY + idx * Math.round(fontSize * 1.35),
        text: line,
        color: board.currentColor || '#0f172a',
        fontSize
      });
    });
    window.dispatchEvent(new Event('boardchanged'));
    toast?.('✏️ Written onto Whiteboard!', 3000);
  }

  function writeToNotepad(text, openPad = true) {
    const clean = String(text || '').trim();
    const editor = document.getElementById('np-editor');
    if (!clean || !editor) return;
    const prefix = editor.value.trim() ? '\n' : '';
    editor.value = `${editor.value}${prefix}${clean}`;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    window.classNotepad?.saveToStorage?.();
    if (openPad) {
      closeSheet?.();
      document.body.classList.remove('menus-hidden', 'tablet-tools-hidden');
      document.getElementById('floating-notepad')?.classList.remove('hidden');
    }
    toast?.('📝 Added to Classpad Notes!', 3000);
  }

  async function dictateNow(forceTarget) {
    const language = localStorage.getItem(LANG_KEY) || '';
    const target = forceTarget || localStorage.getItem(TARGET_KEY) || 'whiteboard';

    let spoken = '';
    if (isNative) {
      try {
        const res = await FloatingOverlay.dictateSpeech({ language });
        if (res?.cancelled) return '';
        spoken = String(res?.text || '').trim();
      } catch (err) {
        toast?.(err?.message || 'Speech recognition is unavailable.', 4000);
        return '';
      }
    } else {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        toast?.('Voice dictation is not supported in this browser.', 3500);
        return '';
      }
      spoken = await new Promise((resolve) => {
        const rec = new SR();
        rec.lang = language || navigator.language || 'en-IN';
        rec.interimResults = false;
        rec.onresult = (e) => resolve(e.results?.[0]?.[0]?.transcript || '');
        rec.onerror = () => resolve('');
        rec.onend = () => resolve('');
        rec.start();
      });
    }

    if (!spoken) return '';
    lastDictatedText = spoken;
    if (target === 'notepad') {
      writeToNotepad(spoken, true);
    } else {
      writeToWhiteboard(spoken);
      showVoiceNotes();
    }
    return spoken;
  }

  async function saveCapturedBlob(blob, durationSec, mimeType) {
    const now = new Date();
    const note = {
      id: `voice-${Date.now()}`,
      title: `Class Voice ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: Date.now(),
      durationSec,
      mimeType,
      blob
    };
    await saveNote(note);
    toast?.(`🎙️ Saved ${note.title} (${formatDuration(durationSec)})!`, 3500);
    showVoiceNotes();
  }

  async function startRecording() {
    needsMicSettings = false;
    if (isNative) {
      try {
        const res = await FloatingOverlay.startVoiceRecord();
        if (res?.needsSettings) {
          needsMicSettings = true;
          toast?.('Microphone is blocked. Tap "Open Microphone Settings" to allow.', 4500);
          showVoiceNotes();
          return false;
        }
        if (res?.started) {
          nativeRecording = true;
          startTimerUi();
          toast?.('🎙️ Recording class audio… Tap 🔴 at top-right to stop & save.', 3000);
          return true;
        }
      } catch (err) {
        toast?.(err?.message || 'Could not start microphone.', 4000);
        showVoiceNotes();
        return false;
      }
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast?.('Audio recording is not supported on this device.', 3500);
      showVoiceNotes();
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      needsMicSettings = true;
      toast?.('Microphone permission is needed to record audio.', 4000);
      showVoiceNotes();
      return false;
    }

    chunks = [];
    const mimeType = pickMimeType();
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      const finalType = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: finalType });
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      recorder = null;
      resetPill();
      await saveCapturedBlob(blob, durationSec, finalType);
    };

    recorder.start(500);
    startTimerUi();
    toast?.('🎙️ Recording class audio… Tap 🔴 to stop.', 3000);
    return true;
  }

  async function stopRecording() {
    if (isNative && nativeRecording) {
      nativeRecording = false;
      resetPill();
      try {
        const res = await FloatingOverlay.stopVoiceRecord();
        if (res?.base64) {
          const blob = base64ToBlob(res.base64, res.mimeType || 'audio/mp4');
          await saveCapturedBlob(blob, res.durationSec || 1, res.mimeType || 'audio/mp4');
        }
      } catch (err) {
        toast?.(err?.message || 'Could not save recording.', 4000);
      }
      return true;
    }
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return true;
    }
    resetPill();
    return false;
  }

  async function toggleRecording() {
    if (nativeRecording || (recorder && recorder.state !== 'inactive')) {
      return stopRecording();
    }
    return showVoiceNotes();
  }

  async function showVoiceNotes() {
    const body = sheet('🎙️ Voice to Text & Audio');
    const isRec = nativeRecording || Boolean(recorder && recorder.state !== 'inactive');
    const savedLang = localStorage.getItem(LANG_KEY) || '';
    const savedTarget = localStorage.getItem(TARGET_KEY) || 'whiteboard';

    // 1. Voice-to-Text Dictation (Any Language -> Whiteboard or Notepad)
    body.append(el('h2', '🗣️ Speak to Write (Any Language)'));
    const langSel = document.createElement('select');
    langSel.style.cssText = 'width:100%;padding:11px;border:1px solid #b8c9de;border-radius:10px;background:#fff;color:#0f172a;margin:6px 0 10px;font-size:14px;';
    for (const [code, name] of LANGUAGES) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      if (code === savedLang) opt.selected = true;
      langSel.append(opt);
    }
    langSel.onchange = () => localStorage.setItem(LANG_KEY, langSel.value);
    body.append(langSel);

    const targetRow = document.createElement('div');
    targetRow.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;';
    const wbBtn = button('✏️ Write on Whiteboard', () => {
      localStorage.setItem(TARGET_KEY, 'whiteboard');
      wbBtn.className = 'primary';
      npBtn.className = '';
    }, savedTarget === 'whiteboard' ? 'primary' : undefined);
    const npBtn = button('📝 Write in Notepad', () => {
      localStorage.setItem(TARGET_KEY, 'notepad');
      npBtn.className = 'primary';
      wbBtn.className = '';
    }, savedTarget === 'notepad' ? 'primary' : undefined);
    wbBtn.style.flex = '1';
    npBtn.style.flex = '1';
    targetRow.append(wbBtn, npBtn);
    body.append(targetRow);

    const speakBtn = button('🗣️ Tap & Speak Now', async () => {
      await dictateNow();
    }, 'primary');
    speakBtn.style.width = '100%';
    body.append(speakBtn);

    if (lastDictatedText) {
      const previewBox = document.createElement('div');
      previewBox.style.cssText = 'background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:10px;margin:10px 0;';
      const txtArea = document.createElement('textarea');
      txtArea.value = lastDictatedText;
      txtArea.rows = 3;
      txtArea.style.cssText = 'width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:14px;background:#fff;color:#0f172a;box-sizing:border-box;';
      txtArea.oninput = () => { lastDictatedText = txtArea.value; };
      const moveRow = document.createElement('div');
      moveRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
      const sendWb = button('✏️ Place on Whiteboard', () => { writeToWhiteboard(txtArea.value); closeSheet?.(); });
      const moveNp = button('📝 Move to Notepad', () => writeToNotepad(txtArea.value, true));
      sendWb.style.flex = '1';
      moveNp.style.flex = '1';
      moveRow.append(sendWb, moveNp);
      previewBox.append(el('div', 'Last spoken text (edit or move):', 'muted'), txtArea, moveRow);
      body.append(previewBox);
    }

    // 2. Audio Voice Note Recorder
    body.append(el('h2', '🔴 Record Class Audio'));
    body.append(
      button(isRec ? '⏹️ Stop Audio Recording' : '🔴 Record Audio Clip', async () => {
        if (isRec) {
          await stopRecording();
        } else {
          const started = await startRecording();
          if (started) closeSheet?.();
        }
      })
    );

    if (needsMicSettings && isNative) {
      body.append(
        button('⚙️ Open Microphone Settings (Allow Mic)', async () => {
          try { await FloatingOverlay.openAppSettings(); } catch {}
        })
      );
    }

    body.append(el('h2', 'Saved Audio Clips'));
    const notes = await listNotes();
    if (!notes.length) {
      body.append(el('p', 'No audio clips yet.', 'muted'));
      return;
    }

    for (const note of notes) {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;background:#f8fafc;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:700;font-size:14px;color:#0f172a;';
      header.textContent = `${note.title} · ${formatDuration(note.durationSec)}`;
      card.append(header);

      const audio = document.createElement('audio');
      audio.controls = true;
      audio.style.cssText = 'width:100%;height:38px;margin-bottom:8px;';
      const url = URL.createObjectURL(note.blob);
      audio.src = url;
      card.append(audio);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;';
      const ext = note.mimeType?.includes('mp4') ? 'm4a' : note.mimeType?.includes('ogg') ? 'ogg' : 'webm';
      row.append(
        button('Share', async () => {
          const b64 = await blobToBase64(note.blob);
          await shareFile(`${note.title.replace(/[^a-z0-9_-]+/gi, '_')}.${ext}`, b64, note.mimeType || 'audio/mp4', true);
        }),
        button('Delete', async () => {
          URL.revokeObjectURL(url);
          await deleteNote(note.id);
          showVoiceNotes();
        })
      );
      card.append(row);
      body.append(card);
    }
  }

  return { toggleRecording, showVoiceNotes, dictateNow };
}
