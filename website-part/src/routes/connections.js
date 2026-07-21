const express = require('express');
const { getAccessibleConnections } = require('../db');

const router = express.Router();

router.use((req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Please login first' });
  }
  return next();
});

router.get('/', async (req, res) => {
  try {
    const connections = await getAccessibleConnections(req.session.user.id);
    res.json({ connections });
  } catch (err) {
    console.error('[Connections] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch website connections' });
  }
});

module.exports = router;
