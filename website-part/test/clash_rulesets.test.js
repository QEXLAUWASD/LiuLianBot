const test = require('node:test');
const assert = require('node:assert/strict');
const { RULESETS, routingFor, normalizeRuleset } = require('../src/services/clash_rulesets');
const { normalizeSubscription } = require('../src/services/clash_config');

test('default rules preserve all-VPN routing and LAN routing needs no remote provider', () => {
  assert.deepEqual(routingFor(), { rules: ['MATCH,VPN'] });
  const lan = routingFor('lan-direct');
  assert.equal(Object.hasOwn(lan, 'rule-providers'), false);
  assert.ok(lan.rules.includes('IP-CIDR,192.168.0.0/16,DIRECT,no-resolve'));
  assert.ok(lan.rules.includes('IP-CIDR6,fc00::/7,DIRECT,no-resolve'));
  assert.equal(lan.rules.at(-1), 'MATCH,VPN');
});

test('every provider rule has a fixed valid provider and ads are blocked before China direct', () => {
  for (const preset of RULESETS.filter(item => item.id !== 'custom')) {
    const config = routingFor(preset.id);
    for (const rule of config.rules.filter(rule => rule.startsWith('RULE-SET,'))) {
      const [, name, policy] = rule.split(',');
      assert.ok(['DIRECT', 'REJECT'].includes(policy));
      const provider = config['rule-providers'][name];
      assert.equal(provider.type, 'http');
      assert.equal(provider.format, 'yaml');
      assert.match(provider.url, /^https:\/\/cdn\.jsdelivr\.net\/gh\/Loyalsoldier\/clash-rules@release\/[a-z]+\.txt$/);
      assert.equal(provider.interval, 86400);
      assert.match(provider.path, /^\.\/ruleset\/llb-[a-z]+\.yaml$/);
    }
  }
  const ads = routingFor('cn-direct-adblock');
  assert.ok(ads.rules.indexOf('RULE-SET,llb-reject,REJECT') < ads.rules.indexOf('RULE-SET,llb-direct,DIRECT'));
  assert.equal(ads['rule-providers']['llb-cncidr'].behavior, 'ipcidr');
  assert.equal(Object.hasOwn(routingFor('cn-direct')['rule-providers'], 'llb-reject'), false);
  ads['rule-providers']['llb-reject'].url = 'changed';
  assert.notEqual(routingFor('cn-direct-adblock')['rule-providers']['llb-reject'].url, 'changed');
});

test('unsupported rules are rejected and omitted selection remains optional for existing clients', () => {
  for (const value of [null, {}, 'unknown', 'https://example.com/rules', '__proto__']) assert.throws(() => normalizeRuleset(value), { statusCode: 400 });
  const body = { enabled: true, expires_at: '2099-01-01T00:00:00Z', server_ids: [1] };
  assert.equal(Object.hasOwn(normalizeSubscription(body), 'ruleset_id'), false);
  assert.equal(normalizeSubscription({ ...body, ruleset_id: 'lan-direct' }).ruleset_id, 'lan-direct');
});
