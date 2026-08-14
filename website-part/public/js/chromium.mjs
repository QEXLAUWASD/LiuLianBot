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

function commandFor(url) {
  return `npm run chromium -- '${url.replaceAll("'", '%27')}'`;
}

export function initializeChromiumPage({ documentRef = document, navigatorRef = globalThis.navigator } = {}) {
  const form = documentRef.getElementById('chromiumAddressForm');
  const address = documentRef.getElementById('chromiumAddress');
  const status = documentRef.getElementById('chromiumStatus');
  const home = documentRef.getElementById('chromiumHome');
  const homeButton = documentRef.getElementById('chromiumHomeButton');
  const copyCommand = documentRef.getElementById('chromiumCopyCommand');
  const launchCommand = documentRef.getElementById('chromiumLaunchCommand');
  if (!form || !address || !status || !home || !homeButton || !copyCommand || !launchCommand) return null;

  setStatus(status, 'WebView 已就緒。');

  const showHome = () => {
    address.value = '';
    launchCommand.textContent = commandFor('https://www.google.com/');
    homeButton.hidden = true;
    setStatus(status, 'WebView 已就緒。');
  };

  const prepareUrl = value => {
    const url = normalizeUrl(value);
    address.value = url;
    launchCommand.textContent = commandFor(url);
    homeButton.hidden = false;
    setStatus(status, '網址已驗證，請執行啟動指令。', 'success');
    return url;
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      prepareUrl(address.value);
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  });

  homeButton.addEventListener('click', showHome);
  copyCommand.addEventListener('click', async () => {
    try {
      await navigatorRef.clipboard.writeText(launchCommand.textContent);
      setStatus(status, '啟動指令已複製。', 'success');
    } catch (_) {
      setStatus(status, '無法自動複製，請選取啟動指令。', 'error');
    }
  });

  documentRef.querySelectorAll('[data-chromium-url]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      try {
        prepareUrl(link.dataset.chromiumUrl || link.href);
      } catch (error) {
        setStatus(status, error.message, 'error');
      }
    });
  });

  return { prepareUrl, showHome };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initializeChromiumPage());
}
