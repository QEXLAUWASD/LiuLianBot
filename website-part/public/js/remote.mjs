import { requestJSON } from './api_client.mjs';
import { RdpClient } from './rdp_client.mjs';

const BROWSER_PROFILE_KEY = 'liulianbot.remote-profile.v1';
const refs = Object.fromEntries([
  'sshForm', 'sshHost', 'sshPort', 'sshUsername', 'sshAuthType', 'sshPasswordLabel', 'sshPassword',
  'sshKeyLabel', 'sshKey', 'sshConnect', 'sshDisconnect', 'sshStatus', 'sshTerminal', 'sshInput',
  'sshStorage', 'saveSsh', 'rdpForm', 'rdpHost', 'rdpPort', 'rdpUsername', 'rdpDomain', 'rdpStatus',
  'rdpStorage', 'saveRdp', 'deleteServerProfile',
  'sshPanel', 'rdpPanel', 'rdpConnectPanel', 'rdpPassword', 'rdpDownloadForm', 'rdpDisconnect', 'rdpConnect',
  'rdpCanvas', 'rdpViewport', 'rdpEmptyState', 'rdpLoadingState', 'rdpLoadingText', 'rdpStatusBadge',
  'rdpStatusBadgeText', 'rdpHostLabel', 'rdpFullscreen', 'rdpFit',
].map(id => [id, document.getElementById(id)]));
let socket = null;
let rdpClient = null;
let serverProfile = { ssh: null, rdp: null };
let serverStorageAvailable = false;

function setFeatureVisibility(features) {
  refs.sshPanel.hidden = !features.ssh;
  refs.rdpPanel.hidden = !features.rdp;
  refs.rdpConnectPanel.hidden = !features.rdp;
}

function profileFromFields(type) {
  if (type === 'ssh') {
    return { host: refs.sshHost.value.trim(), port: refs.sshPort.value, username: refs.sshUsername.value.trim(), privateKey: refs.sshKey.value };
  }
  return { host: refs.rdpHost.value.trim(), port: refs.rdpPort.value, username: refs.rdpUsername.value.trim(), domain: refs.rdpDomain.value.trim() };
}

function fillFields(type, profile) {
  if (!profile) return;
  const fields = type === 'ssh'
    ? { host: refs.sshHost, port: refs.sshPort, username: refs.sshUsername, privateKey: refs.sshKey }
    : { host: refs.rdpHost, port: refs.rdpPort, username: refs.rdpUsername, domain: refs.rdpDomain };
  Object.entries(fields).forEach(([key, field]) => { if (profile[key] !== undefined) field.value = profile[key]; });
  if (type === 'ssh' && profile.privateKey) {
    refs.sshAuthType.value = 'key';
    refs.sshAuthType.dispatchEvent(new Event('change'));
  }
}

function browserProfile() {
  try { return JSON.parse(localStorage.getItem(BROWSER_PROFILE_KEY)) || { ssh: null, rdp: null }; } catch (_) { return { ssh: null, rdp: null }; }
}

function saveBrowserProfile(profile) {
  localStorage.setItem(BROWSER_PROFILE_KEY, JSON.stringify(profile));
}

function setServerOptionEnabled(enabled) {
  [refs.sshStorage, refs.rdpStorage].forEach(select => {
    const option = select.querySelector('option[value="server"]');
    option.disabled = !enabled;
    if (!enabled && select.value === 'server') select.value = 'browser';
  });
}

async function loadSavedProfiles() {
  fillFields('ssh', browserProfile().ssh);
  fillFields('rdp', browserProfile().rdp);
  try {
    const data = await requestJSON('/api/remote-profile');
    serverStorageAvailable = Boolean(data.serverStorageAvailable);
    serverProfile = data.profile || serverProfile;
    setFeatureVisibility(data.features || { ssh: true, rdp: true });
    setServerOptionEnabled(serverStorageAvailable);
  } catch (_) {
    setFeatureVisibility({ ssh: false, rdp: false });
    setServerOptionEnabled(false);
  }
}

