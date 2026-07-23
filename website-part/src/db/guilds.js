const path = require('path');
const fs = require('fs');
const { getPool, validateString } = require('./pool');

const DISCORD_CONFIG_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'discord-part',
  'config.json'
);

function loadDiscordConfig() {
  try {
    return JSON.parse(fs.readFileSync(DISCORD_CONFIG_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

async function getAllGuilds() {
  const p = await getPool();
  const [[logChannels], [rollerChannels], [voiceChannels]] = await Promise.all([
    p.execute('SELECT guild_id, channel_id FROM guild_log_channels'),
    p.execute('SELECT guild_id, channel_id, dm_result FROM guild_roller_channels'),
    p.execute(
      'SELECT guild_id, COUNT(*) AS voice_count FROM private_voice_channels GROUP BY guild_id'
    ),
  ]);
  const discordConfig = loadDiscordConfig();
  const guildLanguages = discordConfig.guild_languages || {};
  const guildAdmins = discordConfig.guild_admins || {};
  const guildMap = new Map();
  const ensure = gid => {
    if (!guildMap.has(gid)) {
      guildMap.set(gid, {
        guild_id: gid,
        language: guildLanguages[gid] || 'en',
        admin_count: (guildAdmins[gid] || []).length,
        log_channel_id: null,
        roller_channel_id: null,
        roller_dm_result: 1,
        voice_channel_count: 0,
      });
    }
    return guildMap.get(gid);
  };
  for (const row of logChannels) {
    ensure(String(row.guild_id)).log_channel_id = String(row.channel_id);
  }
  for (const row of rollerChannels) {
    const guild = ensure(String(row.guild_id));
    guild.roller_channel_id = String(row.channel_id);
    guild.roller_dm_result = row.dm_result;
  }
  for (const row of voiceChannels) {
    ensure(String(row.guild_id)).voice_channel_count = row.voice_count;
  }
  for (const guildId of Object.keys(guildLanguages)) ensure(guildId);
  for (const guildId of Object.keys(guildAdmins)) ensure(guildId);
  return Array.from(guildMap.values());
}

async function getGuildDetail(guildId) {
  const safeId = validateString(guildId, 'guild id');
  const p = await getPool();
  const [[logChannel], [rollerChannel], [voiceList]] = await Promise.all([
    p.execute(
      'SELECT channel_id FROM guild_log_channels WHERE guild_id = ?',
      [safeId]
    ),
    p.execute(
      'SELECT channel_id, dm_result FROM guild_roller_channels WHERE guild_id = ?',
      [safeId]
    ),
    p.execute(
      'SELECT channel_id, owner_id, config_json, created_at FROM private_voice_channels WHERE guild_id = ?',
      [safeId]
    ),
  ]);
  const discordConfig = loadDiscordConfig();
  const language = (discordConfig.guild_languages || {})[safeId] || 'en';
  const admins = (discordConfig.guild_admins || {})[safeId] || [];
  return {
    guild_id: safeId,
    language,
    admin_ids: admins,
    log_channel_id: logChannel.length > 0 ? String(logChannel[0].channel_id) : null,
    roller_channel_id: rollerChannel.length > 0 ? String(rollerChannel[0].channel_id) : null,
    roller_dm_result: rollerChannel.length > 0 ? rollerChannel[0].dm_result : 1,
    voice_channels: voiceList.map(voice => ({
      channel_id: String(voice.channel_id),
      owner_id: String(voice.owner_id),
      config_json: voice.config_json,
      created_at: voice.created_at,
    })),
  };
}

module.exports = { getAllGuilds, getGuildDetail };
