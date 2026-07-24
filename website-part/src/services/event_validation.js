const { validateInt, validateString } = require('../db/pool');

function validateSnowflake(value, label) {
  const text = String(value ?? '').trim();
  if (!/^\d{15,20}$/.test(text)) throw new Error(`${label} must be a Discord ID`);
  return text;
}

function normalizeEventInput(input = {}) {
  const title = validateString(input.title, 'event title');
  if (title.length > 100) throw new Error('Event title is too long');
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > 500) throw new Error('Event description is too long');
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    throw new Error('Event start time must be in the future');
  }
  const maxPlayers = validateInt(input.maxPlayers ?? 10, 'max players');
  if (maxPlayers < 2 || maxPlayers > 99) throw new Error('Max players must be between 2 and 99');
  return {
    guildId: validateSnowflake(input.guildId, 'Guild ID'),
    channelId: input.channelId == null || input.channelId === '' ? null : validateSnowflake(input.channelId, 'Channel ID'),
    title,
    description,
    mode: typeof input.mode === 'string' && input.mode.trim() ? input.mode.trim().slice(0, 30) : 'Custom match',
    startAt: start.toISOString().slice(0, 19).replace('T', ' '),
    maxPlayers,
  };
}

module.exports = { normalizeEventInput, validateSnowflake };
