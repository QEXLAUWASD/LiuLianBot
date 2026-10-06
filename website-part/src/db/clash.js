const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { getPool } = require('./pool');
const { AppError } = require('../errors');
const { decryptProfile } = require('../services/remote_profile_crypto');
const { credentialKey } = require('../services/clash_sync');

const missing = () => new AppError('VPN server or user not found', 404, 'NOT_FOUND');
async function listServers() {
  const pool = await getPool();
  const [rows] = await pool.execute('SELECT * FROM website_clash_servers WHERE deleted_at IS NULL ORDER BY name');
  return rows.map(row => ({ id: row.id, name: row.name, enabled: Boolean(row.enabled),
    management_profile: row.management_profile, sync_status: row.sync_status,
    proxy_yaml: yaml.dump(JSON.parse(row.proxy_json), { noRefs: true }) }));
}
async function saveServer(id, data) {
  const pool = await getPool();
  if (id) {
    const [existing] = await pool.execute('SELECT * FROM website_clash_servers WHERE id=? AND deleted_at IS NULL', [id]);
    if (!existing.length) throw missing();
    const old = existing[0];
    if (old.management_profile && (old.management_profile !== data.management_profile ||
        ['type', 'cipher', 'password', 'port', 'flow'].some(key => JSON.parse(old.proxy_json)[key] !== JSON.parse(data.proxy_json)[key]))) {
      throw new AppError('Managed SSH profile, protocol, listener port and base server password are immutable; create a new node instead', 409);
    }
    const [result] = await pool.execute(`UPDATE website_clash_servers SET name=?, enabled=?, proxy_json=?,
      management_profile=?, sync_status=? WHERE id=? AND deleted_at IS NULL AND management_profile <=> ? AND proxy_json=?`,
      [data.name, data.enabled, data.proxy_json, data.management_profile, data.management_profile ? 'pending' : 'unmanaged', id, old.management_profile, old.proxy_json]);
    if (!result.affectedRows) throw new AppError('VPN server changed concurrently; reload and retry', 409);
    return id;
  }
  const [result] = await pool.execute('INSERT INTO website_clash_servers (name,enabled,proxy_json,management_profile,sync_status) VALUES (?,?,?,?,?)',
    [data.name, data.enabled, data.proxy_json, data.management_profile, data.management_profile ? 'pending' : 'unmanaged']);
  return result.insertId;
}
async function deleteServer(id) {
  const pool = await getPool();
  // Keep a tombstone so a failed SSH operation cannot lose the revocation target.
  const [result] = await pool.execute("UPDATE website_clash_servers SET enabled=0, deleted_at=UTC_TIMESTAMP(), sync_status=IF(management_profile IS NULL,'revoked','pending') WHERE id=? AND deleted_at IS NULL", [id]);
  if (!result.affectedRows) throw missing();
}
async function listSubscriptions() {
  const pool = await getPool();
  const [rows] = await pool.execute(`SELECT s.*, u.username, g.server_id FROM website_clash_subscriptions s
    JOIN website_clash_users u ON u.id=s.user_id LEFT JOIN website_clash_grants g ON g.user_id=s.user_id ORDER BY u.username`);
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.user_id)) grouped.set(row.user_id, { user_id: row.user_id, username: row.username,
      enabled: Boolean(row.enabled), expires_at: row.expires_at, path: `/clash-sub/${row.token}.yaml`, server_ids: [] });
    if (row.server_id !== null) grouped.get(row.user_id).server_ids.push(Number(row.server_id));
  }
  return [...grouped.values()];
}
async function saveSubscription(userId, data) {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (!userId) {
      userId = crypto.randomUUID();
      await conn.execute('INSERT INTO website_clash_users (id,username) VALUES (?,?)', [userId, data.username]);
    } else {
      const [users] = await conn.execute('SELECT id FROM website_clash_users WHERE id=? FOR UPDATE', [userId]);
      if (!users.length) throw missing();
      if (data.username !== undefined) await conn.execute('UPDATE website_clash_users SET username=? WHERE id=?', [data.username, userId]);
    }
    await conn.execute(`INSERT INTO website_clash_subscriptions (user_id,token,expires_at,enabled) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at), enabled=VALUES(enabled)`,
    [userId, crypto.randomBytes(32).toString('hex'), data.expires_at, data.enabled]);
    await conn.execute('DELETE FROM website_clash_grants WHERE user_id=?', [userId]);
    for (const serverId of data.server_ids) {
      await conn.execute('INSERT INTO website_clash_grants (user_id,server_id) VALUES (?,?)', [userId, serverId]);
    }
    await conn.commit();
    return userId;
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}
async function rotateToken(userId) {
  const pool = await getPool();
  const [result] = await pool.execute('UPDATE website_clash_subscriptions SET token=? WHERE user_id=?',
    [crypto.randomBytes(32).toString('hex'), userId]);
  if (!result.affectedRows) throw missing();
}
async function deleteSubscription(userId) {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Serialize with subscription creation/editing; retain account records for SSH revocation.
    const [users] = await conn.execute('SELECT id FROM website_clash_users WHERE id=? FOR UPDATE', [userId]);
    if (!users.length) throw missing();
    const [result] = await conn.execute('DELETE FROM website_clash_subscriptions WHERE user_id=?', [userId]);
    if (!result.affectedRows) throw missing();
    await conn.execute('DELETE FROM website_clash_users WHERE id=?', [userId]);
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}
async function getSubscription(token) {
  const pool = await getPool();
  // One statement gives an atomic view of expiry, grants and current node settings.
  const [rows] = await pool.execute(`SELECT s.expires_at, v.id, v.name, v.proxy_json, v.management_profile,
    v.sync_status, a.credential_encrypted, a.applied FROM website_clash_subscriptions s
    LEFT JOIN website_clash_grants g ON g.user_id=s.user_id
    LEFT JOIN website_clash_servers v ON v.id=g.server_id AND v.enabled=1 AND v.deleted_at IS NULL
    LEFT JOIN website_clash_accounts a ON a.server_id=v.id AND a.user_id=s.user_id
    WHERE s.token=? AND s.enabled=1 AND s.expires_at>UTC_TIMESTAMP() ORDER BY v.id`, [token]);
  if (!rows.length) return null;
  const servers = [];
  for (const row of rows) {
    if (row.id === null) continue;
    if (!row.management_profile) { servers.push(row); continue; }
    if (row.sync_status !== 'ready' || !row.applied) continue;
    const account = decryptProfile(row.credential_encrypted, credentialKey());
    servers.push({ ...row, proxy_json: account.proxy_json });
  }
  return { expires_at: rows[0].expires_at, servers };
}
async function listSyncStatus() {
  const pool = await getPool();
  const [servers] = await pool.execute(`SELECT id,name,management_profile,sync_status,synced_at,sync_error,
    deleted_at FROM website_clash_servers WHERE management_profile IS NOT NULL ORDER BY id`);
  return servers;
}
module.exports = { listServers, saveServer, deleteServer, listSubscriptions, saveSubscription, deleteSubscription, rotateToken, getSubscription, listSyncStatus };