function setRdpState(state, message) {
  refs.rdpStatusBadge.dataset.state = state;
  refs.rdpStatusBadgeText.textContent = message;
  refs.rdpStatus.textContent = message;
  refs.rdpStatus.className = `status-msg remote-inline-status ${state === 'error' ? 'status-error' : state === 'connected' ? 'status-success' : ''}`;
}

function resizeRdpCanvas() {
  const width = Math.min(4096, Math.max(800, refs.rdpViewport.clientWidth || 1280));
  const height = Math.min(2160, Math.max(480, refs.rdpViewport.clientHeight || 720));
  refs.rdpCanvas.width = Math.floor(width);
  refs.rdpCanvas.height = Math.floor(height);
}

function resetRdpView() {
  refs.rdpCanvas.width = 1280;
  refs.rdpCanvas.height = 720;
  refs.rdpEmptyState.hidden = false;
  refs.rdpLoadingState.hidden = true;
  refs.rdpDisconnect.disabled = true;
  refs.rdpConnect.disabled = false;
}

function updateRdpState({ state, message }) {
  const busy = state === 'connecting' || state === 'connected';
  refs.rdpConnect.disabled = busy;
  refs.rdpDisconnect.disabled = !busy;
  refs.rdpLoadingState.hidden = state !== 'connecting';
  refs.rdpEmptyState.hidden = busy;
  if (!busy) {
    refs.rdpCanvas.getContext('2d').clearRect(0, 0, refs.rdpCanvas.width, refs.rdpCanvas.height);
    refs.rdpPassword.value = '';
  }
  setRdpState(state, message);
}

function disconnectRdp() {
  rdpClient?.disconnect();
}

function fitRdpCanvas() {
  const fit = refs.rdpFit.getAttribute('aria-pressed') === 'true';
  const scale = fit ? Math.min(refs.rdpViewport.clientWidth / refs.rdpCanvas.width,
    refs.rdpViewport.clientHeight / refs.rdpCanvas.height) || 1 : 1;
  refs.rdpCanvas.style.width = Math.floor(refs.rdpCanvas.width * scale) + 'px';
  refs.rdpCanvas.style.height = Math.floor(refs.rdpCanvas.height * scale) + 'px';
}

function connectRdp() {
  if (!globalThis.Module?._malloc || !globalThis.Module?.ccall) {
    updateRdpState({ state: 'error', message: '畫面解碼器尚未就緒，請重新整理頁面。' });
    return;
  }
  rdpClient?.destroy();
  resizeRdpCanvas();
  fitRdpCanvas();
  refs.rdpHostLabel.textContent = refs.rdpHost.value.trim() + ':' + refs.rdpPort.value;
  rdpClient = new RdpClient(refs.rdpCanvas, { onState: updateRdpState });
  rdpClient.connect({
    ...profileFromFields('rdp'),
    password: refs.rdpPassword.value,
  });
  refs.rdpPassword.value = '';
}

