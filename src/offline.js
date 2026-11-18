'use strict';
/**
 * Resuvika Omniball Mobile - Auto-Pairing 6-Digit Mutual Code Sync (Zero IP Needed!)
 * Connects Phone <-> Laptop <-> Smart TV automatically via 6-digit Mutual Code!
 */
class SatelliteSync {
  constructor() {
    this.remoteStrokes = new Map();
    this.epoch = 0;
    this.socket = null;
    this.peer = null;
    this.peerConns = new Set();
    this.isConnected = false;
    this.clientCount = 1;
    this.yourId = 'mob-' + Math.random().toString(36).slice(2, 7);
    this.strokePoints = [];
    this.shapePreview = null;
    this.outboundFrame = null;
    this.hostInfo = null;
    this.myCode = localStorage.getItem('resuvika_mutual_code') || String(Math.floor(100000 + Math.random() * 900000));
    localStorage.setItem('resuvika_mutual_code', this.myCode);
  }

  changed() {
    window.dispatchEvent(new Event('boardchanged'));
  }

  /**
   * Host a session using this device's 6-digit Mutual Code so TV/Laptop can join!
   */
  hostWithMutualCode() {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') {
        return reject(new Error('PeerJS engine unavailable.'));
      }
      if (this.peer && !this.peer.destroyed && this.peer.id === `resuvika-omniball-${this.myCode}`) {
        return resolve(this.myCode);
      }
      try { this.peer?.destroy(); } catch (_) {}
      const peerId = `resuvika-omniball-${this.myCode}`;
      const peer = new Peer(peerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });
      this.peer = peer;
      peer.on('open', () => resolve(this.myCode));
      peer.on('connection', (conn) => this.setupPeerConn(conn, true));
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          this.myCode = String(Math.floor(100000 + Math.random() * 900000));
          localStorage.setItem('resuvika_mutual_code', this.myCode);
          this.hostWithMutualCode().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Connect to another device (Laptop / Smart TV) using ONLY its 6-digit Mutual Code (Zero IP!)
   */
  connectByMutualCode(code) {
    return new Promise((resolve, reject) => {
      const cleanCode = String(code || '').replace(/[^a-zA-Z0-9]/g, '').trim();
      if (!cleanCode || cleanCode.length < 4) {
        return reject(new Error('Enter the 6-digit Mutual Code shown on the other screen.'));
      }
      if (typeof Peer === 'undefined') {
        return reject(new Error('PeerJS engine unavailable.'));
      }

      this.disconnectSatellite(true);
      const guestId = `resuvika-guest-${Math.random().toString(36).slice(2, 8)}`;
      const peer = new Peer(guestId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });
      this.peer = peer;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Could not find code ' + cleanCode + '. Make sure the other screen is open and showing that code.'));
        }
      }, 9000);

      peer.on('open', () => {
        const targetId = `resuvika-omniball-${cleanCode}`;
        const conn = peer.connect(targetId, { reliable: true });
        this.setupPeerConn(conn, false);
        conn.on('open', () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this.hostInfo = { code: cleanCode };
            resolve({ code: cleanCode });
          }
        });
      });

      peer.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(err.type === 'peer-unavailable' ? `Code ${cleanCode} not found. Check the code on the other device.` : (err.message || 'Connection failed')));
        }
      });
    });
  }

  setupPeerConn(conn, isHost) {
    conn.on('open', () => {
      this.peerConns.add(conn);
      this.isConnected = true;
      this.clientCount = this.peerConns.size + 1;
      this.updateStatus();
      window.showToast?.('🔗 Connected! Anything you draw or write syncs live.');
      if (isHost && window.drawingCanvas) {
        conn.send({
          type: 'init_sync',
          canvas: {
            elements: window.drawingCanvas.elements,
            backgroundMode: window.drawingCanvas.currentBackground,
            epoch: this.epoch
          },
          notepad: window.classNotepad ? {
            tabs: window.classNotepad.tabs,
            activeTabId: window.classNotepad.activeTabId,
            fontSize: window.classNotepad.fontSize
          } : null,
          clientCount: this.clientCount
        });
      }
    });
    conn.on('data', (data) => {
      if (data && typeof data === 'object') this.receive(data);
    });
    conn.on('close', () => {
      this.peerConns.delete(conn);
      this.isConnected = this.peerConns.size > 0 || (this.socket?.readyState === WebSocket.OPEN);
      this.clientCount = this.peerConns.size + 1;
      this.updateStatus();
    });
  }

  disconnectSatellite(silent = false) {
    if (this.socket) {
      try { this.socket.close(); } catch (_) {}
      this.socket = null;
    }
    for (const c of this.peerConns) {
      try { c.close(); } catch (_) {}
    }
    this.peerConns.clear();
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
    }
    this.isConnected = false;
    this.clientCount = 1;
    this.remoteStrokes.clear();
    this.updateStatus();
    if (!silent) window.showToast?.('Disconnected (Offline mode)');
  }

  receive(msg) {
    const board = window.drawingCanvas;
    if (!board) return;
    switch (msg.type) {
      case 'init_sync':
        this.isConnected = true;
        this.clientCount = msg.clientCount || 2;
        this.epoch = msg.canvas?.epoch || 0;
        this.remoteStrokes.clear();
        if (msg.canvas) {
          board.elements = msg.canvas.elements || [];
          board.redrawAllElements();
        }
        if (msg.notepad && window.classNotepad) {
          window.classNotepad.syncFromRemote(msg.notepad);
        }
        this.updateStatus();
        break;
      case 'draw_stroke_start':
        if (msg.stroke) {
          this.remoteStrokes.set(msg.sourceId || 'peer', msg.stroke);
          board.scheduleLivePreview?.();
        }
        break;
      case 'draw_stroke_point': {
        const stroke = this.remoteStrokes.get(msg.sourceId || 'peer');
        if (stroke && msg.point) {
          stroke.points.push(msg.point);
          board.drawLiveStrokeSegment?.(board.liveCtx, stroke);
        }
        break;
      }
      case 'draw_stroke_points': {
        const stroke = this.remoteStrokes.get(msg.sourceId || 'peer');
        if (stroke && Array.isArray(msg.points)) {
          for (const point of msg.points) {
            stroke.points.push(point);
            board.drawLiveStrokeSegment?.(board.liveCtx, stroke);
          }
        }
        break;
      }
      case 'shape_preview':
        if (msg.element) {
          this.remoteStrokes.set(msg.sourceId || 'peer', msg.element);
          board.scheduleLivePreview?.();
        }
        break;
      case 'draw_stroke_end':
        this.remoteStrokes.delete(msg.sourceId || 'peer');
        board.renderLivePreviews?.();
        break;
      case 'add_element':
        this.remoteStrokes.delete(msg.sourceId || 'peer');
        if (msg.element) board.addElement(msg.element, true);
        board.renderLivePreviews?.();
        break;
      case 'update_elements':
        board.elements = msg.elements || [];
        board.redrawAllElements();
        break;
      case 'clear_canvas':
        this.epoch = msg.epoch ?? this.epoch;
        if (msg.sourceId !== this.yourId) board.clear(true);
        break;
      case 'set_background':
        board.setBackground(msg.mode, true);
        break;
      case 'laser_pointer':
        board.addLaserPoint?.(msg.x, msg.y);
        break;
      case 'notepad_update':
        window.classNotepad?.syncFromRemote(msg.notepad);
        break;
    }
  }

  send(msg) {
    if (msg.type === 'clear_canvas') this.epoch++;
    const payload = { ...msg, sourceId: this.yourId, epoch: this.epoch };
    if (this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify(payload)); } catch (_) {}
    }
    for (const conn of this.peerConns) {
      if (conn.open) {
        try { conn.send(payload); } catch (_) {}
      }
    }
  }

  scheduleOutbound() {
    if (this.outboundFrame) return;
    this.outboundFrame = requestAnimationFrame(() => {
      this.outboundFrame = null;
      this.flushLive();
    });
  }

  flushLive() {
    if (this.outboundFrame) {
      cancelAnimationFrame(this.outboundFrame);
      this.outboundFrame = null;
    }
    if (this.strokePoints.length) this.send({ type: 'draw_stroke_points', points: this.strokePoints.splice(0) });
    if (this.shapePreview) {
      this.send({ type: 'shape_preview', element: this.shapePreview });
      this.shapePreview = null;
    }
  }

  updateStatus() {
    const btn = document.getElementById('mob-btn-connect');
    if (btn) btn.textContent = this.isConnected ? '🟢 Live Sync' : '📺 TV / PC';
  }

  clearTransient() {
    this.remoteStrokes.clear();
  }

  broadcastStrokeStart(stroke) { this.send({ type: 'draw_stroke_start', stroke }); }
  broadcastStrokePoint(point) {
    this.strokePoints.push(point);
    if (this.strokePoints.length >= 32) this.flushLive();
    else this.scheduleOutbound();
  }
  broadcastShapePreview(element) { this.shapePreview = { ...element }; this.scheduleOutbound(); }
  broadcastStrokeEnd() { this.flushLive(); this.send({ type: 'draw_stroke_end' }); }
  broadcastAddElement(element) { this.flushLive(); this.send({ type: 'add_element', element }); this.changed(); }
  broadcastUpdateElements(elements) { this.send({ type: 'update_elements', elements }); this.changed(); }
  broadcastClear() { this.epoch++; this.send({ type: 'clear_canvas' }); this.changed(); }
  broadcastSetBackground(mode) { this.send({ type: 'set_background', mode }); this.changed(); }
  broadcastLaser(x, y) { this.send({ type: 'laser_pointer', x, y }); }
  broadcastNotepad(notepad) { this.send({ type: 'notepad_update', notepad }); this.changed(); }
}

window.SyncManager = SatelliteSync;
