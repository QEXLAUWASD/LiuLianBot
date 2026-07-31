const express = require('express');
const { requireRemoteAccess } = require('../middleware/remote_auth');
const { getRemoteProfile, saveRemoteProfile, deleteRemoteProfile } = require('../db');
const { encryptionKey, encryptProfile, decryptProfile } = require('../services/remote_profile_crypto');
const { normalizeRemoteProfile } = require('../services/remote_profile_validation');
const { RemoteInputError } = require('../services/remote_validation');
const { remoteFeatures } = require('../services/remote_features');

const router = express.Router();
router.use(requireRemoteAccess);

function serverStorageAvailable() {
  return Boolean(encryptionKey());
}

router.get('/', async (req, res, next) => {
  try {
    const features = remoteFeatures();
    if (!serverStorageAvailable()) return res.json({ serverStorageAvailable: false, features, profile: null });
    const encrypted = await getRemoteProfile(req.session.user.id);
    const storedProfile = encrypted ? decryptProfile(encrypted) : null;
    const profile = storedProfile && {
      ssh: features.ssh ? storedProfile.ssh : null,
      rdp: features.rdp ? storedProfile.rdp : null,
    };
    return res.json({ serverStorageAvailable: true, features, profile });
  } catch (err) {
    return next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    if (!serverStorageAvailable()) return res.status(503).json({ error: 'Server credential storage is not configured' });
    const profile = normalizeRemoteProfile(req.body);
    const features = remoteFeatures();
    if (profile.ssh && !features.ssh) return res.status(403).json({ error: 'SSH is disabled' });
    if (profile.rdp && !features.rdp) return res.status(403).json({ error: 'RDP is disabled' });
    await saveRemoteProfile(req.session.user.id, encryptProfile(profile));
    return res.status(204).end();
  } catch (err) {
    if (err instanceof RemoteInputError) return res.status(err.statusCode).json({ error: err.message });
    return next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    await deleteRemoteProfile(req.session.user.id);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

router.serverStorageAvailable = serverStorageAvailable;
module.exports = router;
