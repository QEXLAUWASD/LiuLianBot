export function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('請輸入網址。');
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw new Error('網址格式不正確，請使用 http:// 或 https://。');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('只支援 http:// 或 https:// 網址。');
  }
  return url.toString();
}

export function websocketUrl(locationRef = globalThis.location) {
  const protocol = locationRef.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${locationRef.host}/api/chromium/ws`;
}

export function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, (event.clientX - rect.left) * canvas.width / rect.width),
    y: Math.max(0, (event.clientY - rect.top) * canvas.height / rect.height),
  };
}

// Owns the server side Chromium screencast socket. The React page only renders
// the address bar, the canvas and the input handlers.
export class ChromiumSession {
  constructor(canvas, {
    WebSocketImpl = globalThis.WebSocket,
    ImageImpl = globalThis.Image,
    locationRef = globalThis.location,
    onState = () => {},
  } = {}) {
    this.canvas = canvas;
    this.WebSocketImpl = WebSocketImpl;
    this.ImageImpl = ImageImpl;
    this.locationRef = locationRef;
    this.onState = onState;
    this.socket = null;
    this.opening = 0;
  }

  send(message) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  drawFrame(frame) {
    const ctx = this.canvas?.getContext?.('2d');
    if (!ctx || !this.ImageImpl) return;
    const image = new this.ImageImpl();
    image.onload = () => {
      const width = Number(frame.metadata?.deviceWidth) || image.width;
      const height = Number(frame.metadata?.deviceHeight) || image.height;
      this.canvas.width = width;
      this.canvas.height = height;
      ctx.drawImage(image, 0, 0, width, height);
    };
    image.src = `data:image/jpeg;base64,${frame.data}`;
  }

  destroy() {
    this.opening += 1;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    const ctx = this.canvas?.getContext?.('2d');
    ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  open(value, { size } = {}) {
    const url = normalizeUrl(value);
    this.destroy();
    const requestId = ++this.opening;

    if (typeof this.WebSocketImpl !== 'function') {
      const error = new Error('WebSocket is unavailable');
      this.onState({ state: 'error', message: '瀏覽器不支援 WebSocket。' });
      return Promise.reject(error);
    }

    this.onState({ state: 'opening', message: '正在啟動伺服器 Chromium...' });
    return new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(websocketUrl(this.locationRef));
      this.socket = socket;
      socket.onopen = () => socket.send(JSON.stringify({
        type: 'open',
        url,
        size: size || { width: this.canvas?.width || 1280, height: this.canvas?.height || 720 },
      }));
      socket.onmessage = event => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (_) {
          return;
        }
        if (requestId !== this.opening) return;
        if (message.type === 'status' && message.status === 'opening') return;
        if (message.type === 'frame') {
          this.drawFrame(message);
        } else if (message.type === 'ready') {
          this.onState({ state: 'ready', message: 'Chromium 已連線。' });
          resolve(url);
        } else if (message.type === 'error') {
          const error = new Error(message.message || 'Chromium session failed');
          this.onState({ state: 'error', message: error.message });
          reject(error);
        }
      };
      socket.onerror = () => {
        const error = new Error('無法連線到伺服器 Chromium。');
        this.onState({ state: 'error', message: error.message });
        reject(error);
      };
      socket.onclose = () => {
        if (requestId === this.opening && this.socket === socket) {
          this.socket = null;
          this.onState({ state: 'closed', message: 'Chromium 工作階段已結束。' });
        }
      };
    });
  }
}