async function saveProfile(type) {
  const storage = type === 'ssh' ? refs.sshStorage.value : refs.rdpStorage.value;
  const profile = profileFromFields(type);
  const status = type === 'ssh' ? refs.sshStatus : refs.rdpStatus;
  try {
    if (storage === 'browser') {
      const saved = browserProfile();
      saved[type] = profile;
      saveBrowserProfile(saved);
    } else {
      if (!serverStorageAvailable) throw new Error('伺服器加密儲存尚未設定');
      serverProfile[type] = profile;
      await requestJSON('/api/remote-profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverProfile) });
    }
    status.textContent = '設定已儲存。';
    status.className = 'status-msg status-success';
  } catch (error) {
    status.textContent = error.message || '無法儲存設定。';
    status.className = 'status-msg status-error';
  }
}

function sshUrl() {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/ssh`;
}

function terminalWrite(data) {
  refs.sshTerminal.textContent += data.replace(/\r(?!\n)/g, '');
  refs.sshTerminal.scrollTop = refs.sshTerminal.scrollHeight;
}

function sshState(message, error = false) {
  refs.sshStatus.textContent = message;
  refs.sshStatus.className = `status-msg ${error ? 'status-error' : 'status-success'}`;
}

function setConnected(connected) {
  refs.sshConnect.disabled = connected;
  refs.sshDisconnect.disabled = !connected;
  refs.sshInput.disabled = !connected;
  if (connected) refs.sshInput.focus();
}

function disconnect(message = '已中斷連線。') {
  if (socket) socket.close();
  socket = null;
  setConnected(false);
  sshState(message);
}

refs.sshAuthType.addEventListener('change', () => {
  const key = refs.sshAuthType.value === 'key';
  refs.sshPasswordLabel.hidden = key;
  refs.sshKeyLabel.hidden = !key;
  refs.sshPassword.required = !key;
  refs.sshKey.required = key;
});

refs.sshForm.addEventListener('submit', event => {
  event.preventDefault();
  if (socket) disconnect();
  refs.sshTerminal.textContent = '';
  sshState('正在連線...');
  socket = new WebSocket(sshUrl());
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'connect', host: refs.sshHost.value, port: refs.sshPort.value,
      username: refs.sshUsername.value, password: refs.sshPassword.value, privateKey: refs.sshKey.value }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'data') terminalWrite(message.data);
    if (message.type === 'connected') { setConnected(true); sshState('已連線'); }
    if (message.type === 'error') { sshState(message.message, true); }
    if (message.type === 'closed') disconnect();
  });
  socket.addEventListener('error', () => sshState('無法建立 SSH 連線', true));
  socket.addEventListener('close', () => { if (socket) disconnect(); });
});

refs.sshDisconnect.addEventListener('click', () => {
  socket?.send(JSON.stringify({ type: 'disconnect' }));
  disconnect();
});
refs.saveSsh.addEventListener('click', () => saveProfile('ssh'));
refs.sshInput.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !socket) return;
  socket.send(JSON.stringify({ type: 'input', data: `${refs.sshInput.value}\n` }));
  refs.sshInput.value = '';
});

refs.rdpForm.addEventListener('submit', event => {
  event.preventDefault();
  connectRdp();
});

refs.saveRdp.addEventListener('click', () => saveProfile('rdp'));
refs.rdpDisconnect.addEventListener('click', () => disconnectRdp());
refs.rdpDownloadForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const response = await fetch('/api/rdp/download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: refs.rdpHost.value, port: refs.rdpPort.value, username: refs.rdpUsername.value, domain: refs.rdpDomain.value }),
    });
    if (!response.ok) throw new Error((await response.json()).error || '無法建立 RDP 檔案');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = 'liulianbot-remote.rdp';
    link.click();
    URL.revokeObjectURL(link.href);
    refs.rdpStatus.textContent = 'RDP 檔案已下載。';
  } catch (error) {
    refs.rdpStatus.textContent = error.message || '無法建立 RDP 檔案。';
  }
});
refs.rdpFullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await refs.rdpViewport.requestFullscreen();
  } catch (_) { refs.rdpStatus.textContent = '瀏覽器無法進入全螢幕模式。'; }
});
refs.rdpFit.addEventListener('click', () => {
  const fit = refs.rdpFit.getAttribute('aria-pressed') !== 'true';
  refs.rdpFit.setAttribute('aria-pressed', String(fit));
  refs.rdpFit.textContent = fit ? '原始大小' : '適合畫面';
  fitRdpCanvas();
});
window.addEventListener('resize', fitRdpCanvas);
document.addEventListener('fullscreenchange', fitRdpCanvas);
if (globalThis.ResizeObserver) new ResizeObserver(fitRdpCanvas).observe(refs.rdpViewport);
window.addEventListener('pagehide', () => rdpClient?.disconnect());

refs.deleteServerProfile.addEventListener('click', async () => {
  try {
    await requestJSON('/api/remote-profile', { method: 'DELETE' });
    serverProfile = { ssh: null, rdp: null };
    refs.rdpStatus.textContent = '伺服器儲存資料已刪除。';
    refs.rdpStatus.className = 'status-msg status-success';
  } catch (error) {
    refs.rdpStatus.textContent = error.message || '無法刪除伺服器儲存資料。';
    refs.rdpStatus.className = 'status-msg status-error';
  }
});

loadSavedProfiles();
resetRdpView();
