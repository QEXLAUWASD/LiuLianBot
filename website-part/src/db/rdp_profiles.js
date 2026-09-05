const { getPool } = require('./pool');
function createRepository(pool = getPool) {
  return {
    async list(userId) {
      const [rows] = await (await pool()).execute('SELECT id, name FROM website_rdp_profiles WHERE user_id = ? ORDER BY name, id', [userId]);
      return rows;
    },
    async get(userId, id) {
      const [rows] = await (await pool()).execute('SELECT id, name, encrypted_data FROM website_rdp_profiles WHERE user_id = ? AND id = ?', [userId, id]);
      return rows[0] || null;
    },
    async create(userId, id, name, encrypted) {
      await (await pool()).execute('INSERT INTO website_rdp_profiles (user_id, id, name, encrypted_data) VALUES (?, ?, ?, ?)', [userId, id, name, encrypted]);
    },
    async update(userId, id, name, encrypted) {
      const [result] = await (await pool()).execute('UPDATE website_rdp_profiles SET name = ?, encrypted_data = ? WHERE user_id = ? AND id = ?', [name, encrypted, userId, id]);
      return result.affectedRows > 0;
    },
    async remove(userId, id) {
      const [result] = await (await pool()).execute('DELETE FROM website_rdp_profiles WHERE user_id = ? AND id = ?', [userId, id]);
      return result.affectedRows > 0;
    },
  };
}
module.exports = { ...createRepository(), createRepository };
