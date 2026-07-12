/**
 * Shared MySQL database module for website-part.
 * Reads connection settings from shared/database/config.json.
 *
 * All queries use parameterized statements (mysql2 .execute with ? placeholders).
 * Input values are validated before reaching the database.
 */
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'shared', 'database', 'config.json');
const DISCORD_CONFIG_PATH = path.join(__dirname, '..', 'discord-part', 'config.json');

// ---------- input validation ----------

/** Characters / patterns that must never appear in query parameters */
const FORBIDDEN_IN_INPUT = /['";\\]/;

/** Maximum length for string-type parameters */
const MAX_STRING_LEN = 255;

/**
 * Validate and sanitize a string value intended for a database query.
 * Throws if the value is clearly malicious; returns trimmed string otherwise.
 */
function validateString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`[DB] ${label}: expected string, got ${typeof value}`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`[DB] ${label}: cannot be empty`);
  }
  if (trimmed.length > MAX_STRING_LEN) {
    throw new Error(`[DB] ${label}: exceeds max length (${MAX_STRING_LEN})`);
  }
  if (FORBIDDEN_IN_INPUT.test(trimmed)) {
    throw new Error(`[DB] ${label}: contains forbidden characters`);
  }
  return trimmed;
}

/**
 * Validate an integer (or numeric string) value.
 */
function validateInt(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`[DB] ${label}: expected non-negative integer, got ${value}`);
  }
  return num;
}

let pool = null;

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw);
  // Support both "mysql" and "mysql_config" keys
  return config.mysql || config.mysql_config || {};
}

