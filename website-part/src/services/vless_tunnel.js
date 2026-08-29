const crypto = require('node:crypto');
const yaml = require('js-yaml');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPPORTED_NETWORKS = new Set(['tcp', 'ws', 'grpc']);
const SUPPORTED_SECURITY = new Set(['none', 'tls']);

class VlessTunnelInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VlessTunnelInputError';
    this.statusCode = 400;
  }
}

class VlessTunnelConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VlessTunnelConfigError';
    this.statusCode = 503;
  }
}

function stringValue(value, name, { max = 512, required = false } = {}) {
  if (typeof value !== 'string') {
    if (required) throw new VlessTunnelInputError(`${name} is required`);
    return '';
  }
  const result = value.trim();
  if (required && !result) throw new VlessTunnelInputError(`${name} is required`);
  if (result.length > max) throw new VlessTunnelInputError(`${name} is too long`);
  return result;
}

function envBoolean(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function readTunnelSettings(env = process.env) {
  const address = stringValue(env.VLESS_TUNNEL_ADDRESS, 'VLESS_TUNNEL_ADDRESS', { max: 253 });
  const uuid = stringValue(env.VLESS_TUNNEL_UUID, 'VLESS_TUNNEL_UUID', { max: 36 });
  if (!address || !uuid) throw new VlessTunnelConfigError('Interim VLESS tunnel is not configured');
  const port = Number(env.VLESS_TUNNEL_PORT || 443);
  if (!UUID_RE.test(uuid)) throw new VlessTunnelConfigError('VLESS_TUNNEL_UUID must be a valid UUID');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new VlessTunnelConfigError('VLESS_TUNNEL_PORT must be between 1 and 65535');

  const network = stringValue(env.VLESS_TUNNEL_NETWORK || 'tcp', 'VLESS_TUNNEL_NETWORK', { max: 8 });
  const security = stringValue(env.VLESS_TUNNEL_SECURITY || 'tls', 'VLESS_TUNNEL_SECURITY', { max: 8 });
  if (!SUPPORTED_NETWORKS.has(network)) throw new VlessTunnelConfigError('VLESS_TUNNEL_NETWORK must be tcp, ws, or grpc');
  if (!SUPPORTED_SECURITY.has(security)) throw new VlessTunnelConfigError('VLESS_TUNNEL_SECURITY must be none or tls');
  const ttlSeconds = Number(env.VLESS_TUNNEL_TTL_SECONDS || 3600);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86400) {
    throw new VlessTunnelConfigError('VLESS_TUNNEL_TTL_SECONDS must be between 60 and 86400');
  }
  return {
    address,
    port,
    uuid,
    network,
    security,
    sni: stringValue(env.VLESS_TUNNEL_SNI || address, 'VLESS_TUNNEL_SNI', { max: 253 }),
    path: stringValue(env.VLESS_TUNNEL_PATH || '/', 'VLESS_TUNNEL_PATH', { max: 1024 }),
    host: stringValue(env.VLESS_TUNNEL_HOST || '', 'VLESS_TUNNEL_HOST', { max: 253 }),
    flow: stringValue(env.VLESS_TUNNEL_FLOW || '', 'VLESS_TUNNEL_FLOW', { max: 64 }),
    remark: stringValue(env.VLESS_TUNNEL_REMARK || 'LiuLianBot interim internal tunnel', 'VLESS_TUNNEL_REMARK', { max: 80 }),
    internalTarget: stringValue(env.VLESS_TUNNEL_INTERNAL_TARGET || 'web server internal network', 'VLESS_TUNNEL_INTERNAL_TARGET', { max: 253 }),
    ttlSeconds,
    allowInsecure: envBoolean(env.VLESS_TUNNEL_ALLOW_INSECURE),
  };
}

function parseVlessUrl(value) {
  const raw = stringValue(value, 'VLESS server address', { max: 4096, required: true });
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new VlessTunnelInputError('VLESS server address is not a valid URL');
  }
  if (parsed.protocol !== 'vless:') throw new VlessTunnelInputError('Only vless:// server addresses are supported');
  if (!UUID_RE.test(parsed.username)) throw new VlessTunnelInputError('VLESS server address must contain a valid UUID');
  if (!parsed.hostname) throw new VlessTunnelInputError('VLESS server address must contain a host');
  return parsed;
}

function readOriginalVlessAddresses(source) {
  const lines = stringValue(source, 'Original configuration', { max: 32768, required: true })
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  if (!lines.length || lines.length > 20) throw new VlessTunnelInputError('Enter between 1 and 20 VLESS addresses');
  return lines.map(parseVlessUrl);
}

