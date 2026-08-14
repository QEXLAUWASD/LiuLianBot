const express = require('express');
const { requireApiAuth } = require('../middleware/auth');
const { createHyperbeamSession, HyperbeamApiError } = require('../services/hyperbeam');

function createChromiumRouter({ createSession = createHyperbeamSession } = {}) {
  const router = express.Router();
  router.use(requireApiAuth);

  router.post('/session', async (req, res) => {
    try {
      const session = await createSession({ startUrl: req.body?.start_url });
      return res.status(201).json(session);
    } catch (error) {
      if (error instanceof HyperbeamApiError) return res.status(error.statusCode).json({ error: error.message });
      console.error('[Chromium] Hyperbeam session creation failed:', error);
      return res.status(502).json({ error: 'Hyperbeam session creation failed' });
    }
  });

  return router;
}

const router = createChromiumRouter();
router.createChromiumRouter = createChromiumRouter;
module.exports = router;
