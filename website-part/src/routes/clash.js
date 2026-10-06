const express = require('express');
const { requireAdmin } = require('../middleware/admin_auth');
const repository = require('../db/clash');
const { InputError } = require('../errors');
const { AppError } = require('../errors');
const { readProfiles } = require('../services/clash_ssh');
const { positiveId, normalizeServer, normalizeSubscription, renderConfig } = require('../services/clash_config');

function createRouters({ db = repository, adminAuth = requireAdmin, syncWorker } = {}) {
  const admin = express.Router();
  const subscription = express.Router();
  admin.use(adminAuth);
  admin.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const handle = fn => async (req, res, next) => {
    try { await fn(req, res); } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Server name is already in use' });
      if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Selected VPN server no longer exists' });
      next(err);
    }
  };
  const userId = req => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(req.params.userId)) throw new InputError('Invalid user ID');
    return req.params.userId;
  };
  admin.get('/servers', handle(async (req, res) => res.json({ servers: await db.listServers() })));
  admin.get('/profiles', handle(async (req, res) => {
    try { res.json({ profiles: Object.keys(readProfiles()).filter(name => /^[a-zA-Z0-9_-]{1,64}$/.test(name)) }); }
    catch { throw new AppError('Failed to read SSH profile configuration'); }
  }));
  admin.post('/servers', handle(async (req, res) => res.status(201).json({ id: await db.saveServer(null, normalizeServer(req.body)) })));
  admin.put('/servers/:id', handle(async (req, res) => res.json({ id: await db.saveServer(positiveId(req.params.id), normalizeServer(req.body)) })));
  admin.delete('/servers/:id', handle(async (req, res) => { await db.deleteServer(positiveId(req.params.id)); res.json({ success: true }); }));
  admin.get('/subscriptions', handle(async (req, res) => res.json({ subscriptions: await db.listSubscriptions() })));
  admin.get('/sync-status', handle(async (req, res) => res.json({ servers: await db.listSyncStatus() })));
  admin.post('/sync', handle(async (req, res) => {
    if (!syncWorker) return res.status(503).json({ error: 'SSH sync worker is unavailable' });
    syncWorker.runOnce().catch(() => console.error('[ClashSync] Manual synchronization failed'));
    res.status(202).json({ success: true });
  }));
  admin.put('/subscriptions/:userId', handle(async (req, res) => {
    await db.saveSubscription(userId(req), normalizeSubscription(req.body)); res.json({ success: true });
  }));
  admin.delete('/subscriptions/:userId', handle(async (req, res) => { await db.deleteSubscription(userId(req)); res.json({ success: true }); }));
  admin.post('/subscriptions/:userId/rotate', handle(async (req, res) => { await db.rotateToken(userId(req)); res.json({ success: true }); }));
  subscription.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }); next();
  });
  subscription.get('/:token.yaml', handle(async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(404).end();
    const data = await db.getSubscription(req.params.token);
    if (!data) return res.status(404).end();
    if (!data.servers.length) return res.status(403).send('No VPN servers are available');
    res.set('subscription-userinfo', `expire=${Math.floor(new Date(data.expires_at).getTime() / 1000)}`);
    res.set('Content-Disposition', 'attachment; filename="clash.yaml"');
    res.type('application/yaml').send(renderConfig(data.servers));
  }));
  subscription.use((req, res) => res.status(404).end());
  return { admin, subscription };
}
module.exports = { createRouters };