function vlessUrl(settings) {
  const params = new URLSearchParams({
    type: settings.network,
    security: settings.security,
  });
  if (settings.sni) params.set('sni', settings.sni);
  if (settings.network === 'ws') {
    params.set('path', settings.path);
    if (settings.host) params.set('host', settings.host);
  }
  if (settings.network === 'grpc') params.set('serviceName', settings.path.replace(/^\/+/, ''));
  if (settings.flow) params.set('flow', settings.flow);
  if (settings.allowInsecure) params.set('allowInsecure', '1');
  return `vless://${settings.uuid}@${settings.address}:${settings.port}?${params.toString()}#${encodeURIComponent(settings.remark)}`;
}

function vlessProxyFromUrl(parsed, name) {
  const query = parsed.searchParams;
  const network = query.get('type') || 'tcp';
  const security = query.get('security') || 'none';
  const proxy = {
    name,
    type: 'vless',
    server: parsed.hostname,
    port: Number(parsed.port || (parsed.searchParams.get('security') === 'tls' ? 443 : 80)),
    uuid: decodeURIComponent(parsed.username),
    udp: true,
    tls: security === 'tls',
  };
  if (query.get('sni')) proxy.servername = query.get('sni');
  if (query.get('flow')) proxy.flow = query.get('flow');
  if (network !== 'tcp') {
    proxy.network = network;
    if (network === 'ws') {
      proxy['ws-opts'] = { path: query.get('path') || '/' };
      if (query.get('host')) proxy['ws-opts'].headers = { Host: query.get('host') };
    }
    if (network === 'grpc') proxy['grpc-opts'] = { 'grpc-service-name': query.get('serviceName') || '' };
  }
  if (security === 'none') delete proxy.tls;
  if (query.get('allowInsecure') === '1') proxy['skip-cert-verify'] = true;
  return proxy;
}

function mergeVlessAddresses(source, interim) {
  const originals = readOriginalVlessAddresses(source);
  const output = originals.map((url, index) => {
    const name = decodeURIComponent(url.hash.slice(1)) || `original-${index + 1}`;
    return url.toString().replace(/#.*$/, `#${encodeURIComponent(name)}`);
  });
  output.push(interim.url);
  return output.join('\n');
}

function mergeClashConfig(source, interim) {
  let config;
  try {
    config = yaml.load(stringValue(source, 'Original configuration', { max: 32768, required: true }), {
      json: false,
      maxAliasCount: 20,
    });
  } catch (err) {
    throw new VlessTunnelInputError(`Clash YAML cannot be parsed: ${err.message}`);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new VlessTunnelInputError('Clash configuration must be a YAML object');
  }
  const result = structuredClone(config);
  if (!Array.isArray(result.proxies)) result.proxies = [];
  const existingNames = new Set(result.proxies.map(proxy => proxy?.name).filter(Boolean));
  let name = interim.name;
  let suffix = 2;
  while (existingNames.has(name)) name = `${interim.name} ${suffix++}`;
  result.proxies.push({ ...interim.clashProxy, name });

  if (Array.isArray(result['proxy-groups'])) {
    result['proxy-groups'] = result['proxy-groups'].map(group => {
      if (!group || typeof group !== 'object' || !Array.isArray(group.proxies)) return group;
      if (group.proxies.includes(name)) return group;
      return { ...group, proxies: [...group.proxies, name] };
    });
  }
  return yaml.dump(result, { noRefs: true, lineWidth: 120, sortKeys: false });
}

function generateInterimTunnel(env = process.env) {
  const settings = readTunnelSettings(env);
  const generatedAt = Date.now();
  const expiresAt = new Date(generatedAt + settings.ttlSeconds * 1000).toISOString();
  const name = settings.remark;
  const url = vlessUrl(settings);
  const parsed = new URL(url);
  return {
    id: crypto.randomUUID(),
    generatedAt: new Date(generatedAt).toISOString(),
    expiresAt,
    expiresInSeconds: settings.ttlSeconds,
    name,
    url,
    internalTarget: settings.internalTarget,
    clashProxy: vlessProxyFromUrl(parsed, name),
  };
}

function generateMergedConfig({ format, source }, env = process.env) {
  const normalizedFormat = stringValue(format, 'Configuration format', { max: 20, required: true }).toLowerCase();
  if (!['vless', 'clash'].includes(normalizedFormat)) {
    throw new VlessTunnelInputError('Configuration format must be vless or clash');
  }
  const interim = generateInterimTunnel(env);
  const config = normalizedFormat === 'clash'
    ? mergeClashConfig(source, interim)
    : mergeVlessAddresses(source, interim);
  return { format: normalizedFormat, config, ...interim };
}

module.exports = {
  VlessTunnelInputError,
  VlessTunnelConfigError,
  generateInterimTunnel,
  generateMergedConfig,
  mergeClashConfig,
  mergeVlessAddresses,
  parseVlessUrl,
  readTunnelSettings,
};
