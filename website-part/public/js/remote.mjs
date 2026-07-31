const refs = Object.fromEntries([
  'sshForm', 'sshHost', 'sshPort', 'sshUsername', 'sshAuthType', 'sshPasswordLabel', 'sshPassword',
  'sshKeyLabel', 'sshKey', 'sshConnect', 'sshDisconnect', 'sshStatus', 'sshTerminal', 'sshInput',
  'rdpForm', 'rdpHost', 'rdpPort', 'rdpUsername', 'rdpDomain', 'rdpStatus',
].map(id => [id, document.getElementById(id)]));
let socket = null;

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
refs.sshInput.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !socket) return;
  socket.send(JSON.stringify({ type: 'input', data: `${refs.sshInput.value}\n` }));
  refs.sshInput.value = '';
});

refs.rdpForm.addEventListener('submit', async event => {
  event.preventDefault();
  refs.rdpStatus.textContent = '';
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
    refs.rdpStatus.className = 'status-msg status-success';
  } catch (error) {
    refs.rdpStatus.textContent = error.message;
    refs.rdpStatus.className = 'status-msg status-error';
  }
});
