const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Readable } = require('node:stream');
const { createRouter, hashCode } = require('../src/routes/files');
const { createAccess } = require('../src/services/file_access');
const {
  relativePath, sourcePath, resolveTarget, config, collectArchiveEntries, writeArchive,
} = require('../src/services/file_storage');
const { AppError } = require('../src/errors');
const { errorHandler } = require('../src/middleware/error_handler');
const { MIGRATIONS } = require('../src/db/migrate');

test('storage confines paths to /vol*/1000 and rejects traversal and symlinks', async () => {
  for (const value of ['../etc', 'vol1/../etc', '/vol1/1000', 'vol1/./x', 'vol1\\x', 'vol1/a\0b', ['vol1']]) assert.throws(() => relativePath(value));
  for (const value of ['', 'etc/passwd', 'vol.1/a']) assert.throws(() => sourcePath(value));
  assert.deepEqual(sourcePath('vol2/相片/照片.jpg'), { root: '/vol2/1000', relative: '相片/照片.jpg', normalized: 'vol2/相片/照片.jpg' });
  const stats = { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false };
  const fake = { realpath: (p, cb) => cb(null, p), stat: (p, cb) => cb(null, stats), lstat: (p, cb) => cb(null, stats) };
  assert.equal((await resolveTarget(fake, '/vol1/1000', 'folder')).target, '/vol1/1000/folder');
  await assert.rejects(resolveTarget({ ...fake, lstat: (p, cb) => cb(null, { isSymbolicLink: () => true }) }, '/vol1/1000', 'alias'), /符號連結/);
  await assert.rejects(resolveTarget({ ...fake, realpath: (p, cb) => cb(null, '/etc') }, '/vol1/1000', ''), /符號連結/);
  await assert.rejects(resolveTarget({ ...fake, realpath: (p, cb) => cb(null, p.endsWith('escape') ? '/vol1/1000-other' : p) }, '/vol1/1000', 'escape'), /無法存取/);
});

test('SFTP configuration requires a pinned host key', () => {
  const env = { FILES_SFTP_HOST: 'nas', FILES_SFTP_USER: 'files', FILES_SFTP_PASSWORD: 'secret', FILES_SFTP_HOST_SHA256: 'a'.repeat(64) };
  assert.equal(config(env).hostVerifier('a'.repeat(64)), true);
  assert.equal(config(env).hostVerifier('b'.repeat(64)), false);
  assert.throws(() => config({ ...env, FILES_SFTP_HOST_SHA256: '' }), /尚未設定/);
  assert.throws(() => config({ ...env, FILES_SFTP_PORT: '65536' }), /連接埠/);
});

test('file access uses pinned account ID and live grants, never username or general admin status', async () => {
  let grant = { can_read: 1, can_write: 0, can_share: 1 };
  const access = createAccess({ env: { FILES_OWNER_USER_ID: 'owner' }, permissions: { get: async () => grant },
    findUser: async id => ({ id, username: 'LiuLian', role_name: 'admin' }) });
  await assert.rejects(access({}), err => err.statusCode === 401);
  const owner = await access({ session: { user: { id: 'owner' } } });
  assert.equal(owner.owner, true); assert.equal(owner.write, true);
  const member = await access({ session: { user: { id: 'other' } } });
  assert.equal(member.owner, false); assert.equal(member.write, false); assert.equal(member.share, true);
  grant = null;
  assert.equal((await access({ session: { user: { id: 'other' } } })).read, false);
});

