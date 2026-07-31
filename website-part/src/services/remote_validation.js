class RemoteInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RemoteInputError';
    this.statusCode = 400;
  }
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string') throw new RemoteInputError(`${label} must be a string`);
  const result = value.trim();
  if (!result) throw new RemoteInputError(`${label} is required`);
  if (result.length > maxLength) throw new RemoteInputError(`${label} is too long`);
  if (/[\r\n\0]/.test(result)) throw new RemoteInputError(`${label} contains invalid characters`);
  return result;
}

function normalizeHost(value) {
  const host = requiredText(value, 'Host', 253);
  if (!/^[A-Za-z0-9][A-Za-z0-9.:-]*$/.test(host)) {
    throw new RemoteInputError('Host contains invalid characters');
  }
  return host;
}

function normalizePort(value, defaultPort) {
  const port = value === undefined || value === '' ? defaultPort : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RemoteInputError('Port must be between 1 and 65535');
  }
  return port;
}

function normalizeRdpInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RemoteInputError('Invalid RDP connection data');
  }
  return {
    host: normalizeHost(input.host),
    port: normalizePort(input.port, 3389),
    username: requiredText(input.username, 'Username', 256),
    domain: input.domain === undefined || input.domain === ''
      ? ''
      : requiredText(input.domain, 'Domain', 256),
  };
}

function allowedSshHosts(value = process.env.SSH_ALLOWED_HOSTS) {
  return new Set(String(value || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
}

function ipv4Number(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some(part => part > 255)) return null;
  return (((numbers[0] * 256 + numbers[1]) * 256 + numbers[2]) * 256 + numbers[3]) >>> 0;
}

function cidrMatches(host, cidr) {
  const [network, prefixText] = String(cidr).split('/');
  const prefix = Number(prefixText);
  const hostNumber = ipv4Number(host);
  const networkNumber = ipv4Number(network);
  if (hostNumber === null || networkNumber === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (hostNumber & mask) === (networkNumber & mask);
}

function assertAllowedSshHost(host, allowedHosts = allowedSshHosts()) {
  const allowed = [...allowedHosts].some(entry => entry === host.toLowerCase() || cidrMatches(host, entry));
  if (allowedHosts.size > 0 && !allowed) {
    throw new RemoteInputError('This SSH host is not permitted');
  }
}

module.exports = {
  RemoteInputError,
  normalizeHost,
  normalizePort,
  normalizeRdpInput,
  allowedSshHosts,
  cidrMatches,
  assertAllowedSshHost,
};
