import { requestJSON } from './api_client.mjs';

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

async function loadHyperbeam() {
  const module = await import('/vendor/hyperbeam/index.js');
  return module.default;
}

export function initializeChromiumPage({
  request = requestJSON,
  HyperbeamClient = null,
  documentRef = document,
} = {}) {
  const form = documentRef.getElementById('chromiumAddressForm');
  const address = documentRef.getElementById('chromiumAddress');
  const status = documentRef.getElementById('chromiumStatus');
  const home = documentRef.getElementById('chromiumHome');
  const homeButton = documentRef.getElementById('chromiumHomeButton');
  const framePanel = documentRef.getElementById('chromiumFramePanel');
  const frame = documentRef.getElementById('chromiumFrame');
  if (!form || !address || !status || !home || !homeButton || !framePanel || !frame) return null;

  let hyperbeam = null;
  let opening = 0;
  setStatus(status, 'Chromium 已就緒。');

  const destroySession = () => {
    opening += 1;
    if (hyperbeam) hyperbeam.destroy();
    hyperbeam = null;
    frame.replaceChildren();
    framePanel.hidden = true;
    home.hidden = false;
    homeButton.hidden = true;
  };

  const openUrl = async value => {
    const url = normalizeUrl(value);
    const requestId = ++opening;
    address.value = url;
    home.hidden = true;
    homeButton.hidden = false;
    framePanel.hidden = false;
    setStatus(status, '正在建立 Hyperbeam 工作階段...');

    if (hyperbeam) hyperbeam.destroy();
    hyperbeam = null;
    frame.replaceChildren();

    try {
      const data = await request('/api/chromium/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_url: url }),
      });
      if (requestId !== opening) return url;
      const clientFactory = HyperbeamClient || await loadHyperbeam();
      hyperbeam = await clientFactory(frame, data.embedUrl, {
        adminToken: data.adminToken || undefined,
        timeout: 10000,
        onDisconnect: () => setStatus(status, 'Hyperbeam 工作階段已中斷。', 'error'),
      });
      setStatus(status, 'Hyperbeam 已連線。', 'success');
      return url;
    } catch (error) {
      if (requestId !== opening) return url;
      framePanel.hidden = true;
      home.hidden = false;
      homeButton.hidden = true;
      setStatus(status, error?.message || '無法建立 Hyperbeam 工作階段。', 'error');
      return null;
    }
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    openUrl(address.value).catch(error => setStatus(status, error.message, 'error'));
  });
  homeButton.addEventListener('click', () => {
    destroySession();
    setStatus(status, 'Chromium 已就緒。');
  });
  documentRef.querySelectorAll('[data-chromium-url], .chromium-quick-links a').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      openUrl(link.dataset.chromiumUrl || link.href).catch(error => setStatus(status, error.message, 'error'));
    });
  });

  return { openUrl, destroySession };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initializeChromiumPage());
}