test('files API enforces approval, separate write/share grants, public share confinement, expiry and revocation', async t => {
  const records = new Map(), calls = [], grants = new Map();
  grants.set('reader', { read: true, write: false, share: false });
  const permissions = {
    get: async id => { const g = grants.get(id); return g ? { can_read: g.read, can_write: g.write, can_share: g.share } : null; },
    request: async id => calls.push(['request', id]), list: async () => [], set: async (id, grant) => grants.set(id, grant),
  };
  const repo = {
    create: async row => records.set(row.code_hash, row),
    find: async hash => { const row = records.get(hash); return row && !row.revoked && row.expires_at > new Date() ? row : null; },
    list: async (owner, all) => [...records.values()].filter(r => all || r.owner_id === owner),
    revoke: async (owner, id, all) => { const row = [...records.values()].find(r => r.id === id && (all || r.owner_id === owner)); if (!row) return false; row.revoked = true; return true; },
  };
  const storage = {
    inspect: async path => ({ path, name: path.split('/').pop(), directory: !path.endsWith('.txt') }),
    list: async path => { calls.push(['list', path]); return [{ name: '<img src=x onerror=alert(1)>', directory: false, size: 3 }]; },
    download: async (path, res) => { calls.push(['download', path]); res.send('abc'); },
    archive: async (paths, res, options) => {
      calls.push(['archive', paths, { name: options?.name ?? null, base: options?.base ?? null }]);
      res.set('Content-Type', 'application/zip');
      res.end('PK');
    },
    mkdir: async path => calls.push(['mkdir', path]), rename: async (from, to) => calls.push(['rename', from, to]),
    remove: async path => calls.push(['remove', path]), upload: async path => calls.push(['upload', path]),
  };
  const app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => { req.session = { user: req.get('X-Test-User') ? { id: req.get('X-Test-User') } : null }; next(); });
  const access = createAccess({ permissions, env: { FILES_OWNER_USER_ID: 'owner' }, findUser: async id => ({ id }) });
  app.use(createRouter({ storage, repo, permissions, access, findUser: async name => ({ id: name }) })); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (user, method, path, body, csrf = true) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { 'X-Test-User': user } : {}), ...(csrf ? { 'X-Files-Request': '1' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal((await request(null, 'GET', '/list')).status, 401);
  assert.equal((await request('pending', 'GET', '/list')).status, 403);
  assert.equal((await request('reader', 'GET', '/list')).status, 200);
  assert.equal((await request('reader', 'POST', '/folder', { path: 'vol1/new' })).status, 403);
  assert.equal((await request('reader', 'POST', '/shares', { path: 'vol1/new', hours: 1 })).status, 403);
  assert.equal((await request('pending', 'POST', '/access/request')).status, 204);
  assert.equal((await request('reader', 'PUT', '/permissions', { username: 'reader', read: true, write: true, share: true })).status, 403);
  assert.equal((await request('owner', 'PUT', '/permissions', { username: 'reader', read: true, write: true, share: true }, false)).status, 403);
  assert.equal((await request('owner', 'PUT', '/permissions', { username: 'reader', read: true, write: true, share: true })).status, 204);
  assert.equal((await request('reader', 'POST', '/folder', { path: 'vol1/new' })).status, 201);
  const response = await request('reader', 'POST', '/shares', { path: 'vol1/private/shared', hours: 24 });
  assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
  const share = await response.json(); assert.match(share.code, /^[a-f0-9]{32}$/);
  const stored = records.get(hashCode(share.code)); assert.equal(stored.code, undefined);
  assert.equal((await request(null, 'POST', '/shared/list', { code: share.code, path: 'child' })).status, 200);
  assert.deepEqual(calls.at(-1), ['list', 'vol1/private/shared/child']);
  assert.equal((await request(null, 'POST', '/shared/list', { code: share.code, path: '../sibling' })).status, 400);
  assert.equal((await request(null, 'POST', '/shared/download', { code: share.code, path: '/etc/passwd' })).status, 400);
  assert.equal((await request(null, 'POST', '/shared/download', { code: share.code, path: 'child/a.txt' })).status, 200);
  assert.deepEqual(calls.at(-1), ['download', 'vol1/private/shared/child/a.txt']);
  const archived = await request('reader', 'POST', '/archive', { paths: ['vol1/相片', 'vol1/a.txt'] });
  assert.equal(archived.status, 200);
  assert.equal(archived.headers.get('content-type'), 'application/zip');
  assert.deepEqual(calls.at(-1), ['archive', ['vol1/相片', 'vol1/a.txt'], { name: null, base: null }]);
  assert.equal((await request('reader', 'POST', '/archive', { paths: ['vol1/a.txt'], name: '備份.zip' })).status, 200);
  assert.deepEqual(calls.at(-1), ['archive', ['vol1/a.txt'], { name: '備份.zip', base: null }],
    'the suggested name reaches storage');
  // The archive endpoint is read-only, but it is still a mutation-style call.
  assert.equal((await request('reader', 'POST', '/archive', { paths: ['vol1/a.txt'] }, false)).status, 403);
  assert.equal((await request('pending', 'POST', '/archive', { paths: ['vol1/a.txt'] })).status, 403);
  assert.equal((await request('reader', 'POST', '/archive', {})).status, 400);
  assert.equal((await request('reader', 'POST', '/archive', { paths: [] })).status, 400);
  assert.equal((await request('reader', 'POST', '/archive', { paths: ['../etc'] })).status, 400);
  assert.equal((await request('reader', 'POST', '/archive',
    { paths: Array.from({ length: 51 }, (_, index) => `vol1/f${index}`) })).status, 400);
  assert.equal((await request('owner', 'POST', '/shares', { path: 'vol1/private/shared', hours: 169 })).status, 400);
  const fileShare = await (await request('owner', 'POST', '/shares', { path: 'vol1/a.txt', hours: 1 })).json();
  assert.equal((await request(null, 'POST', '/shared/download', { code: fileShare.code, path: 'other' })).status, 403);
  // Shared folders can be packed too, but only inside the shared path.
  assert.equal((await request(null, 'POST', '/shared/archive', { code: share.code, paths: ['child/a.txt'] })).status, 200);
  assert.deepEqual(calls.at(-1),
    ['archive', ['child/a.txt'], { name: null, base: 'vol1/private/shared' }],
    'shared archives resolve inside the share root');
  assert.equal((await request(null, 'POST', '/shared/archive',
    { code: share.code, paths: ['../sibling'] })).status, 400);
  assert.equal((await request(null, 'POST', '/shared/archive', { code: share.code, paths: [] })).status, 400);
  assert.equal((await request(null, 'POST', '/shared/archive',
    { code: share.code, paths: Array.from({ length: 51 }, (_, index) => `f${index}`) })).status, 400);
  assert.equal((await request(null, 'POST', '/shared/archive', { code: fileShare.code, paths: ['a'] })).status, 400,
    'single file shares are downloaded directly');
  assert.equal((await request(null, 'POST', '/shared/archive', { code: 'f'.repeat(32), paths: ['a'] })).status, 404);
  assert.equal((await request('reader', 'DELETE', '/shares/' + fileShare.id)).status, 404);
  stored.expires_at = new Date(0);
  assert.equal((await request(null, 'POST', '/shared/list', { code: share.code })).status, 404);
  stored.expires_at = new Date(Date.now() + 100000);
  assert.equal((await request('owner', 'DELETE', '/shares/' + share.id)).status, 204);
  assert.equal((await request(null, 'POST', '/shared/list', { code: share.code })).status, 404);
  assert.equal((await request('owner', 'PUT', '/permissions', { username: 'reader', read: false, write: false, share: false })).status, 204);
  assert.equal((await request('reader', 'GET', '/list')).status, 403);
});

