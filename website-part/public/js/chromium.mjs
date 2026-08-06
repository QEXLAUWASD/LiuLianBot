import { requestJSON } from './api_client.mjs';

function setStatus(statusElement, message, type = '') {
  statusElement.textContent = message;
  statusElement.className = `status-msg${type ? ` status-${type}` : ''}`;
}

export async function initializeChromiumPage({ request = requestJSON, documentRef = document } = {}) {
  const status = documentRef.getElementById('chromiumStatus');
  const framePanel = documentRef.getElementById('chromiumFramePanel');
  const setup = documentRef.getElementById('chromiumSetup');
  const frame = documentRef.getElementById('chromiumFrame');
  const openLink = documentRef.getElementById('chromiumOpenLink');
  const connectionName = documentRef.getElementById('chromiumConnectionName');
  if (!status || !framePanel || !setup || !frame || !openLink || !connectionName) return null;

  try {
    const data = await request('/api/connections');
    const connection = (data?.connections || []).find(item => item.slug?.toLowerCase() === 'chromium');
    if (!connection) {
      setStatus(status, 'Chromium 尚未設定。');
      setup.hidden = false;
      return null;
    }

    const proxyUrl = `/connect/${encodeURIComponent(connection.slug)}/`;
    frame.src = proxyUrl;
    openLink.href = proxyUrl;
    openLink.hidden = false;
    connectionName.textContent = connection.description || connection.name;
    framePanel.hidden = false;
    setStatus(status, 'Chromium 已連線。', 'success');
    return connection;
  } catch (error) {
    setStatus(status, error?.message || '無法載入 Chromium 連線。', 'error');
    return null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initializeChromiumPage());
}
