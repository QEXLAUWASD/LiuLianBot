const { getPool } = require('./pool');
function createRepository(pool = getPool) {
  return {
    async get(userId) {
      const [rows] = await (await pool()).execute('SELECT can_read, can_write, can_share, requested_at FROM website_file_permissions WHERE user_id = ?', [userId]);
      return rows[0] || null;
    },
    async request(userId) {
      await (await pool()).execute(`INSERT INTO website_file_permissions (user_id, requested_at) VALUES (?, UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE requested_at = UTC_TIMESTAMP()`, [userId]);
    },
    async list() {
      const [rows] = await (await pool()).execute(`SELECT p.user_id, u.username, p.can_read, p.can_write, p.can_share, p.requested_at
        FROM website_file_permissions p JOIN website_users u ON u.id = p.user_id ORDER BY u.username`);
      return rows;
    },
    async set(userId, permissions) {
      await (await pool()).execute(`INSERT INTO website_file_permissions (user_id, can_read, can_write, can_share)
        VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE can_read = VALUES(can_read), can_write = VALUES(can_write), can_share = VALUES(can_share), requested_at = NULL`,
      [userId, permissions.read ? 1 : 0, permissions.write ? 1 : 0, permissions.share ? 1 : 0]);
    },
  };
}
module.exports = { createRepository };
