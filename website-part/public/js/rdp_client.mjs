import { drawBitmap } from './rdp_bitmap.mjs';
import { installInput } from './rdp_input.mjs';

export class RdpClient {
  constructor(canvas, { socketFactory = globalThis.io, onState = () => {},
    render = drawBitmap, timeoutMs = 35000 } = {}) {
    this.canvas = canvas;
    this.socketFactory = socketFactory;
    this.onState = onState;
    this.render = render;
    this.timeoutMs = timeoutMs;
    this.state = 'idle';
    this.socket = null;
    this.generation = 0;
    this.timer = null;
    this.removeInput = null;
  }

  transition(state, message) {
    this.state = state;
    this.onState({ state, message });
  }

  cleanup() {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = null;
    this.removeInput?.();
    this.removeInput = null;
    const socket = this.socket;
    this.socket = null;
    socket?.removeAllListeners();
    socket?.disconnect();
  }

  connect(connection) {
    this.cleanup();
    const generation = this.generation;
    const current = () => generation === this.generation;
    const finish = (state, message) => {
      if (!current()) return;
      this.cleanup();
      this.transition(state, message);
    };
    this.transition('connecting', '正在連線…');
    try {
      if (typeof this.socketFactory !== 'function') throw new Error('Socket.IO 載入失敗，請重新整理頁面。');
      const socket = this.socketFactory({ autoConnect: false, reconnection: false, forceNew: true, timeout: 10000 });
      this.socket = socket;
      // Send credentials once after the transport opens; never replay them on reconnect.
      let credentials = { ...connection, screen: { width: this.canvas.width, height: this.canvas.height }, locale: 'en' };
      socket.once('connect', () => {
        if (!current()) return;
        socket.emit('infos', credentials);
        credentials = null;
      });
      socket.on('rdp-connect', () => {
        if (!current() || this.state !== 'connecting') return;
        clearTimeout(this.timer);
        this.removeInput = installInput(this.canvas, (event, ...args) => {
          if (this.state === 'connected' && socket.connected) socket.emit(event, ...args);
        });
        this.transition('connected', '已連線；點選桌面以操作鍵盤。');
        this.canvas.focus({ preventScroll: true });
      });
      socket.on('rdp-bitmap', bitmap => {
        if (!current() || this.state !== 'connected') return;
        try { this.render(this.canvas, bitmap); }
        catch (_) { finish('error', '遠端畫面解碼失敗，請重新連線。'); }
      });
      socket.on('rdp-error', error => finish('error', error?.message || 'RDP 連線失敗。'));
      socket.on('connect_error', error => finish('error', error?.message || '無法建立連線。'));
      socket.on('rdp-close', () => finish('closed', '遠端工作階段已結束。'));
      socket.on('disconnect', () => finish('closed', '連線已中斷，請重新連線。'));
      this.timer = setTimeout(() => finish('error', '連線逾時，請檢查主機與 RDP 服務。'), this.timeoutMs);
      socket.connect();
    } catch (error) { finish('error', error.message || '無法建立 RDP 客戶端。'); }
  }

  disconnect() {
    this.cleanup();
    this.transition('idle', '已中斷連線。');
  }

  destroy() { this.cleanup(); this.state = 'idle'; }
}
