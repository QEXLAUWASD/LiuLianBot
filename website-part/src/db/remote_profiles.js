const { getPool, validateString } = require('./pool');

async function getRemoteProfile(userId) {
  const p = await getPool();
  const [rows] = await p.execute('SELECT encrypted_data FROM website_remote_profiles WHERE user_id = ?', [validateString(userId, 'user id')]);
  return rows[0]?.encrypted_data || null;
}

async function saveRemoteProfile(userId, encryptedData) {
  const p = await getPool();
  await p.execute(
    `INSERT INTO website_remote_profiles (user_id, encrypted_data) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE encrypted_data = VALUES(encrypted_data), updated_at = CURRENT_TIMESTAMP`,
    [validateString(userId, 'user id'), encryptedData]
  );
}

async function deleteRemoteProfile(userId) {
  const p = await getPool();
  await p.execute('DELETE FROM website_remote_profiles WHERE user_id = ?', [validateString(userId, 'user id')]);
}

module.exports = { getRemoteProfile, saveRemoteProfile, deleteRemoteProfile };
