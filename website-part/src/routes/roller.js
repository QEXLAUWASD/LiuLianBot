const express = require('express');
const router = express.Router();
const path = require('path');
const { createRollerData } = require('../services/roller_data');

const OPS_FILE = path.join(__dirname, '..', '..', '..', 'shared', 'r6', 'operatorlist.json');
const MAPS_FILE = path.join(__dirname, '..', '..', '..', 'shared', 'r6', 'maplist.json');

const rollerData = createRollerData({
  operatorPath: OPS_FILE,
  mapPath: MAPS_FILE,
});

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Roll a random operator
router.get('/operator', (req, res) => {
  try {
    const side = req.query.side || null; // "att", "def", or null for both
    const data = rollerData.operators();

    let bucketKeys = [];
    if (!side) {
      bucketKeys = ['Att', 'Def'];
    } else if (side.toLowerCase().startsWith('att')) {
      bucketKeys = ['Att'];
    } else if (side.toLowerCase().startsWith('def')) {
      bucketKeys = ['Def'];
    } else {
      bucketKeys = ['Att', 'Def'];
    }

    const candidates = [];
    for (const key of bucketKeys) {
      for (const [name, info] of Object.entries(data[key] || {})) {
        candidates.push({ name, info, side: key });
      }
    }

    if (candidates.length === 0) {
      return res.status(404).json({ error: 'No operators found' });
    }

    const picked = pickRandom(candidates);
    const weapon = picked.info.weapon || {};

    res.json({
      name: picked.name,
      icon: picked.info.icon || '',
      side: picked.side === 'Att' ? 'Attacker' : 'Defender',
      primary: pickRandom(weapon.primary || []),
      secondary: pickRandom(weapon.secondary || []),
      gadget: pickRandom(weapon.gadget || []),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to roll operator: ' + err.message });
  }
});

// Roll a random map
router.get('/map', (req, res) => {
  try {
    const data = rollerData.maps();
    const entries = [];

    for (const [key, info] of Object.entries(data)) {
      if (!info || typeof info !== 'object') continue;
      const name = info.name || key;
      if (!name) continue;
      const playlists = info.playlists || [];
      entries.push({ name, location: info.location || '', playlists });
    }

    if (entries.length === 0) {
      return res.status(404).json({ error: 'No maps found' });
    }

    const picked = pickRandom(entries);
    const playlist = picked.playlists.length > 0 ? pickRandom(picked.playlists) : 'N/A';
    const gameModes = ['Bomb', 'Secure Area', 'Hostage'];
    const gameMode = pickRandom(gameModes);

    res.json({
      name: picked.name,
      location: picked.location,
      playlist,
      gameMode,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to roll map: ' + err.message });
  }
});

// Get all operators (for display)
router.get('/operators', (req, res) => {
  try {
    const data = rollerData.operators();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load operators' });
  }
});

module.exports = router;
