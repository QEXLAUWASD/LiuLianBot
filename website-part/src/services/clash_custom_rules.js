const yaml = require('js-yaml');
const { isIP } = require('node:net');
const { createHash } = require('node:crypto');
const { InputError } = require('../errors');
const fail = () => { throw new InputError('Enter valid custom routing YAML with supported rules, VPN/DIRECT/REJECT policies and HTTPS providers'); };

function parseCustomRouting(input) {
  let source;
  try {
    if (typeof input !== 'string' || !input.trim() || Buffer.byteLength(input, 'utf8') > 32000) fail();
    let nodes = 0;
    source = yaml.load(input, { schema: yaml.JSON_SCHEMA, listener: (event, state) => {
      if (++nodes > 5000 || state.anchor != null) fail();
    } });
  } catch { fail(); }
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      Object.keys(source).some(key => !['rules', 'rule-providers'].includes(key)) ||
      !Array.isArray(source.rules) || source.rules.length > 200) fail();
  const rawProviders = source['rule-providers'] ?? {};
  if (!rawProviders || typeof rawProviders !== 'object' || Array.isArray(rawProviders) || Object.keys(rawProviders).length > 32) fail();
  const providers = Object.create(null);
  for (const [name, provider] of Object.entries(rawProviders)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name) || !provider || typeof provider !== 'object' || Array.isArray(provider) ||
        Object.keys(provider).some(key => !['type', 'behavior', 'format', 'url', 'interval', 'path'].includes(key)) ||
        provider.type !== 'http' || !['domain', 'ipcidr', 'classical'].includes(provider.behavior) ||
        !['yaml', 'text', 'mrs'].includes(provider.format ?? 'yaml') ||
        (provider.format === 'mrs' && provider.behavior === 'classical') || typeof provider.url !== 'string' || provider.url.length > 2048) fail();
    let url;
    try { url = new URL(provider.url); } catch { fail(); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail();
    const interval = provider.interval ?? 86400;
    if (!Number.isInteger(interval) || interval < 60 || interval > 604800) fail();
    const hash = createHash('sha256').update(url.href).digest('hex').slice(0, 12);
    providers[name] = { type: 'http', behavior: provider.behavior, format: provider.format ?? 'yaml', url: url.href,
      interval, path: `./ruleset/llb-custom-${name}-${hash}.${provider.format ?? 'yaml'}` };
  }
  const kinds = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'IP-CIDR', 'IP-CIDR6', 'SRC-IP-CIDR', 'GEOIP', 'GEOSITE', 'RULE-SET', 'DST-PORT', 'SRC-PORT', 'NETWORK', 'PROCESS-NAME', 'PROCESS-PATH'];
  const rules = source.rules.map((rule, index) => {
    if (typeof rule !== 'string' || rule.length > 1024 || /[\x00-\x1f\x7f]/.test(rule)) fail();
    const parts = rule.split(',').map(part => part.trim());
    const [kind, value, policy, option] = parts;
    if (kind === 'MATCH') {
      if (parts.length !== 2 || index !== source.rules.length - 1 || !['VPN', 'DIRECT', 'REJECT'].includes(value)) fail();
    } else {
      if (!kinds.includes(kind) || !value || !['VPN', 'DIRECT', 'REJECT'].includes(policy) || ![3, 4].includes(parts.length)) fail();
      if (parts.length === 4 && (option !== 'no-resolve' || !['IP-CIDR', 'IP-CIDR6', 'GEOIP', 'RULE-SET'].includes(kind))) fail();
      if (kind === 'RULE-SET' && !Object.hasOwn(providers, value)) fail();
      if (['IP-CIDR', 'IP-CIDR6', 'SRC-IP-CIDR'].includes(kind)) {
        const [address, prefix, extra] = value.split('/');
        const version = isIP(address);
        if (!version || extra !== undefined || !/^\d+$/.test(prefix || '') || Number(prefix) > (version === 6 ? 128 : 32) ||
            (kind === 'IP-CIDR6' && version !== 6)) fail();
      }
      if (['DST-PORT', 'SRC-PORT'].includes(kind)) {
        if (!/^\d+(?:-\d+)?$/.test(value)) fail();
        const [start, end = start] = value.split('-').map(Number);
        if (start < 1 || end > 65535 || start > end) fail();
      }
      if (kind === 'NETWORK' && !['tcp', 'udp'].includes(value)) fail();
      if (kind === 'GEOIP' && !/^(?:[A-Za-z]{2}|LAN)$/.test(value)) fail();
      if (['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'GEOSITE'].includes(kind) && /\s/.test(value)) fail();
    }
    return parts.join(',');
  });
  if (!rules.at(-1)?.startsWith('MATCH,')) rules.push('MATCH,VPN');
  if (rules.length > 200) fail();
  return { rules, ...(Object.keys(providers).length ? { 'rule-providers': providers } : {}) };
}
function normalizeCustomYaml(input) {
  const output = yaml.dump(parseCustomRouting(input), { noRefs: true, lineWidth: 120 });
  if (Buffer.byteLength(output, 'utf8') > 32000) fail();
  return output;
}
module.exports = { parseCustomRouting, normalizeCustomYaml };
