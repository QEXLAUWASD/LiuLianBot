const express = require('express');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const { createStorage, relativePath, ARCHIVE_MAX_SELECTION } = require('../services/file_storage');
const { createRepository } = require('../db/file_shares');
const { createRepository: createPermissions } = require('../db/file_permissions');
const { findUserByUsername } = require('../db/users');
const { createAccess } = require('../services/file_access');
const { AppError, InputError } = require('../errors');
const hashCode = value => createHash('sha256').update(value).digest('hex');
function createRouter({ storage = createStorage(), repo = createRepository(), permissions = createPermissions(),
  access = createAccess({ permissions }), findUser = findUserByUsername } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(err => {
    if (res.headersSent) return res.destroy();
    next(err);
  });
  const limitOptions = { windowMs: 60000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: '請求過於頻繁，請稍後再試' } };
  router.use('/shared', rateLimit(limitOptions));
  async function shared(req) {
    const code = req.body?.code;
    if (typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) throw new AppError('分享碼無效或已過期', 404);
    const row = await repo.find(hashCode(code));
    if (!row) throw new AppError('分享碼無效或已過期', 404);
    const relative = relativePath(req.body?.path);
    if (!row.is_directory && relative) throw new AppError('無法存取此路徑', 403);
    return { row, relative, target: [row.source_path, relative].filter(Boolean).join('/') };
  }
  // Public read-only capability: codes stay in bodies, never access-log URLs.
  router.post('/shared/list', wrap(async (req, res) => {
    const { row, relative, target } = await shared(req);
    const entries = row.is_directory ? await storage.list(target) : [];
    res.json({ name: row.name, directory: Boolean(row.is_directory), path: relative, expiresAt: row.expires_at, entries });
  }));
  router.post('/shared/download', wrap(async (req, res) => {
    const { target } = await shared(req);
    await storage.download(target, res);
  }));
  // Packs selected entries of a shared folder into one ZIP. The selection comes
  // from repeated form fields, so the share page can download natively without
  // buffering the archive in the browser.
  router.post('/shared/archive', wrap(async (req, res) => {
    const { row } = await shared(req);
    if (!row.is_directory) throw new InputError('此分享是單一檔案，請直接下載');
    const submitted = req.body?.paths ?? [];
    const selections = Array.isArray(submitted) ? submitted : [submitted];
    if (!selections.length) throw new InputError('請選擇要打包的檔案或資料夾');
    if (selections.length > ARCHIVE_MAX_SELECTION) throw new InputError(`單次最多打包 ${ARCHIVE_MAX_SELECTION} 個項目`);
    await storage.archive(selections.map(value => relativePath(value)), res, { base: row.source_path });
  }));
  router.use((req, res, next) => {
    access(req).then(grant => { req.fileAccess = grant; next(); }, next);
  });
  router.use(rateLimit(limitOptions));
  router.get('/access', (req, res) => res.json(req.fileAccess));
  // All authenticated mutations require a non-simple header (cross-site forms cannot send it).
  router.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Files-Request') !== '1') return res.status(403).json({ error: '請從檔案管理頁面操作' });
    next();
  });
  router.post('/access/request', wrap(async (req, res) => {
    await permissions.request(req.fileAccess.userId);
    res.sendStatus(204);
  }));
  function requirePermission(key) {
    return (req, res, next) => req.fileAccess[key] ? next() : res.status(403).json({ error: '需要 LiuLian 授權' });
  }
  router.get('/permissions', requirePermission('owner'), wrap(async (req, res) => res.json({ users: await permissions.list() })));
  router.put('/permissions', requirePermission('owner'), wrap(async (req, res) => {
    const { username, read, write, share } = req.body || {};
    if (typeof username !== 'string' || !username.trim() || username.length > 20 ||
        [read, write, share].some(value => typeof value !== 'boolean') || (!read && (write || share))) throw new InputError('請提供帳號與有效的權限設定');
    const user = await findUser(username);
    if (!user) throw new AppError('找不到此網站帳號', 404);
    if (String(user.id) === String(req.fileAccess.userId)) throw new InputError('LiuLian 的完整權限無法在此變更');
    await permissions.set(user.id, { read, write, share });
    res.sendStatus(204);
  }));
  router.get('/list', requirePermission('read'), wrap(async (req, res) => {
    const path = relativePath(req.query.path);
    res.json({ path, entries: await storage.list(path) });
  }));
  router.get('/download', requirePermission('read'), wrap(async (req, res) => storage.download(relativePath(req.query.path), res)));
  // Packs the checked entries into one ZIP. The paths arrive in the body, so
  // the archive is built and streamed in a single response.
  router.post('/archive', requirePermission('read'), wrap(async (req, res) => {
    const paths = req.body?.paths;
    if (!Array.isArray(paths) || paths.length === 0) throw new InputError('請選擇要打包的檔案或資料夾');
    if (paths.length > ARCHIVE_MAX_SELECTION) throw new InputError(`單次最多打包 ${ARCHIVE_MAX_SELECTION} 個項目`);
    await storage.archive(paths.map(value => relativePath(value)), res, { name: req.body?.name });
  }));
  router.get('/shares', requirePermission('share'), wrap(async (req, res) => res.json({ shares: await repo.list(req.fileAccess.userId, req.fileAccess.owner) })));
  router.post('/shares', requirePermission('share'), wrap(async (req, res) => {
    const hours = req.body?.hours;
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new InputError('有效期限必須為 1 至 168 小時');
    const item = await storage.inspect(relativePath(req.body?.path));
    const code = randomBytes(16).toString('hex');
    const row = { id: randomUUID(), owner_id: req.fileAccess.userId, code_hash: hashCode(code), source_path: item.path,
      name: item.name, is_directory: item.directory, expires_at: new Date(Date.now() + hours * 3600000) };
    await repo.create(row);
    res.status(201).json({ id: row.id, code, name: row.name, expiresAt: row.expires_at });
  }));
  router.delete('/shares/:id', requirePermission('share'), wrap(async (req, res) => {
    if (!await repo.revoke(req.fileAccess.userId, req.params.id, req.fileAccess.owner)) throw new AppError('找不到分享項目', 404);
    res.sendStatus(204);
  }));
  router.post('/folder', requirePermission('write'), wrap(async (req, res) => {
    await storage.mkdir(relativePath(req.body?.path)); res.sendStatus(201);
  }));
  router.post('/rename', requirePermission('write'), wrap(async (req, res) => {
    await storage.rename(relativePath(req.body?.from), relativePath(req.body?.to)); res.sendStatus(204);
  }));
  router.delete('/entry', requirePermission('write'), wrap(async (req, res) => {
    await storage.remove(relativePath(req.body?.path)); res.sendStatus(204);
  }));
  router.put('/upload', requirePermission('write'), wrap(async (req, res) => {
    if (!req.is('application/octet-stream')) throw new InputError('請使用檔案上傳格式');
    const length = Number(req.get('Content-Length'));
    if (length > 1024 ** 3) throw new AppError('單次上傳上限為 1 GiB', 413);
    await storage.upload(relativePath(req.query.path), req); res.sendStatus(201);
  }));
  return router;
}
module.exports = { createRouter, hashCode };