test('the archive route streams a complete ZIP and closes the response', async t => {
  // The real plan builder and ZIP writer over a fake SFTP tree, so the HTTP
  // response has to end on its own: a missing `res.end()` would hang here.
  const tree = {
    '/vol1/1000': { children: ['a.txt'] },
    '/vol1/1000/a.txt': { content: 'hello zip' },
  };
  const entryAttrs = target => {
    const item = tree[target];
    if (!item) return null;
    const file = item.content !== undefined;
    return { size: file ? Buffer.byteLength(item.content) : 0, mtime: 1700000000,
      isDirectory: () => !file, isFile: () => file, isSymbolicLink: () => false };
  };
  const sftp = {
    realpath: (target, callback) => callback(null, target),
    stat: (target, callback) => callback(null, entryAttrs(target)),
    lstat: (target, callback) => callback(null, entryAttrs(target)),
    readdir: (target, callback) => callback(null, (tree[target].children || [])
      .map(name => ({ filename: name, attrs: entryAttrs(`${target}/${name}`) }))),
    createReadStream: target => Readable.from([Buffer.from(tree[target].content)]),
  };
  const storage = {
    archive: async (paths, res) => {
      const entries = await collectArchiveEntries(sftp, paths);
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename="a.txt.zip"');
      await writeArchive({ sftp, entries, output: res });
    },
  };
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { user: { id: 'reader' } }; next(); });
  app.use(createRouter({
    storage,
    permissions: { get: async () => ({ can_read: 1, can_write: 0, can_share: 0 }) },
    access: createAccess({ permissions: { get: async () => ({ can_read: 1 }) },
      env: { FILES_OWNER_USER_ID: 'owner' }, findUser: async id => ({ id }) }),
  }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Files-Request': '1' },
    body: JSON.stringify({ paths: ['vol1/a.txt'] }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.readUInt32LE(body.length - 22), 0x06054b50, 'the ZIP end record terminates the response');
  assert.match(body.toString('latin1'), /a\.txt/, 'the entry name is carried in the archive');
});

test('file migration persists permissions and hashed share capabilities', async () => {
  const queries = []; await MIGRATIONS.find(m => m.version === '018').up({ execute: async sql => queries.push(sql) });
  assert.equal(queries.length, 2); assert.match(queries[0], /can_read/); assert.match(queries[1], /code_hash/);
  assert.match(queries[1], /expires_at/); assert.match(queries[1], /revoked_at/);
  // User ids are UUIDs since migration 017, so the new reference columns must fit them.
  assert.match(queries[0], /user_id VARCHAR\(64\) NOT NULL PRIMARY KEY/);
  assert.match(queries[1], /owner_id VARCHAR\(64\) NOT NULL/);
});
