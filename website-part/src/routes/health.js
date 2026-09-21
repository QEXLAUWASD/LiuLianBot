const express = require('express');

// Lightweight liveness/readiness probe. It verifies the process can reach the
// shared MySQL pool without leaking configuration details or requiring a session.
function createRouter({ getPool } = {}) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const pool = await getPool();
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}

module.exports = { createRouter };
