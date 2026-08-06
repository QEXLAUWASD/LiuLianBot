function setStatus(statusElement, message, type = '') {
  statusElement.textContent = message;
  statusElement.className = `status-msg${type ? ` status-${type}` : ''}`;
}

function normalizeUrl(value) {
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

export function initializeChromiumPage({ documentRef = document } = {}) {
  const form = documentRef.getElementById('chromiumAddressForm');
  const address = documentRef.getElementById('chromiumAddress');
  const status = documentRef.getElementById('chromiumStatus');
  const home = documentRef.getElementById('chromiumHome');
  const homeButton = documentRef.getElementById('chromiumHomeButton');
  const framePanel = documentRef.getElementById('chromiumFramePanel');
  const frame = documentRef.getElementById('chromiumFrame');
  const openLink = documentRef.getElementById('chromiumOpenLink');
  if (!form || !address || !status || !home || !homeButton || !framePanel || !frame || !openLink) return null;

  setStatus(status, 'Chromium 已就緒。');

  const showHome = () => {
    frame.removeAttribute('src');
    framePanel.hidden = true;
    home.hidden = false;
    homeButton.hidden = true;
    openLink.hidden = true;
    setStatus(status, 'Chromium 已就緒。');
  };

  const openUrl = value => {
    const url = normalizeUrl(value);
    address.value = url;
    home.hidden = true;
    homeButton.hidden = false;
    openLink.href = url;
    openLink.hidden = false;
    const pageOrigin = documentRef.defaultView?.location?.origin || '';
    if (new URL(url).origin === pageOrigin) {
      frame.src = url;
      framePanel.hidden = false;
      setStatus(status, '已在內建工作區開啟網站。', 'success');
    } else {
      frame.removeAttribute('src');
      framePanel.hidden = true;
      setStatus(status, '外部網站不允許內嵌，請按「新分頁開啟」。', 'success');
    }
    return url;
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      openUrl(address.value);
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  });
  homeButton.addEventListener('click', showHome);
  documentRef.querySelectorAll('[data-chromium-url], .chromium-quick-links a').forEach(link => {
    link.addEventListener('click', event => {
      if (link.dataset.chromiumUrl) {
        event.preventDefault();
        try {
          openUrl(link.dataset.chromiumUrl);
        } catch (error) {
          setStatus(status, error.message, 'error');
        }
      }
    });
  });

  return { openUrl, showHome };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initializeChromiumPage());
}
