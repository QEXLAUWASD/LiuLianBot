function setStatus(statusElement, message, type = '') {
  statusElement.textContent = message;
  statusElement.className = `status-msg${type ? ` status-${type}` : ''}`;
}

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

function websocketUrl(locationRef) {
  const protocol = locationRef.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${locationRef.host}/api/chromium/ws`;
}

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, (event.clientX - rect.left) * canvas.width / rect.width),
    y: Math.max(0, (event.clientY - rect.top) * canvas.height / rect.height),
  };
}

export function initializeChromiumPage({
  WebSocketImpl = globalThis.WebSocket,
  ImageImpl = globalThis.Image,
  documentRef = document,
  locationRef = globalThis.location,
} = {}) {
  const form = documentRef.getElementById('chromiumAddressForm');
  const address = documentRef.getElementById('chromiumAddress');
  const status = documentRef.getElementById('chromiumStatus');
  const home = documentRef.getElementById('chromiumHome');
  const homeButton = documentRef.getElementById('chromiumHomeButton');
  const framePanel = documentRef.getElementById('chromiumFramePanel');
  const canvas = documentRef.getElementById('chromiumFrame');
  if (!form || !address || !status || !home || !homeButton || !framePanel || !canvas) return null;

  let socket = null;
  let opening = 0;
  let readyPromise = null;
  const context = canvas.getContext?.('2d');
  setStatus(status, 'Chromium 已就緒。');

  const send = message => {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message));
  };

  const destroySession = () => {
    opening += 1;
    readyPromise = null;
    if (socket) {
      socket.close();
      socket = null;
    }
    context?.clearRect(0, 0, canvas.width, canvas.height);
    framePanel.hidden = true;
    home.hidden = false;
    homeButton.hidden = true;
  };

  const drawFrame = frame => {
    if (!context || !ImageImpl) return;
    const image = new ImageImpl();
    image.onload = () => {
      const width = Number(frame.metadata?.deviceWidth) || image.width;
      const height = Number(frame.metadata?.deviceHeight) || image.height;
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
    };
    image.src = `data:image/jpeg;base64,${frame.data}`;
  };

  const openUrl = value => {
    const url = normalizeUrl(value);
    address.value = url;
    destroySession();
    const requestId = ++opening;
    home.hidden = true;
    homeButton.hidden = false;
    framePanel.hidden = false;
    setStatus(status, '正在啟動伺服器 Chromium...');
    if (typeof WebSocketImpl !== 'function') {
      setStatus(status, '瀏覽器不支援 WebSocket。', 'error');
      return Promise.reject(new Error('WebSocket is unavailable'));
    }

    readyPromise = new Promise((resolve, reject) => {
      const current = new WebSocketImpl(websocketUrl(locationRef));
      socket = current;
      current.onopen = () => current.send(JSON.stringify({
        type: 'open',
        url,
        size: { width: Math.min(1280, Math.max(640, framePanel.clientWidth || 1280)), height: 720 },
      }));
      current.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        if (requestId !== opening) return;
        if (message.type === 'status' && message.status === 'opening') return;
        if (message.type === 'frame') {
          drawFrame(message);
        } else if (message.type === 'ready') {
          setStatus(status, 'Chromium 已連線。', 'success');
          resolve(url);
        } else if (message.type === 'error') {
          setStatus(status, message.message || 'Chromium 工作階段失敗。', 'error');
          reject(new Error(message.message || 'Chromium session failed'));
        }
      };
      current.onerror = () => {
        const error = new Error('無法連線到伺服器 Chromium。');
        setStatus(status, error.message, 'error');
        reject(error);
      };
      current.onclose = () => {
        if (requestId === opening && socket === current) {
          socket = null;
          setStatus(status, 'Chromium 工作階段已結束。', 'error');
        }
      };
    });
    return readyPromise;
  };

  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('mousedown', event => {
    event.preventDefault();
    canvas.focus();
    const point = canvasPoint(canvas, event);
    send({ type: 'input', input: {
      type: 'mouse', eventType: 'mousePressed', ...point,
      button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left',
      clickCount: event.detail || 1,
    } });
  });
  canvas.addEventListener('mouseup', event => {
    event.preventDefault();
    const point = canvasPoint(canvas, event);
    send({ type: 'input', input: {
      type: 'mouse', eventType: 'mouseReleased', ...point,
      button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left',
    } });
  });
  canvas.addEventListener('mousemove', event => {
    if (event.buttons === 0) return;
    const point = canvasPoint(canvas, event);
    send({ type: 'input', input: { type: 'mouse', eventType: 'mouseMoved', ...point, button: 'none' } });
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const point = canvasPoint(canvas, event);
    send({ type: 'input', input: { type: 'wheel', ...point, deltaX: event.deltaX, deltaY: event.deltaY } });
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    event.preventDefault();
    send({ type: 'input', input: {
      type: 'key', eventType: 'keyDown', key: event.key, code: event.code,
      text: event.key.length === 1 ? event.key : undefined,
      windowsVirtualKeyCode: event.keyCode,
    } });
  });
  canvas.addEventListener('keyup', event => {
    event.preventDefault();
    send({ type: 'input', input: {
      type: 'key', eventType: 'keyUp', key: event.key, code: event.code,
      windowsVirtualKeyCode: event.keyCode,
    } });
  });
  canvas.tabIndex = 0;

  form.addEventListener('submit', event => {
    event.preventDefault();
    openUrl(address.value).catch(() => {});
  });
  homeButton.addEventListener('click', () => {
    destroySession();
    setStatus(status, 'Chromium 已就緒。');
  });
  documentRef.querySelectorAll('[data-chromium-url], .chromium-quick-links a').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      openUrl(link.dataset.chromiumUrl || link.href).catch(() => {});
    });
  });

  return { openUrl, destroySession };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initializeChromiumPage());
}
