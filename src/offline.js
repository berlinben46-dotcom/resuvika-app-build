'use strict';
// Deliberately no networking: the app owns its offline whiteboard. Laptop pairing opens
// the existing token-protected companion in the system browser, outside the native bridge.
class OfflineSync {
  constructor() { this.remoteStrokes = new Map(); this.epoch = 0; }
  changed() { window.dispatchEvent(new Event('boardchanged')); }
  broadcastAddElement() { this.changed(); }
  broadcastUpdateElements() { this.changed(); }
  broadcastClear() { this.epoch++; this.changed(); }
  broadcastSetBackground() { this.changed(); }
  broadcastNotepad() { this.changed(); }
  clearTransient() { this.remoteStrokes.clear(); }
  broadcastStrokeStart() {}
  broadcastStrokePoint() {}
  broadcastStrokeEnd() {}
  broadcastShapePreview() {}
  broadcastLaser() {}
}
window.SyncManager = OfflineSync;
