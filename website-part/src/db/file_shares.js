const { getPool } = require('./pool');
function createRepository(pool = getPool) {
  return {
    async create(row) {
      await (await pool()).execute(`INSERT INTO website_file_shares
        (id, owner_id, code_hash, source_path, name, is_directory, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.owner_id, row.code_hash, row.source_path, row.name, row.is_directory ? 1 : 0, row.expires_at]);
    },
    async list(owner, all = false) {
      const [rows] = await (await pool()).execute(`SELECT id, name, is_directory, expires_at, created_at
        FROM website_file_shares WHERE (? = 1 OR owner_id = ?) AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
        ORDER BY created_at DESC`, [all ? 1 : 0, owner]);
      return rows;
    },
    async find(hash) {
      const [rows] = await (await pool()).execute(`SELECT id, source_path, name, is_directory, expires_at
        FROM website_file_shares WHERE code_hash = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`, [hash]);
      return rows[0] || null;
    },
    async revoke(owner, id, all = false) {
      const [result] = await (await pool()).execute(`UPDATE website_file_shares SET revoked_at = UTC_TIMESTAMP()
        WHERE (? = 1 OR owner_id = ?) AND id = ? AND revoked_at IS NULL`, [all ? 1 : 0, owner, id]);
      return result.affectedRows > 0;
    },
  };
}
module.exports = { createRepository };
