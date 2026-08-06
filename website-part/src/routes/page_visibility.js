const express = require('express');
const { getVisiblePageKeys } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json({ pages: await getVisiblePageKeys(req.session?.user?.id || null) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
