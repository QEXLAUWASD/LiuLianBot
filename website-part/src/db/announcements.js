const { getPool } = require('./pool');
const { validateSnowflake } = require('../services/event_validation');

function groupAnnouncementTargets(rows) {
  const guilds = new Map();
  for (const row of rows) {
    const guildId = String(row.guild_id);
    if (!guilds.has(guildId)) {
      guilds.set(guildId, { guild_id: guildId, guild_name: row.guild_name, channels: [] });
    }
    guilds.get(guildId).channels.push({
      channel_id: String(row.channel_id), channel_name: row.channel_name,
    });
  }
  return Array.from(guilds.values());
}

async function listAnnouncementTargets() {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT c.guild_id, gm.guild_name, c.channel_id, c.channel_name
     FROM discord_guild_channels c
     JOIN discord_guild_metadata gm ON gm.guild_id = c.guild_id
     ORDER BY gm.guild_name, c.channel_name, c.channel_id`
  );
  return groupAnnouncementTargets(rows);
}

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
  const guildId = validateSnowflake(input.guildId, 'Guild ID');
  const channelId = validateSnowflake(input.channelId, 'Channel ID');
  const [channels] = await p.execute(
    'SELECT 1 FROM discord_guild_channels WHERE guild_id=? AND channel_id=?', [guildId, channelId]
  );
  if (channels.length === 0) throw new Error('Channel does not belong to the selected Discord server');
  const [result] = await p.execute(
    `INSERT INTO website_announcements (created_by, guild_id, channel_id, content, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, guildId, channelId, content,
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

module.exports = { groupAnnouncementTargets, listAnnouncementTargets, listAnnouncements, createAnnouncement, cancelAnnouncement };
