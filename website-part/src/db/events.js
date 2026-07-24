const { getPool, validateInt, validateString } = require('./pool');
const { normalizeEventInput, validateSnowflake } = require('../services/event_validation');

async function listEvents({ guildId, userId, includeHidden = false } = {}) {
  const p = await getPool();
  const params = [];
  const filters = [
    ...(includeHidden ? [] : ['e.visible = 1']),
    'e.status = \'open\'', 'e.start_at >= UTC_TIMESTAMP()'
  ];
  if (guildId != null) { filters.push('e.guild_id = ?'); params.push(validateSnowflake(guildId, 'Guild ID')); }
  const [rows] = await p.execute(
    `SELECT e.*, gm.guild_name, u.username AS creator_username,
            COUNT(ep.user_id) AS participant_count,
            MAX(ep.user_id = ?) AS joined
     FROM website_events e
     JOIN website_users u ON u.id = e.created_by
     LEFT JOIN discord_guild_metadata gm ON gm.guild_id = e.guild_id
     LEFT JOIN website_event_participants ep ON ep.event_id = e.id
     WHERE ${filters.join(' AND ')}
     GROUP BY e.id ORDER BY e.start_at ASC`,
    [userId || '', ...params]
  );
  return rows;
}

async function listAdminEvents() {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT e.id, e.title, e.guild_id, gm.guild_name, e.start_at, e.status, e.visible,
            COUNT(ep.user_id) AS participant_count, u.username AS creator_username
     FROM website_events e JOIN website_users u ON u.id = e.created_by
     LEFT JOIN discord_guild_metadata gm ON gm.guild_id = e.guild_id
     LEFT JOIN website_event_participants ep ON ep.event_id = e.id
     GROUP BY e.id ORDER BY e.start_at DESC`
  );
  return rows;
}

async function updateEventVisibility(eventId, visible) {
  const p = await getPool();
  const [result] = await p.execute(
    'UPDATE website_events SET visible = ? WHERE id = ?', [visible ? 1 : 0, validateInt(eventId, 'event id')]
  );
  if (result.affectedRows === 0) throw new Error('Event not found');
  return true;
}

async function createEvent(userId, input) {
  const data = normalizeEventInput(input);
  const p = await getPool();
  const [result] = await p.execute(
    `INSERT INTO website_events
      (created_by, guild_id, channel_id, title, description, mode, start_at, max_players)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [validateString(userId, 'user id'), data.guildId, data.channelId, data.title,
      data.description, data.mode, data.startAt, data.maxPlayers]
  );
  return { id: result.insertId, ...data, status: 'open', participant_count: 0, joined: 0 };
}

async function joinEvent(eventId, userId) {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [events] = await conn.execute(
      'SELECT id, max_players, status FROM website_events WHERE id = ? FOR UPDATE',
      [validateInt(eventId, 'event id')]
    );
    if (events.length === 0) throw new Error('Event not found');
    if (events[0].status !== 'open') throw new Error('Event is not open');
    const [existing] = await conn.execute(
      'SELECT event_id FROM website_event_participants WHERE event_id = ? AND user_id = ?',
      [eventId, userId]
    );
    if (existing.length > 0) { await conn.commit(); return { joined: true, alreadyJoined: true }; }
    const [[count]] = await conn.execute(
      'SELECT COUNT(*) AS total FROM website_event_participants WHERE event_id = ?', [eventId]
    );
    if (Number(count.total) >= Number(events[0].max_players)) throw new Error('Event is full');
    await conn.execute(
      'INSERT INTO website_event_participants (event_id, user_id) VALUES (?, ?)', [eventId, userId]
    );
    await conn.commit();
    return { joined: true, alreadyJoined: false };
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
}

async function leaveEvent(eventId, userId) {
  const p = await getPool();
  const [result] = await p.execute(
    'DELETE FROM website_event_participants WHERE event_id = ? AND user_id = ?', [eventId, userId]
  );
  return { left: result.affectedRows > 0 };
}

async function getEventParticipants(eventId) {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT u.id, u.username, u.discord_user_id
     FROM website_event_participants ep JOIN website_users u ON u.id = ep.user_id
     WHERE ep.event_id = ? ORDER BY ep.joined_at ASC`, [eventId]
  );
  return rows;
}

module.exports = { normalizeEventInput, listEvents, listAdminEvents, updateEventVisibility, createEvent, joinEvent, leaveEvent, getEventParticipants };
