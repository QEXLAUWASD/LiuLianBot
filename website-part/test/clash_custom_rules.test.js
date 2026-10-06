const test = require('node:test');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');
const { parseCustomRouting, normalizeCustomYaml } = require('../src/services/clash_custom_rules');
const { routingFor } = require('../src/services/clash_rulesets');
const { normalizeSubscription } = require('../src/services/clash_config');
const serialize = value => yaml.dump(value);

test('custom providers preserve rule order with generated safe paths and round-trip normalized YAML', () => {
  const input = serialize({ rules: ['RULE-SET,ads,REJECT', 'DOMAIN-SUFFIX,example.com,DIRECT'], 'rule-providers': {
    ads: { type: 'http', behavior: 'domain', url: 'https://example.com/ads.yaml', path: '../../overwrite.yaml' },
  } });
  const config = routingFor('custom', input);
  assert.equal(config.rules.at(-1), 'MATCH,VPN');
  assert.equal(config.rules[0], 'RULE-SET,ads,REJECT');
  assert.match(config['rule-providers'].ads.path, /^\.\/ruleset\/llb-custom-ads-[a-f0-9]{12}\.yaml$/);
  assert.equal(config['rule-providers'].ads.interval, 86400);
  assert.deepEqual(parseCustomRouting(normalizeCustomYaml(input)), config);
  const body = normalizeSubscription({ enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [], ruleset_id: 'custom', custom_rules_yaml: input });
  assert.deepEqual(parseCustomRouting(body.custom_rules_yaml), config);
});

test('custom rules validate addresses, ports, policies and final catch-all placement', () => {
  for (const rule of ['IP-CIDR,999.0.0.1/32,VPN', 'IP-CIDR6,10.0.0.0/8,VPN', 'IP-CIDR,10.0.0.0/99,VPN',
    'DST-PORT,65536,DIRECT', 'SRC-PORT,100-10,DIRECT', 'NETWORK,icmp,DIRECT', 'DOMAIN,x,Unknown', 'DOMAIN,x,VPN,no-resolve', 'AND,((DOMAIN,x)),VPN']) {
    assert.throws(() => parseCustomRouting(serialize({ rules: [rule] })), { statusCode: 400 });
  }
  assert.throws(() => parseCustomRouting(serialize({ rules: ['MATCH,VPN', 'DOMAIN,x,DIRECT'] })), { statusCode: 400 });
  assert.deepEqual(parseCustomRouting(serialize({ rules: ['GEOIP,CN,DIRECT,no-resolve', 'DST-PORT,80-443,VPN', 'MATCH,DIRECT'] })).rules,
    ['GEOIP,CN,DIRECT,no-resolve', 'DST-PORT,80-443,VPN', 'MATCH,DIRECT']);
});

test('custom YAML rejects config overrides, aliases, missing providers and oversized rules', () => {
  for (const input of ['rules: &rules [MATCH,VPN]', 'rules: []\nproxy-groups: []', 'rules: ["RULE-SET,missing,VPN"]',
    serialize({ rules: Array(201).fill('DOMAIN,x,DIRECT') }), 'x'.repeat(32001), '中'.repeat(11000), 'rules: ["DOMAIN,x,VPN\nMATCH,DIRECT"]']) {
    assert.throws(() => parseCustomRouting(input), { statusCode: 400 });
  }
  assert.throws(() => routingFor('custom'), { statusCode: 400 });
});

test('custom HTTP providers enforce format compatibility, intervals and credential-free HTTPS URLs', () => {
  const provider = { type: 'http', behavior: 'domain', url: 'https://example.com/list.yaml' };
  for (const override of [{ type: 'file' }, { url: 'http://example.com/list' }, { url: 'https://user:password@example.com/list' },
    { interval: 0 }, { interval: 999999 }, { format: 'json' }, { behavior: 'classical', format: 'mrs' }, { header: {} }]) {
    assert.throws(() => parseCustomRouting(serialize({ rules: ['RULE-SET,list,VPN'], 'rule-providers': { list: { ...provider, ...override } } })), { statusCode: 400 });
  }
});
