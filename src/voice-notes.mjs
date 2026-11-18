/**
 * Class Voice Notes recorder & player (Native Android MediaRecorder + IndexedDB offline storage).
 */
import { Capacitor } from '@capacitor/core';
import { FloatingOverlay } from './shell.mjs';

const DB_NAME = 'resuvika_voice_notes_db';
const STORE_NAME = 'notes';

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

export function createVoiceNotesManager({ sheet, el, button, shareFile, toast }) {
  const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  let nativeRecording = false;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = null;
  let needsMicSettings = false;

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
          toast?.('🎙️ Recording class voice note… Keep drawing or taking notes!', 3000);
          return true;
        }
      } catch (err) {
        toast?.(err?.message || 'Could not start microphone.', 4000);
        showVoiceNotes();
        return false;
      }
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast?.('Voice recording is not supported on this device.', 3500);
      showVoiceNotes();
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      needsMicSettings = true;
      toast?.('Microphone permission is needed to record class voice notes.', 4000);
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
    toast?.('🎙️ Recording class voice note… Keep drawing or taking notes!', 3000);
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
    return startRecording();
  }

  async function showVoiceNotes() {
    const body = sheet('🎙️ Class Voice Notes');
    const isRec = nativeRecording || Boolean(recorder && recorder.state !== 'inactive');

    body.append(
      el('p', 'Record lectures or quick explanations right while drawing on the board. Saved offline on this device.'),
      button(isRec ? '⏹️ Stop Recording Now' : '🎙️ Start Recording Class Voice', async () => {
        await toggleRecording();
        if (!isRec) showVoiceNotes();
      }, 'primary')
    );

    if (needsMicSettings && isNative) {
      body.append(
        button('⚙️ Open Microphone Settings (Allow Mic)', async () => {
          try { await FloatingOverlay.openAppSettings(); } catch {}
        })
      );
    }

    body.append(el('h2', 'Saved Recordings'));
    const notes = await listNotes();
    if (!notes.length) {
      body.append(el('p', 'No voice notes yet. Tap 🎙️ Voice at the top right anytime during class!', 'muted'));
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

  return { toggleRecording, showVoiceNotes };
}
