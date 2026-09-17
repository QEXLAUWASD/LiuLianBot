import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteRdpProfile,
  listRdpProfiles,
  loadRdpProfile,
  saveRdpProfile,
} from '../../frontend/src/lib/rdpProfiles.mjs';

function recorder(handler) {
  const calls = [];
  return {
    calls,
    request: async (path, options = {}) => {
      calls.push({ path, options });
      return handler(path, options);
    },
  };
}

test('profiles are listed with availability and a safe fallback', async () => {
  const { request, calls } = recorder(async () => ({
    available: true,
    profiles: [{ id: 'one', name: 'Home', host: '192.168.0.10' }],
  }));

  assert.deepEqual(await listRdpProfiles(request), {
    available: true,
    profiles: [{ id: 'one', name: 'Home', host: '192.168.0.10' }],
  });
  assert.deepEqual(calls, [{ path: '/api/rdp/profiles', options: {} }]);

  const empty = recorder(async () => null);
  assert.deepEqual(await listRdpProfiles(empty.request), { available: false, profiles: [] });
});

test('loading a profile encodes the identifier and returns the stored password', async () => {
  const { request, calls } = recorder(async () => ({ profile: { id: 'a/b', password: 'secret' } }));

  assert.deepEqual(await loadRdpProfile('a/b', request), { id: 'a/b', password: 'secret' });
  assert.equal(calls[0].path, '/api/rdp/profiles/a%2Fb');
});

test('saving creates or updates a named profile', async () => {
  const profile = { name: 'Home', host: '192.168.0.10', password: 'secret' };

  const create = recorder(async () => ({ id: 'one' }));
  assert.equal(await saveRdpProfile(profile, { request: create.request }), 'one');
  assert.deepEqual(create.calls[0], {
    path: '/api/rdp/profiles',
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    },
  });

  const update = recorder(async () => null);
  assert.equal(await saveRdpProfile(profile, { id: 'one', request: update.request }), 'one');
  assert.equal(update.calls[0].path, '/api/rdp/profiles/one');
  assert.equal(update.calls[0].options.method, 'PUT');
});

test('deleting a profile uses the encoded delete endpoint', async () => {
  const { request, calls } = recorder(async () => null);

  await deleteRdpProfile('one', request);

  assert.deepEqual(calls, [{ path: '/api/rdp/profiles/one', options: { method: 'DELETE' } }]);
});

test('API failures propagate so the page can show the server message', async () => {
  const failing = async () => {
    throw new Error('Profile not found');
  };

  await assert.rejects(loadRdpProfile('missing', failing), /Profile not found/);
  await assert.rejects(deleteRdpProfile('missing', failing), /Profile not found/);
});
