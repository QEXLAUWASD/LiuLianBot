const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VlessTunnelConfigError,
  VlessTunnelInputError,
  generateMergedConfig,
  generateInterimTunnel,
  mergeClashConfig,
  mergeVlessAddresses,
} = require('../src/services/vless_tunnel');

const ENV = {
  VLESS_TUNNEL_ADDRESS: 'relay.example.com',
  VLESS_TUNNEL_PORT: '443',
  VLESS_TUNNEL_UUID: '11111111-1111-4111-8111-111111111111',
  VLESS_TUNNEL_NETWORK: 'ws',
  VLESS_TUNNEL_SECURITY: 'tls',
  VLESS_TUNNEL_SNI: 'relay.example.com',
  VLESS_TUNNEL_PATH: '/internal',
  VLESS_TUNNEL_HOST: 'relay.example.com',
  VLESS_TUNNEL_REMARK: 'Internal relay',
  VLESS_TUNNEL_INTERNAL_TARGET: '10.0.0.5/24',
  VLESS_TUNNEL_TTL_SECONDS: '600',
};

const ORIGINAL = 'vless://22222222-2222-4222-8222-222222222222@old.example.com:443?type=tcp&security=tls#old';

test('interim tunnel output includes transport, expiry, and a VLESS URL', () => {
  const result = generateInterimTunnel(ENV);
  assert.match(result.url, /^vless:\/\/11111111-1111-4111-8111-111111111111@relay\.example\.com/);
  assert.match(result.url, /type=ws/);
  assert.match(result.url, /path=%2Finternal/);
  assert.equal(result.expiresInSeconds, 600);
  assert.equal(result.internalTarget, '10.0.0.5/24');
  assert.match(result.id, /^[0-9a-f-]{36}$/);
});

test('VLESS address merge preserves originals and appends interim node', () => {
  const result = generateMergedConfig({ format: 'vless', source: ORIGINAL }, ENV);
  assert.match(result.config, /old\.example\.com/);
  assert.match(result.config, /relay\.example\.com/);
  assert.equal(result.config.split('\n').length, 2);
});

test('Clash merge appends a proxy and adds it to existing groups', () => {
  const source = `mixed-port: 7890
proxies:
  - name: old
    type: vless
    server: old.example.com
    port: 443
    uuid: 22222222-2222-4222-8222-222222222222
proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - old
`;
  const result = generateMergedConfig({ format: 'clash', source }, ENV);
  assert.match(result.config, /name: Internal relay/);
  assert.match(result.config, /server: relay\.example\.com/);
  assert.match(result.config, /- Internal relay/);
  assert.match(result.config, /mixed-port: 7890/);
});

test('invalid input and missing server configuration are distinguished', () => {
  assert.throws(
    () => mergeVlessAddresses('not-a-vless-url', generateInterimTunnel(ENV)),
    error => error instanceof VlessTunnelInputError && /valid URL/.test(error.message),
  );
  assert.throws(
    () => generateInterimTunnel({}),
    error => error instanceof VlessTunnelConfigError && error.statusCode === 503,
  );
});

test('Clash YAML parser rejects scalar documents', () => {
  assert.throws(
    () => mergeClashConfig('just-a-string', generateInterimTunnel(ENV)),
    error => error instanceof VlessTunnelInputError && /YAML object/.test(error.message),
  );
});
