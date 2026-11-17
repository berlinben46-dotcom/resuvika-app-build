'use strict';
/**
 * Resuvika Omniball Mobile - Offline Board + Wi-Fi Satellite Remote Sync
 * Connects directly inside the mobile app to the laptop via IP + 6-Digit Code over local Wi-Fi!
 */
class SatelliteSync {
  constructor() {
    this.remoteStrokes = new Map();
    this.epoch = 0;
    this.socket = null;
    this.isConnected = false;
    this.clientCount = 1;
    this.yourId = null;
    this.strokePoints = [];
    this.shapePreview = null;
    this.outboundFrame = null;
    this.hostInfo = null;
  }

  changed() {
    window.dispatchEvent(new Event('boardchanged'));
  }

  connectSatellite({ ip, port = '8080', pin }) {
    return new Promise((resolve, reject) => {
      const cleanIp = String(ip || '').trim();
      const cleanPort = String(port || '8080').trim();
      const cleanPin = String(pin || '').trim();
      if (!cleanIp || !cleanPin) {
        return reject(new Error('Enter both Laptop Wi-Fi IP and the 6-digit code.'));
      }

      this.disconnectSatellite(true);
      const wsUrl = `ws://${cleanIp}:${cleanPort}/ws?pin=${encodeURIComponent(cleanPin)}`;
      let settled = false;

      try {
        const ws = new WebSocket(wsUrl);
        this.socket = ws;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { ws.close(); } catch (_) {}
            reject(new Error('Connection timed out. Ensure both devices are on the same Wi-Fi and firewall allows port ' + cleanPort));
          }
        }, 6000);

        ws.onopen = () => {
          this.hostInfo = { ip: cleanIp, port: cleanPort, pin: cleanPin };
          localStorage.setItem('resuvika_satellite_last', JSON.stringify({ ip: cleanIp, port: cleanPort }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (!settled && msg.type === 'init_sync') {
              settled = true;
              clearTimeout(timer);
              this.isConnected = true;
              this.updateStatus();
              resolve(msg);
            }
            this.receive(msg);
          } catch (_) {}
        };

        ws.onclose = () => {
          const wasConnected = this.isConnected;
          this.isConnected = false;
          this.clientCount = 1;
          this.remoteStrokes.clear();
          this.updateStatus();
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error('Invalid 6-digit code or laptop server not reachable.'));
          } else if (wasConnected) {
            window.showToast?.('Satellite disconnected from laptop.');
          }
        };

        ws.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error('Could not reach laptop on ' + cleanIp + ':' + cleanPort));
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnectSatellite(silent = false) {
    if (this.socket) {
      try { this.socket.close(); } catch (_) {}
      this.socket = null;
    }
    this.isConnected = false;
    this.clientCount = 1;
    this.remoteStrokes.clear();
    this.updateStatus();
    if (!silent) window.showToast?.('Satellite Remote disconnected (Offline mode)');
  }

  receive(msg) {
    const board = window.drawingCanvas;
    if (!board) return;
    switch (msg.type) {
      case 'init_sync':
        this.isConnected = true;
        this.clientCount = msg.clientCount || 2;
        this.yourId = msg.yourId;
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
      case 'peer_joined':
      case 'peer_left':
        this.clientCount = msg.clientCount || 1;
        this.remoteStrokes.delete(msg.sourceId);
        board.renderLivePreviews?.();
        this.updateStatus();
        break;
      case 'draw_stroke_start':
        if (msg.stroke) {
          this.remoteStrokes.set(msg.sourceId, msg.stroke);
          board.scheduleLivePreview?.();
        }
        break;
      case 'draw_stroke_point': {
        const stroke = this.remoteStrokes.get(msg.sourceId);
        if (stroke && msg.point) {
          stroke.points.push(msg.point);
          board.drawLiveStrokeSegment?.(board.liveCtx, stroke);
        }
        break;
      }
      case 'draw_stroke_points': {
        const stroke = this.remoteStrokes.get(msg.sourceId);
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
          this.remoteStrokes.set(msg.sourceId, msg.element);
          board.scheduleLivePreview?.();
        }
        break;
      case 'draw_stroke_end':
        this.remoteStrokes.delete(msg.sourceId);
        board.renderLivePreviews?.();
        break;
      case 'add_element':
        this.remoteStrokes.delete(msg.sourceId);
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
    if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (msg.type === 'clear_canvas') this.epoch++;
    if (['draw_stroke_start', 'draw_stroke_point', 'draw_stroke_points', 'draw_stroke_end', 'shape_preview', 'add_element', 'update_elements'].includes(msg.type)) {
      msg = { ...msg, epoch: this.epoch };
    }
    try {
      this.socket.send(JSON.stringify(msg));
    } catch (_) {}
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
    const dot = document.getElementById('ipad-status-dot');
    const txt = document.getElementById('ipad-status-text');
    const room = document.getElementById('ipad-room-display');
    if (dot) dot.classList.toggle('disconnected', !this.isConnected);
    if (txt) txt.textContent = this.isConnected ? '🛰️ Satellite Live' : 'Offline Board';
    if (room) room.textContent = this.isConnected ? `${this.hostInfo?.ip}` : 'Local';
  }

  clearTransient() {
    this.remoteStrokes.clear();
  }

  broadcastStrokeStart(stroke) { this.send({ type: 'draw_stroke_start', stroke }); }
  broadcastStrokePoint(point) {
    this.strokePoints.push(point);
    if (this.strokePoints.length >= 64) this.flushLive();
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
