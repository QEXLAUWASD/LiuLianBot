const express = require('express');
const { requireAdmin } = require('../middleware/admin_auth');
const {
  getAllConnections,
  createConnection,
  updateConnection,
  deleteConnection,
} = require('../db');
const {
  ConnectionInputError,
  normalizeConnectionInput,
} = require('../services/connection_validation');

const router = express.Router();
router.use(requireAdmin);

function parseConnectionId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new ConnectionInputError('Invalid connection ID');
  }
  return id;
}

function sendConnectionError(res, err) {
  if (err instanceof ConnectionInputError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'This slug is already in use' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'A selected user or group no longer exists' });
  }
  if (err.message === 'Connection not found') {
    return res.status(404).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Website connection operation failed' });
}

router.get('/', async (req, res) => {
  try {
    const connections = await getAllConnections();
    res.json({ connections });
  } catch (err) {
    console.error('[AdminConnections] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch website connections' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = normalizeConnectionInput(req.body);
    const id = await createConnection(data);
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('[AdminConnections] POST / error:', err);
    sendConnectionError(res, err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseConnectionId(req.params.id);
    const data = normalizeConnectionInput(req.body);
    await updateConnection(id, data);
    res.json({ success: true });
  } catch (err) {
    console.error('[AdminConnections] PUT /:id error:', err);
    sendConnectionError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseConnectionId(req.params.id);
    await deleteConnection(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[AdminConnections] DELETE /:id error:', err);
    sendConnectionError(res, err);
  }
});

module.exports = router;
