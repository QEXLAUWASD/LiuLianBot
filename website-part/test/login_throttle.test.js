const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createLoginThrottle } = require('../src/middleware/login_throttle');

function fakeResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.body = null;
  res.set = (name, value) => {
    res.headers[name] = value;
    return res;
  };
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = body => {
    res.body = body;
    return res;
  };
  return res;
}

function attempt(throttle, username, statusCode, res = fakeResponse()) {
  let nexted = false;
  throttle({ body: { username }, method: 'POST' }, res, () => { nexted = true; });
  if (nexted) {
    res.statusCode = statusCode;
    res.emit('finish');
  }
  return { res, nexted };
}

test('repeated failures for one account are throttled', () => {
  let clock = 0;
  const throttle = createLoginThrottle({ limit: 3, windowMs: 60_000, now: () => clock });

  for (let index = 0; index < 3; index += 1) {
    const { nexted } = attempt(throttle, 'Alice', 401);
    assert.equal(nexted, true, `failure ${index + 1} is not yet blocked`);
  }

  const blocked = attempt(throttle, 'alice', 401);
  assert.equal(blocked.nexted, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.ok(Number(blocked.res.headers['Retry-After']) > 0);
  assert.match(blocked.res.body.error, /Too many failed login attempts/);
});

test('a successful login clears the failure counter', () => {
  let clock = 0;
  const throttle = createLoginThrottle({ limit: 2, windowMs: 60_000, now: () => clock });

  attempt(throttle, 'alice', 401);
  attempt(throttle, 'alice', 400);
  attempt(throttle, 'alice', 200);
  assert.equal(throttle.size(), 0);

  const next = attempt(throttle, 'alice', 401);
  assert.equal(next.nexted, true);
});

test('the failure window expires', () => {
  let clock = 0;
  const throttle = createLoginThrottle({ limit: 1, windowMs: 1000, now: () => clock });

  attempt(throttle, 'alice', 401);
  assert.equal(attempt(throttle, 'alice', 401).nexted, false);

  clock = 2000;
  assert.equal(attempt(throttle, 'alice', 401).nexted, true);
});

test('different accounts keep separate counters', () => {
  let clock = 0;
  const throttle = createLoginThrottle({ limit: 1, windowMs: 60_000, now: () => clock });

  attempt(throttle, 'alice', 401);
  assert.equal(attempt(throttle, 'alice', 401).nexted, false);
  assert.equal(attempt(throttle, 'bob', 401).nexted, true);
});

test('requests without a username are not tracked', () => {
  let clock = 0;
  const throttle = createLoginThrottle({ limit: 1, windowMs: 60_000, now: () => clock });
  assert.equal(attempt(throttle, undefined, 401).nexted, true);
  assert.equal(throttle.size(), 0);
});
