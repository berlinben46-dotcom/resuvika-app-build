/**
 * Class Voice Notes recorder & player (IndexedDB-backed for offline reliability).
 */

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

export function createVoiceNotesManager({ sheet, el, button, shareFile, toast }) {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = null;

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

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast?.('Voice recording is not supported on this device.', 3500);
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast?.('Microphone permission is needed to record class voice notes.', 4000);
      return false;
    }

    chunks = [];
    const mimeType = pickMimeType();
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    startedAt = Date.now();

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

      const now = new Date();
      const note = {
        id: `voice-${Date.now()}`,
        title: `Class Voice ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        createdAt: Date.now(),
        durationSec,
        mimeType: finalType,
        blob
      };
      await saveNote(note);
      toast?.(`🎙️ Saved ${note.title} (${formatDuration(durationSec)})! Open Menu → Class Voice Notes to play.`, 4000);
    };

    recorder.start(500);
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

    toast?.('🎙️ Recording class voice note… Keep drawing or taking notes!', 3000);
    return true;
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return true;
    }
    resetPill();
    return false;
  }

  async function toggleRecording() {
    if (recorder && recorder.state !== 'inactive') {
      stopRecording();
      return false;
    }
    return startRecording();
  }

  async function showVoiceNotes() {
    const body = sheet('🎙️ Class Voice Notes');
    const isRec = Boolean(recorder && recorder.state !== 'inactive');

    body.append(
      el('p', 'Record lectures or quick explanations right while drawing on the board. Saved offline on this device.'),
      button(isRec ? '⏹️ Stop Recording Now' : '🎙️ Start Recording Class Voice', async () => {
        await toggleRecording();
        showVoiceNotes();
      }, 'primary')
    );

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
          await shareFile(`${note.title.replace(/[^a-z0-9_-]+/gi, '_')}.${ext}`, b64, note.mimeType || 'audio/webm', true);
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
