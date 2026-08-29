const express = require('express');
const { requireApiAuth } = require('../middleware/auth');
const { requirePageVisibility } = require('../middleware/page_visibility');
const {
  VlessTunnelInputError,
  VlessTunnelConfigError,
  generateMergedConfig,
} = require('../services/vless_tunnel');

const router = express.Router();
router.use(requireApiAuth, requirePageVisibility('vless-tunnel'));

router.post('/generate', (req, res, next) => {
  try {
    const result = generateMergedConfig(req.body || {});
    return res.json({
      id: result.id,
      format: result.format,
      config: result.config,
      interim: {
        name: result.name,
        url: result.url,
        internalTarget: result.internalTarget,
        generatedAt: result.generatedAt,
        expiresAt: result.expiresAt,
        expiresInSeconds: result.expiresInSeconds,
      },
    });
  } catch (err) {
    if (err instanceof VlessTunnelInputError || err instanceof VlessTunnelConfigError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return next(err);
  }
});

module.exports = router;
