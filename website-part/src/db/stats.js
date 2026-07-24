const { getPool } = require('./pool');

async function getGuildStats() {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT guild_id, SUM(command_count) AS command_count,
            SUM(voice_joins) AS voice_joins, MAX(day) AS last_day
     FROM guild_activity_stats
     WHERE day >= UTC_DATE() - INTERVAL 30 DAY
     GROUP BY guild_id ORDER BY command_count DESC`
  );
  return rows;
}

module.exports = { getGuildStats };
