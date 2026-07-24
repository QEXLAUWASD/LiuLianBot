const { getPool } = require('./pool');
const { validateSnowflake } = require('../services/event_validation');

async function listAnnouncements() {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT a.*, u.username AS creator_username FROM website_announcements a
     JOIN website_users u ON u.id = a.created_by ORDER BY a.scheduled_at DESC LIMIT 100`
  );
  return rows;
}

async function createAnnouncement(userId, input) {
  const content = String(input.content || '').trim();
  if (!content || content.length > 2000) throw new Error('Announcement content must be 1-2000 characters');
  const scheduled = new Date(input.scheduledAt);
  if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now()) throw new Error('Schedule must be in the future');
  const p = await getPool();
  const [result] = await p.execute(
    `INSERT INTO website_announcements (created_by, guild_id, channel_id, content, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, validateSnowflake(input.guildId, 'Guild ID'), validateSnowflake(input.channelId, 'Channel ID'), content,
      scheduled.toISOString().slice(0, 19).replace('T', ' ')]
  );
  return { id: result.insertId };
}

async function cancelAnnouncement(id) {
  const p = await getPool();
  const [result] = await p.execute(
    "UPDATE website_announcements SET status='cancelled' WHERE id=? AND status='scheduled'", [id]
  );
  if (!result.affectedRows) throw new Error('Announcement not found or already closed');
}

module.exports = { listAnnouncements, createAnnouncement, cancelAnnouncement };
