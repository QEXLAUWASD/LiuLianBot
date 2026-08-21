const fs = require('fs');
const path = require('path');
const { getPool, validateString } = require('./pool');

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'discord-part', 'config.json');
const LOG_TYPES = ['all', 'useraction', 'voiceaction', 'groupaction', 'messageaction', 'channelaction', 'roleaction'];
const LANGUAGES = ['en', 'zh_TW'];

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (_) { return {}; }
}

function canManage(config, discordUserId, guild) {
  const userId = String(discordUserId || '');
  return userId && (
    String(guild.owner_id || '') === userId ||
    (config.guild_admins?.[String(guild.guild_id)] || []).map(String).includes(userId) ||
    (config.bot_admin || []).map(String).includes(userId) ||
    (config.bot_owner || []).map(String).includes(userId)
  );
}

async function listManagedGuilds(discordUserId) {
  const p = await getPool();
  const [guilds] = await p.execute('SELECT guild_id, guild_name, owner_id FROM discord_guild_metadata ORDER BY guild_name');
  const config = loadConfig();
  return guilds.filter(guild => canManage(config, discordUserId, guild)).map(guild => ({
    guild_id: String(guild.guild_id), guild_name: guild.guild_name,
  }));
}

async function getManagedGuild(discordUserId, guildId) {
  const safeGuildId = validateString(String(guildId), 'guild id');
  const p = await getPool();
  const [[guilds], [channels], [logChannels]] = await Promise.all([
    p.execute('SELECT guild_id, guild_name, owner_id FROM discord_guild_metadata WHERE guild_id = ?', [safeGuildId]),
    p.execute('SELECT channel_id, channel_name FROM discord_guild_channels WHERE guild_id = ? ORDER BY channel_name', [safeGuildId]),
    p.execute('SELECT log_type, channel_id FROM guild_log_channel_settings WHERE guild_id = ?', [safeGuildId]),
  ]);
  const guild = guilds[0];
  if (!guild || !canManage(loadConfig(), discordUserId, guild)) return null;
  const config = loadConfig();
  const logChannelsByType = Object.fromEntries(logChannels.map(row => [row.log_type, String(row.channel_id)]));
  const [fallbackRows] = await p.execute('SELECT channel_id FROM guild_log_channels WHERE guild_id = ?', [safeGuildId]);
  return {
    guild_id: safeGuildId, guild_name: guild.guild_name,
    language: config.guild_languages?.[safeGuildId] || 'en',
    log_channels: logChannelsByType, fallback_log_channel_id: fallbackRows[0] ? String(fallbackRows[0].channel_id) : null,
    channels: channels.map(row => ({ channel_id: String(row.channel_id), channel_name: row.channel_name })),
  };
}

async function updateManagedGuild(discordUserId, guildId, input) {
  const detail = await getManagedGuild(discordUserId, guildId);
  if (!detail) return null;
  const language = input?.language;
  const logChannels = input?.log_channels;
  if (!LANGUAGES.includes(language) || !logChannels || typeof logChannels !== 'object') throw new Error('Invalid guild settings');
  const validChannels = new Set(detail.channels.map(channel => channel.channel_id));
  const updates = Object.entries(logChannels);
  if (updates.some(([type, channelId]) => !LOG_TYPES.includes(type) || !validChannels.has(String(channelId)))) throw new Error('Every log channel must belong to this Discord server');
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM guild_log_channel_settings WHERE guild_id = ?', [detail.guild_id]);
    for (const [type, channelId] of updates) {
      await conn.execute('INSERT INTO guild_log_channel_settings (guild_id, log_type, channel_id) VALUES (?, ?, ?)', [detail.guild_id, type, String(channelId)]);
    }
    if (logChannels.all) {
      await conn.execute('INSERT INTO guild_log_channels (guild_id, channel_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id)', [detail.guild_id, String(logChannels.all)]);
    }
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
  const config = loadConfig();
  config.guild_languages = config.guild_languages || {};
  config.guild_languages[detail.guild_id] = language;
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return getManagedGuild(discordUserId, detail.guild_id);
}

module.exports = { listManagedGuilds, getManagedGuild, updateManagedGuild, LOG_TYPES, LANGUAGES };
