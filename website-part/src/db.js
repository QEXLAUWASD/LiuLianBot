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
const { ConflictError } = require('./errors');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'shared', 'database', 'config.json');
const DISCORD_CONFIG_PATH = path.join(__dirname, '..', '..', 'discord-part', 'config.json');

// ---------- input validation ----------

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
let poolInitialization = null;

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw);
  // Support both "mysql" and "mysql_config" keys
  return config.mysql || config.mysql_config || {};
}

async function getPool() {
  if (poolInitialization) return poolInitialization;
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

  const candidate = pool;
  poolInitialization = (async () => {
    const conn = await candidate.getConnection();
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

    // ---------- website_user_roles ----------
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS website_user_roles (
        user_id VARCHAR(30) NOT NULL,
        role_id INT NOT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, role_id),
        FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES website_roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Migrate the legacy one-role column, then cover users without a membership.
    await conn.execute(`
      INSERT IGNORE INTO website_user_roles (user_id, role_id)
      SELECT id, role_id FROM website_users WHERE role_id IS NOT NULL
    `);
    if (userRole.length > 0) {
      await conn.execute(
        `INSERT IGNORE INTO website_user_roles (user_id, role_id)
         SELECT u.id, ? FROM website_users u
         LEFT JOIN website_user_roles ur ON ur.user_id = u.id
         WHERE ur.user_id IS NULL`,
        [userRole[0].id]
      );
    }
    console.log('[DB] website_user_roles table ready.');

    // ---------- website_sessions ----------
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS website_sessions (
        sid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        data MEDIUMTEXT NOT NULL,
        expires_at BIGINT UNSIGNED NOT NULL,
        INDEX idx_website_sessions_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.execute(
      'DELETE FROM website_sessions WHERE expires_at <= ?',
      [Date.now()]
    );
    console.log('[DB] website_sessions table ready.');

    // ---------- website_connections ----------
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS website_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        slug VARCHAR(50) NOT NULL UNIQUE,
        target_url TEXT NOT NULL,
        description VARCHAR(255) DEFAULT '',
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        hidden TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    try {
      await conn.execute(
        'ALTER TABLE website_connections ADD COLUMN hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER enabled'
      );
      console.log('[DB] Added hidden column to website_connections.');
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS website_connection_roles (
        connection_id INT NOT NULL,
        role_id INT NOT NULL,
        PRIMARY KEY (connection_id, role_id),
        FOREIGN KEY (connection_id) REFERENCES website_connections(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES website_roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS website_connection_users (
        connection_id INT NOT NULL,
        user_id VARCHAR(30) NOT NULL,
        PRIMARY KEY (connection_id, user_id),
        FOREIGN KEY (connection_id) REFERENCES website_connections(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
      console.log('[DB] website connection tables ready.');
    } finally {
      conn.release();
    }
    return candidate;
  })();

  try {
    return await poolInitialization;
  } catch (err) {
    pool = null;
    await candidate.end().catch(() => {});
    throw err;
  } finally {
    poolInitialization = null;
  }
}

// ======================== User Auth ========================

async function findUserByUsername(username) {
  const safe = validateString(username, 'username');
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT u.id, u.username, u.password, u.role_id, u.created_at,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM website_user_roles aur
                JOIN website_roles ar ON ar.id = aur.role_id
                WHERE aur.user_id = u.id AND ar.name = 'admin'
              ) THEN 'admin'
              ELSE COALESCE((
                SELECT r.name
                FROM website_user_roles ur
                JOIN website_roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id
                ORDER BY r.id ASC LIMIT 1
              ), 'user')
            END AS role_name
     FROM website_users u
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
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [roleRows] = await conn.execute(
      'SELECT id FROM website_roles WHERE name = ?', ['user']
    );
    const defaultRoleId = roleRows.length > 0 ? roleRows[0].id : null;

    await conn.execute(
      'INSERT INTO website_users (id, username, password, role_id) VALUES (?, ?, ?, ?)',
      [safeId, safeUsername, hashedPassword, defaultRoleId]
    );
    if (defaultRoleId !== null) {
      await conn.execute(
        'INSERT INTO website_user_roles (user_id, role_id) VALUES (?, ?)',
        [safeId, defaultRoleId]
      );
    }
    await conn.commit();
    return {
      id: safeId,
      username: safeUsername,
      role_name: 'user',
      roles: defaultRoleId === null ? [] : [{ id: defaultRoleId, name: 'user' }],
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function findUserById(id) {
  const safe = validateString(id, 'id');
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT u.id, u.username, u.role_id, u.created_at,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM website_user_roles aur
                JOIN website_roles ar ON ar.id = aur.role_id
                WHERE aur.user_id = u.id AND ar.name = 'admin'
              ) THEN 'admin'
              ELSE COALESCE((
                SELECT r.name
                FROM website_user_roles ur
                JOIN website_roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id
                ORDER BY r.id ASC LIMIT 1
              ), 'user')
            END AS role_name
     FROM website_users u
     WHERE u.id = ?`,
    [safe]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function findUserCredentialsById(id) {
  const safe = validateString(id, 'id');
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT id, username, password
     FROM website_users
     WHERE id = ?`,
    [safe]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function updateUsername(userId, username) {
  const safeUserId = validateString(userId, 'user id');
  const safeUsername = validateString(username, 'username');
  const p = await getPool();
  const [result] = await p.execute(
    'UPDATE website_users SET username = ? WHERE id = ?',
    [safeUsername, safeUserId]
  );
  if (result.affectedRows === 0) throw new Error('User not found');
  return findUserById(safeUserId);
}

async function updatePasswordHash(userId, hashedPassword) {
  const safeUserId = validateString(userId, 'user id');
  if (typeof hashedPassword !== 'string' || hashedPassword.length === 0) {
    throw new Error('[DB] password hash: invalid');
  }
  const p = await getPool();
  const [result] = await p.execute(
    'UPDATE website_users SET password = ? WHERE id = ?',
    [hashedPassword, safeUserId]
  );
  if (result.affectedRows === 0) throw new Error('User not found');
}

// ======================== Role / Group Management ========================

async function getAllRoles() {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT r.*, COUNT(DISTINCT ur.user_id) AS user_count
     FROM website_roles r
     LEFT JOIN website_user_roles ur ON ur.role_id = r.id
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
  const [roles] = await p.execute(
    'SELECT name FROM website_roles WHERE id = ?',
    [safeId]
  );
  if (roles.length === 0) throw new Error('Role not found');
  if (roles[0].name === 'admin') {
    throw new ConflictError('The admin group cannot be renamed or deleted');
  }
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

  const [roles] = await p.execute(
    'SELECT name FROM website_roles WHERE id = ?',
    [safeId]
  );
  if (roles.length === 0) throw new Error('Role not found');
  if (roles[0].name === 'admin') {
    throw new ConflictError('The admin group cannot be renamed or deleted');
  }

  const [users] = await p.execute(
    'SELECT COUNT(*) AS cnt FROM website_user_roles WHERE role_id = ?',
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
  const [users] = await p.execute(
    `SELECT u.id, u.username, u.created_at
     FROM website_users u
     ORDER BY u.created_at DESC`
  );
  const [memberships] = await p.execute(
    `SELECT ur.user_id, r.id, r.name
     FROM website_user_roles ur
     JOIN website_roles r ON r.id = ur.role_id
     ORDER BY ur.user_id ASC, r.id ASC`
  );

  const rolesByUser = new Map();
  for (const { user_id: userId, id, name } of memberships) {
    if (!rolesByUser.has(userId)) rolesByUser.set(userId, []);
    rolesByUser.get(userId).push({ id, name });
  }

  return users.map(user => {
    const roles = rolesByUser.get(user.id) || [];
    const primaryRole = roles.find(role => role.name === 'admin') || roles[0] || null;
    return {
      ...user,
      role_id: primaryRole?.id || null,
      role_name: primaryRole?.name || null,
      role_ids: roles.map(role => role.id),
      roles,
    };
  });
}

async function updateUserRoles(userId, roleIds) {
  const safeUserId = validateString(userId, 'user id');
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    throw new Error('At least one group is required');
  }
  const safeRoleIds = [...new Set(roleIds.map(roleId => {
    const safeRoleId = validateInt(roleId, 'role id');
    if (safeRoleId < 1) {
      throw new Error('Group IDs must be positive integers');
    }
    return safeRoleId;
  }))];
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.execute(
      'SELECT id, username, created_at FROM website_users WHERE id = ? FOR UPDATE',
      [safeUserId]
    );
    if (users.length === 0) throw new Error('User not found');

    const placeholders = safeRoleIds.map(() => '?').join(', ');
    const [roles] = await conn.execute(
      `SELECT id, name FROM website_roles WHERE id IN (${placeholders})`,
      safeRoleIds
    );
    if (roles.length !== safeRoleIds.length) {
      throw new Error('One or more groups do not exist');
    }
    const roleById = new Map(roles.map(role => [Number(role.id), role]));
    const orderedRoles = safeRoleIds.map(roleId => roleById.get(roleId));
    const primaryRole = orderedRoles.find(role => role.name === 'admin')
      || orderedRoles[0];

    await conn.execute(
      'DELETE FROM website_user_roles WHERE user_id = ?',
      [safeUserId]
    );
    for (const roleId of safeRoleIds) {
      await conn.execute(
        'INSERT INTO website_user_roles (user_id, role_id) VALUES (?, ?)',
        [safeUserId, roleId]
      );
    }
    // Keep the legacy column synchronized during the migration period.
    await conn.execute(
      'UPDATE website_users SET role_id = ? WHERE id = ?',
      [primaryRole.id, safeUserId]
    );
    await conn.commit();

    return {
      ...users[0],
      role_id: primaryRole.id,
      role_name: primaryRole.name,
      role_ids: safeRoleIds,
      roles: orderedRoles,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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

// ======================== Website Connections ========================

async function getAllConnections() {
  const p = await getPool();
  const [connections] = await p.execute(
    `SELECT id, name, slug, target_url, description, enabled, hidden, created_at, updated_at
     FROM website_connections
     ORDER BY name ASC`
  );
  const [roles] = await p.execute(
    `SELECT cr.connection_id, r.id, r.name
     FROM website_connection_roles cr
     JOIN website_roles r ON r.id = cr.role_id
     ORDER BY r.name ASC`
  );
  const [users] = await p.execute(
    `SELECT cu.connection_id, u.id, u.username
     FROM website_connection_users cu
     JOIN website_users u ON u.id = cu.user_id
     ORDER BY u.username ASC`
  );

  return connections.map(connection => ({
    ...connection,
    enabled: Boolean(connection.enabled),
    hidden: Boolean(connection.hidden),
    roles: roles.filter(role => role.connection_id === connection.id)
      .map(({ id, name }) => ({ id, name })),
    users: users.filter(user => user.connection_id === connection.id)
      .map(({ id, username }) => ({ id, username })),
  }));
}

async function getAccessibleConnections(userId) {
  const safeUserId = validateString(userId, 'user id');
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT DISTINCT c.id, c.name, c.slug, c.description
     FROM website_connections c
     JOIN website_users wu ON wu.id = ?
     LEFT JOIN website_user_roles wur ON wur.user_id = wu.id
     LEFT JOIN website_roles wr ON wr.id = wur.role_id
     LEFT JOIN website_connection_roles cr
       ON cr.connection_id = c.id AND cr.role_id = wur.role_id
     LEFT JOIN website_connection_users cu
       ON cu.connection_id = c.id AND cu.user_id = wu.id
     WHERE c.enabled = 1
       AND c.hidden = 0
       AND (wr.name = 'admin' OR cr.role_id IS NOT NULL OR cu.user_id IS NOT NULL)
     ORDER BY c.name ASC`,
    [safeUserId]
  );
  return rows;
}

async function getConnectionAccessBySlug(slug, userId) {
  const safeSlug = validateString(slug, 'connection slug').toLowerCase();
  const safeUserId = validateString(userId, 'user id');
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT c.id, c.name, c.slug, c.target_url, c.description,
            u.id AS user_id, u.username,
            EXISTS(
              SELECT 1
              FROM website_user_roles aur
              JOIN website_roles ar ON ar.id = aur.role_id
              WHERE aur.user_id = u.id AND ar.name = 'admin'
            ) AS admin_access,
            EXISTS(
              SELECT 1 FROM website_connection_users cu
              WHERE cu.connection_id = c.id AND cu.user_id = u.id
            ) AS direct_access,
            EXISTS(
              SELECT 1
              FROM website_connection_roles cr
              JOIN website_user_roles ur ON ur.role_id = cr.role_id
              WHERE cr.connection_id = c.id AND ur.user_id = u.id
            ) AS role_access
     FROM website_connections c
     JOIN website_users u ON u.id = ?
     WHERE c.slug = ? AND c.enabled = 1`,
    [safeUserId, safeSlug]
  );

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    connection: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      target_url: row.target_url,
      description: row.description,
    },
    user: {
      id: row.user_id,
      username: row.username,
      role_name: Boolean(row.admin_access) ? 'admin' : 'user',
    },
    allowed: Boolean(row.admin_access) || Boolean(row.direct_access) || Boolean(row.role_access),
  };
}

async function replaceConnectionAccess(conn, connectionId, roleIds, userIds) {
  await conn.execute('DELETE FROM website_connection_roles WHERE connection_id = ?', [connectionId]);
  await conn.execute('DELETE FROM website_connection_users WHERE connection_id = ?', [connectionId]);

  for (const roleId of roleIds) {
    await conn.execute(
      'INSERT INTO website_connection_roles (connection_id, role_id) VALUES (?, ?)',
      [connectionId, roleId]
    );
  }
  for (const userId of userIds) {
    await conn.execute(
      'INSERT INTO website_connection_users (connection_id, user_id) VALUES (?, ?)',
      [connectionId, userId]
    );
  }
}

async function createConnection(data) {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO website_connections (name, slug, target_url, description, enabled, hidden)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.slug,
        data.target_url,
        data.description,
        data.enabled ? 1 : 0,
        data.hidden ? 1 : 0,
      ]
    );
    await replaceConnectionAccess(conn, result.insertId, data.role_ids, data.user_ids);
    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateConnection(id, data) {
  const safeId = validateInt(id, 'connection id');
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute(
      'SELECT id FROM website_connections WHERE id = ? FOR UPDATE', [safeId]
    );
    if (existing.length === 0) throw new Error('Connection not found');

    await conn.execute(
      `UPDATE website_connections
       SET name = ?, slug = ?, target_url = ?, description = ?, enabled = ?, hidden = ?
       WHERE id = ?`,
      [
        data.name,
        data.slug,
        data.target_url,
        data.description,
        data.enabled ? 1 : 0,
        data.hidden ? 1 : 0,
        safeId,
      ]
    );
    await replaceConnectionAccess(conn, safeId, data.role_ids, data.user_ids);
    await conn.commit();
    return safeId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteConnection(id) {
  const safeId = validateInt(id, 'connection id');
  const p = await getPool();
  const [result] = await p.execute('DELETE FROM website_connections WHERE id = ?', [safeId]);
  if (result.affectedRows === 0) throw new Error('Connection not found');
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
  findUserCredentialsById,
  createUser,
  updateUsername,
  updatePasswordHash,
  validateString,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getAllUsers,
  updateUserRoles,
  deleteUser,
  getAllConnections,
  getAccessibleConnections,
  getConnectionAccessBySlug,
  createConnection,
  updateConnection,
  deleteConnection,
  getAllGuilds,
  getGuildDetail,
};
