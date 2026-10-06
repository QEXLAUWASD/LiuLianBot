const yaml = require('js-yaml');
const { InputError } = require('../errors');

function positiveId(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new InputError('Invalid VPN server ID');
  }
  return Number(value);
}

function normalizeServer(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Expected a server object');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100 || ['DIRECT', 'REJECT', 'GLOBAL', 'VPN'].includes(name)) {
    throw new InputError('Enter a unique server name (1–100 characters, excluding reserved names)');
  }
  if (typeof body.enabled !== 'boolean') throw new InputError('enabled must be a boolean');
  let proxy;
  try {
    // JSON schema allows plain YAML data only; reject aliases to avoid recursive structures.
    if (typeof body.proxy_yaml !== 'string' || body.proxy_yaml.length > 16000) {
      throw new Error();
    }
    let nodes = 0;
    proxy = yaml.load(body.proxy_yaml, { schema: yaml.JSON_SCHEMA, listener: (event, state) => {
      if (++nodes > 1000 || state.anchor != null) throw new Error('YAML is too complex or contains anchors');
    } });
  } catch {
    throw new InputError('Enter one proxy as YAML without anchors or aliases (maximum 16 KB)');
  }
  if (!proxy || typeof proxy !== 'object' || Array.isArray(proxy) ||
      !['ss', 'vmess', 'vless', 'trojan', 'hysteria2', 'tuic', 'socks5', 'http'].includes(proxy.type) ||
      typeof proxy.server !== 'string' || !proxy.server.trim() || proxy.server.length > 253 ||
      !Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535) {
    throw new InputError('Proxy requires a supported type, server and port (1–65535)');
  }
  if (['vmess', 'vless', 'tuic'].includes(proxy.type) &&
      (typeof proxy.uuid !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(proxy.uuid))) {
    throw new InputError('This proxy type requires a valid UUID');
  }
  if (['ss', 'trojan', 'hysteria2', 'tuic'].includes(proxy.type) &&
      (typeof proxy.password !== 'string' || !proxy.password)) throw new InputError('This proxy type requires a password');
  if (proxy.type === 'ss' && (typeof proxy.cipher !== 'string' || !proxy.cipher)) throw new InputError('Shadowsocks requires a cipher');
  // Cross-node references could disclose or route through nodes outside the user grant.
  if (['dialer-proxy', 'proxy', 'name'].some(key => Object.hasOwn(proxy, key))) {
    throw new InputError('Omit name and cross-node references; the server name is managed separately');
  }
  const management_profile = body.management_profile || null;
  if (management_profile !== null && (typeof management_profile !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(management_profile))) throw new InputError('Invalid SSH management profile');
  if (management_profile && !['ss', 'vmess', 'vless', 'trojan', 'hysteria2'].includes(proxy.type)) throw new InputError('This protocol cannot be managed over SSH');
  if (management_profile && proxy.type === 'ss' && !['2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm'].includes(proxy.cipher)) throw new InputError('SSH-managed Shadowsocks requires AEAD 2022 AES');
  return { name, enabled: body.enabled, proxy_json: JSON.stringify(proxy), management_profile };
}

function normalizeSubscription(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Expected a subscription object');
  if (typeof body.enabled !== 'boolean') throw new InputError('enabled must be a boolean');
  if (typeof body.expires_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.expires_at) ||
      !Number.isFinite(Date.parse(body.expires_at))) throw new InputError('expires_at must be an ISO timestamp with timezone');
  if (!Array.isArray(body.server_ids) || body.server_ids.length > 200 ||
      body.server_ids.some(id => typeof id !== 'number')) throw new InputError('Select up to 200 VPN server IDs');
  return { enabled: body.enabled, expires_at: new Date(body.expires_at), server_ids: [...new Set(body.server_ids.map(positiveId))] };
}

function renderConfig(servers) {
  const proxies = servers.map(server => ({ ...JSON.parse(server.proxy_json), name: server.name }));
  return yaml.dump({ 'mixed-port': 7890, 'allow-lan': false, mode: 'rule',
    proxies, 'proxy-groups': [{ name: 'VPN', type: 'select', proxies: proxies.map(proxy => proxy.name) }],
    rules: ['MATCH,VPN'] }, { noRefs: true, lineWidth: 120 });
}
module.exports = { positiveId, normalizeServer, normalizeSubscription, renderConfig };