async function getPool() {
  if (pool) return pool;

  const cfg = loadConfig();
  pool = mysql.createPool({
    host: cfg.host || 'localhost',
    port: cfg.port || 3306,
    user: cfg.user || 'root',
    password: cfg.password || '',
    database: cfg.database || 'discordbot',
    charset: cfg.charset || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  const conn = await pool.getConnection();
  try {
    // ---------- website_roles ----------
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS website_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[DB] website_roles table ready.');

    await conn.execute(`
      INSERT IGNORE INTO website_roles (name, description) VALUES
        ('admin', 'Administrator with full access to admin panel'),
        ('user',  'Regular user with basic access')
    `);

    // ---------- website_users ----------
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS website_users (
        id VARCHAR(30) PRIMARY KEY,
        username VARCHAR(20) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role_id INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES website_roles(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[DB] website_users table ready.');

    // Upgrade older schema: add role_id if missing
    try {
      await conn.execute(
        'ALTER TABLE website_users ADD COLUMN role_id INT DEFAULT NULL'
      );
      console.log('[DB] Added role_id column to website_users.');
    } catch (_) { /* column already exists */ }

    // Assign default 'user' role to users without one
    const [userRole] = await conn.execute(
      'SELECT id FROM website_roles WHERE name = ?', ['user']
    );
    if (userRole.length > 0) {
      await conn.execute(
        'UPDATE website_users SET role_id = ? WHERE role_id IS NULL',
        [userRole[0].id]
      );
    }
  } finally {
    conn.release();
  }

  return pool;
}

// ======================== User Auth ========================

async function findUserByUsername(username) {
  const safe = validateString(username, 'username');
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT u.id, u.username, u.password, u.role_id, u.created_at,
            r.name AS role_name
     FROM website_users u
     LEFT JOIN website_roles r ON u.role_id = r.id
     WHERE LOWER(u.username) = LOWER(?)`,
    [safe]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function createUser(id, username, hashedPassword) {
  const safeId = validateString(id, 'id');
  const safeUsername = validateString(username, 'username');
  if (typeof hashedPassword !== 'string' || hashedPassword.length === 0) {
    throw new Error('[DB] password hash: invalid');
  }
  const p = await getPool();

  const [roleRows] = await p.execute(
    'SELECT id FROM website_roles WHERE name = ?', ['user']
  );
  const defaultRoleId = roleRows.length > 0 ? roleRows[0].id : null;

  await p.execute(
    'INSERT INTO website_users (id, username, password, role_id) VALUES (?, ?, ?, ?)',
    [safeId, safeUsername, hashedPassword, defaultRoleId]
  );
  return { id: safeId, username: safeUsername, role_name: 'user' };
}

async function findUserById(id) {
  const safe = validateString(id, 'id');
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT u.id, u.username, u.role_id, u.created_at,
            r.name AS role_name
     FROM website_users u
     LEFT JOIN website_roles r ON u.role_id = r.id
     WHERE u.id = ?`,
    [safe]
  );
  return rows.length > 0 ? rows[0] : null;
}

// ======================== Role / Group Management ========================

async function getAllRoles() {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT r.*, COUNT(u.id) AS user_count
     FROM website_roles r
     LEFT JOIN website_users u ON u.role_id = r.id
     GROUP BY r.id
     ORDER BY r.id ASC`
  );
  return rows;
}

async function createRole(name, description) {
  const safeName = validateString(name, 'role name');
  const safeDesc = typeof description === 'string' ? description.trim() : '';
  const p = await getPool();
  const [result] = await p.execute(
    'INSERT INTO website_roles (name, description) VALUES (?, ?)',
    [safeName, safeDesc]
  );
  return { id: result.insertId, name: safeName, description: safeDesc };
}

async function updateRole(id, name, description) {
  const safeId = validateInt(id, 'role id');
  const safeName = validateString(name, 'role name');
  const safeDesc = typeof description === 'string' ? description.trim() : '';
  const p = await getPool();
  const [result] = await p.execute(
    'UPDATE website_roles SET name = ?, description = ? WHERE id = ?',
    [safeName, safeDesc, safeId]
  );
  if (result.affectedRows === 0) throw new Error('Role not found');
  return { id: safeId, name: safeName, description: safeDesc };
}

async function deleteRole(id) {
  const safeId = validateInt(id, 'role id');
  const p = await getPool();

  const [users] = await p.execute(
    'SELECT COUNT(*) AS cnt FROM website_users WHERE role_id = ?',
    [safeId]
  );
  if (users[0].cnt > 0) {
    throw new Error(`Cannot delete role: ${users[0].cnt} user(s) are still assigned`);
  }

  const [result] = await p.execute(
    'DELETE FROM website_roles WHERE id = ?', [safeId]
  );
  if (result.affectedRows === 0) throw new Error('Role not found');
  return true;
}

// ======================== User Management (Admin) ========================

async function getAllUsers() {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT u.id, u.username, u.role_id, u.created_at,
            r.name AS role_name
     FROM website_users u
     LEFT JOIN website_roles r ON u.role_id = r.id
     ORDER BY u.created_at DESC`
  );
  return rows;
}

async function updateUserRole(userId, roleId) {
  const safeUserId = validateString(userId, 'user id');
  const safeRoleId = roleId === null ? null : validateInt(roleId, 'role id');
  const p = await getPool();
  const [result] = await p.execute(
    'UPDATE website_users SET role_id = ? WHERE id = ?',
    [safeRoleId, safeUserId]
  );
  if (result.affectedRows === 0) throw new Error('User not found');
  return findUserById(safeUserId);
}

async function deleteUser(userId) {
  const safeUserId = validateString(userId, 'user id');
  const p = await getPool();
  const [result] = await p.execute(
    'DELETE FROM website_users WHERE id = ?', [safeUserId]
  );
  if (result.affectedRows === 0) throw new Error('User not found');
  return true;
}

// ======================== Guild Queries (read-only) ========================

async function getAllGuilds() {
  const p = await getPool();

  const [logChannels] = await p.execute(
    'SELECT guild_id, channel_id FROM guild_log_channels'
  );
  const [rollerChannels] = await p.execute(
    'SELECT guild_id, channel_id, dm_result FROM guild_roller_channels'
  );
  const [voiceChannels] = await p.execute(
    'SELECT guild_id, COUNT(*) AS voice_count FROM private_voice_channels GROUP BY guild_id'
  );

  let guildLanguages = {};
  let guildAdmins = {};
  try {
    const raw = fs.readFileSync(DISCORD_CONFIG_PATH, 'utf-8');
    const discordConfig = JSON.parse(raw);
    guildLanguages = discordConfig.guild_languages || {};
    guildAdmins = discordConfig.guild_admins || {};
  } catch (_) { /* config.json may not exist */ }

  const guildMap = new Map();

  const ensure = (gid) => {
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
    const g = ensure(String(row.guild_id));
    g.log_channel_id = String(row.channel_id);
  }
  for (const row of rollerChannels) {
    const g = ensure(String(row.guild_id));
    g.roller_channel_id = String(row.channel_id);
    g.roller_dm_result = row.dm_result;
  }
  for (const row of voiceChannels) {
    const g = ensure(String(row.guild_id));
    g.voice_channel_count = row.voice_count;
  }
  for (const gid of Object.keys(guildLanguages)) ensure(gid);
  for (const gid of Object.keys(guildAdmins)) ensure(gid);

  return Array.from(guildMap.values());
}

async function getGuildDetail(guildId) {
  const safeId = validateString(guildId, 'guild id');
  const p = await getPool();

  const [logChannel] = await p.execute(
    'SELECT channel_id FROM guild_log_channels WHERE guild_id = ?', [safeId]
  );
  const [rollerChannel] = await p.execute(
    'SELECT channel_id, dm_result FROM guild_roller_channels WHERE guild_id = ?', [safeId]
  );
  const [voiceList] = await p.execute(
    'SELECT channel_id, owner_id, config_json, created_at FROM private_voice_channels WHERE guild_id = ?',
    [safeId]
  );

  let language = 'en';
  let admins = [];
  try {
    const raw = fs.readFileSync(DISCORD_CONFIG_PATH, 'utf-8');
    const discordConfig = JSON.parse(raw);
    language = (discordConfig.guild_languages || {})[safeId] || 'en';
    admins = (discordConfig.guild_admins || {})[safeId] || [];
  } catch (_) {}

  return {
    guild_id: safeId,
    language,
    admin_ids: admins,
    log_channel_id: logChannel.length > 0 ? String(logChannel[0].channel_id) : null,
    roller_channel_id: rollerChannel.length > 0 ? String(rollerChannel[0].channel_id) : null,
    roller_dm_result: rollerChannel.length > 0 ? rollerChannel[0].dm_result : 1,
    voice_channels: voiceList.map(v => ({
      channel_id: String(v.channel_id),
      owner_id: String(v.owner_id),
      config_json: v.config_json,
      created_at: v.created_at,
    })),
  };
}

module.exports = {
  getPool,
  findUserByUsername,
  findUserById,
  createUser,
  validateString,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getAllUsers,
  updateUserRole,
  deleteUser,
  getAllGuilds,
  getGuildDetail,
};
