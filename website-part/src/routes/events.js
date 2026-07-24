const express = require('express');
const { createEvent, joinEvent, leaveEvent, listEvents, getEventParticipants } = require('../db');
const { requireApiAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin_auth');
const { normalizeEventInput } = require('../services/event_validation');

const router = express.Router();
router.use(requireApiAuth);

function eventError(res, err) {
  const message = err?.message || 'Unable to process event';
  const status = message === 'Event not found' ? 404
    : message === 'Event is full' || message === 'Event is not open' ? 409 : 400;
  return res.status(status).json({ error: message });
}

router.get('/', async (req, res, next) => {
  try {
    const events = await listEvents({ guildId: req.query.guildId, userId: req.session.user.id });
    res.json({ events });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    normalizeEventInput(req.body);
    const user = req.adminUser;
    if (!user?.discord_user_id) {
      return res.status(409).json({ error: 'Connect Discord before creating an event' });
    }
    const event = await createEvent(req.session.user.id, req.body);
    res.status(201).json({ event });
  } catch (err) { eventError(res, err); }
});

router.get('/:id/participants', async (req, res) => {
  try {
    const participants = await getEventParticipants(req.params.id);
    res.json({ participants });
  } catch (err) { eventError(res, err); }
});

router.post('/:id/join', async (req, res) => {
  try { res.json(await joinEvent(req.params.id, req.session.user.id)); }
  catch (err) { eventError(res, err); }
});

router.post('/:id/leave', async (req, res) => {
  try { res.json(await leaveEvent(req.params.id, req.session.user.id)); }
  catch (err) { eventError(res, err); }
});

module.exports = router;
