const express = require('express');
const { randomUUID } = require('node:crypto');
const repository = require('../db/rdp_profiles');
const { encryptionKey, encryptProfile, decryptProfile } = require('../services/remote_profile_crypto');
const { normalizeRdpInput, normalizeWebRdpInput, RemoteInputError } = require('../services/remote_validation');
const { remoteFeatures } = require('../services/remote_features');

function normalizeProfile(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100 || /[\x00-\x1f]/.test(name)) throw new RemoteInputError('Profile name is required (up to 100 characters)');
  const connection = body.password === undefined || body.password === ''
    ? normalizeRdpInput(body) : normalizeWebRdpInput(body);
  return { name, ...connection };
}
// Mounted behind requireRemoteAccess in routes/rdp.js.
function createRouter(repo = repository) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session?.user?.id) return res.status(401).json({ error: 'Login required' });
    if (!remoteFeatures().rdp) return res.status(403).json({ error: 'RDP is disabled' });
    next();
  });
  router.get('/', async (req, res, next) => {
    try {
      const available = Boolean(encryptionKey());
      res.json({ available, profiles: available ? await repo.list(req.session.user.id) : [] });
    } catch (error) { next(error); }
  });
  router.use((req, res, next) => {
    if (!encryptionKey()) return res.status(503).json({ error: 'Set REMOTE_CREDENTIAL_ENCRYPTION_KEY to enable encrypted profile storage' });
    next();
  });
  const handler = fn => async (req, res, next) => {
    try { await fn(req, res); }
    catch (error) {
      if (error instanceof RemoteInputError) return res.status(400).json({ error: error.message });
      next(error);
    }
  };
  router.param('id', (req, res, next, id) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: 'Profile not found' });
    next();
  });
  router.get('/:id', handler(async (req, res) => {
    const row = await repo.get(req.session.user.id, req.params.id);
    if (!row) return res.status(404).json({ error: 'Profile not found' });
    res.json({ profile: { ...decryptProfile(row.encrypted_data), id: row.id, name: row.name } });
  }));
  router.post('/', handler(async (req, res) => {
    const profile = normalizeProfile(req.body);
    const id = randomUUID();
    await repo.create(req.session.user.id, id, profile.name, encryptProfile(profile));
    res.status(201).json({ id, name: profile.name });
  }));
  router.put('/:id', handler(async (req, res) => {
    const profile = normalizeProfile(req.body);
    const existing = await repo.get(req.session.user.id, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Profile not found' });
    if (profile.password === undefined) {
      const stored = decryptProfile(existing.encrypted_data);
      if (stored.password) profile.password = stored.password;
    }
    const updated = await repo.update(req.session.user.id, req.params.id, profile.name, encryptProfile(profile));
    if (!updated) return res.status(404).json({ error: 'Profile not found' });
    res.status(204).end();
  }));
  router.delete('/:id', handler(async (req, res) => {
    if (!await repo.remove(req.session.user.id, req.params.id)) return res.status(404).json({ error: 'Profile not found' });
    res.status(204).end();
  }));
  return router;
}
module.exports = { createRouter, normalizeProfile };
