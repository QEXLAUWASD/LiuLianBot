const test = require('node:test');
const assert = require('node:assert/strict');
const { originCheck, originMatchesHost } = require('../src/middleware/origin_check');

function request({ method = 'POST', headers = {} } = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    method,
    headers: normalized,
    get(name) {
      return normalized[name.toLowerCase()];
    },
  };
}

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('origin host matching understands ports and rejects opaque origins', () => {
  assert.equal(originMatchesHost('https://liulian.dev', 'liulian.dev'), true);
  assert.equal(originMatchesHost('http://192.168.0.1:30011', '192.168.0.1:30011'), true);
  assert.equal(originMatchesHost('https://evil.example', 'liulian.dev'), false);
  assert.equal(originMatchesHost('null', 'liulian.dev'), false);
});

test('safe methods and matching-origin writes pass through', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    let called = false;
    originCheck(request({ method, headers: { origin: 'https://evil.example' } }), response(), () => {
      called = true;
    });
    assert.equal(called, true, `${method} is safe`);
  }

  let called = false;
  originCheck(
    request({ headers: { origin: 'https://liulian.dev', host: 'liulian.dev' } }),
    response(),
    () => { called = true; },
  );
  assert.equal(called, true);
});

test('cross-site writes are rejected with 403', () => {
  for (const headers of [
    { origin: 'https://evil.example', host: 'liulian.dev' },
    { origin: 'https://liulian.dev', host: 'liulian.dev', 'sec-fetch-site': 'cross-site' },
    { origin: 'null', host: 'liulian.dev' },
  ]) {
    const res = response();
    let called = false;
    originCheck(request({ headers }), res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Cross-site request blocked' });
  }
});

test('requests without browser fetch metadata stay allowed', () => {
  let called = false;
  originCheck(request(), response(), () => { called = true; });
  assert.equal(called, true);
});
