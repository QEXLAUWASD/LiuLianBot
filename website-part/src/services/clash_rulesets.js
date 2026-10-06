const { InputError } = require('../errors');
const { parseCustomRouting } = require('./clash_custom_rules');

const DEFAULT_RULESET = 'all-vpn';
const RULESETS = Object.freeze([
  { id: 'all-vpn', name: 'All traffic via VPN', description: 'Route all traffic through the selected VPN server.' },
  { id: 'lan-direct', name: 'LAN direct, others via VPN', description: 'Connect to local networks directly; route other traffic through VPN.' },
  { id: 'cn-direct', name: 'China direct, others via VPN', description: 'Connect to local networks and listed Chinese domains/IPs directly; route other traffic through VPN.' },
  { id: 'cn-direct-adblock', name: 'China direct with ad blocking', description: 'Use China direct routing and block domains in the advertising rule set.' },
  { id: 'custom', name: 'Custom rule set', description: 'Define your own ordered rules and HTTPS rule providers.' },
]);
function normalizeRuleset(value) {
  if (typeof value !== 'string' || !RULESETS.some(item => item.id === value)) throw new InputError('Select a supported rule set');
  return value;
}
function routingFor(value = DEFAULT_RULESET, customYaml) {
  const id = normalizeRuleset(value);
  if (id === 'custom') return parseCustomRouting(customYaml);
  const rules = [];
  const providers = {};
  const provider = (name, behavior, policy, noResolve = false) => {
    const key = `llb-${name}`;
    providers[key] = { type: 'http', behavior, format: 'yaml',
      url: `https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/${name}.txt`,
      path: `./ruleset/${key}.yaml`, interval: 86400 };
    rules.push(`RULE-SET,${key},${policy}${noResolve ? ',no-resolve' : ''}`);
  };
  if (id !== DEFAULT_RULESET) {
    rules.push('DOMAIN,localhost,DIRECT', 'DOMAIN-SUFFIX,local,DIRECT');
    for (const range of ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16']) rules.push(`IP-CIDR,${range},DIRECT,no-resolve`);
    for (const range of ['::1/128', 'fc00::/7', 'fe80::/10']) rules.push(`IP-CIDR6,${range},DIRECT,no-resolve`);
  }
  if (id === 'cn-direct-adblock') provider('reject', 'domain', 'REJECT');
  if (id.startsWith('cn-direct')) {
    provider('direct', 'domain', 'DIRECT');
    provider('cncidr', 'ipcidr', 'DIRECT', true);
  }
  rules.push('MATCH,VPN');
  return { rules, ...(Object.keys(providers).length ? { 'rule-providers': providers } : {}) };
}
module.exports = { DEFAULT_RULESET, RULESETS, normalizeRuleset, routingFor };
