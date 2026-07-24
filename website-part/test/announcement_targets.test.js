const test = require('node:test');
const assert = require('node:assert/strict');

test('announcement targets group text channels by Discord guild', () => {
  const { groupAnnouncementTargets } = require('../src/db/announcements');

  assert.deepEqual(groupAnnouncementTargets([
    { guild_id: '1', guild_name: 'Alpha', channel_id: '11', channel_name: 'general' },
    { guild_id: '1', guild_name: 'Alpha', channel_id: '12', channel_name: 'announcements' },
    { guild_id: '2', guild_name: 'Bravo', channel_id: '21', channel_name: 'chat' },
  ]), [
    {
      guild_id: '1', guild_name: 'Alpha', channels: [
        { channel_id: '11', channel_name: 'general' },
        { channel_id: '12', channel_name: 'announcements' },
      ],
    },
    { guild_id: '2', guild_name: 'Bravo', channels: [{ channel_id: '21', channel_name: 'chat' }] },
  ]);
});
