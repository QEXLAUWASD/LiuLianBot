const { RemoteInputError, normalizeHost, normalizePort, normalizeRdpInput } = require('./remote_validation');

function sshProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RemoteInputError('Invalid SSH profile');
  const username = typeof value.username === 'string' ? value.username.trim() : '';
  if (!username || username.length > 256 || /[\r\n\0]/.test(username)) throw new RemoteInputError('Username is invalid');
  const privateKey = value.privateKey === undefined ? '' : value.privateKey;
  if (typeof privateKey !== 'string' || privateKey.length > 16384) throw new RemoteInputError('Private key is invalid');
  return { host: normalizeHost(value.host), port: normalizePort(value.port, 22), username, privateKey };
}

function normalizeRemoteProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RemoteInputError('Invalid remote profile');
  return {
    ssh: value.ssh === null || value.ssh === undefined ? null : sshProfile(value.ssh),
    rdp: value.rdp === null || value.rdp === undefined ? null : normalizeRdpInput(value.rdp),
  };
}

module.exports = { normalizeRemoteProfile };
