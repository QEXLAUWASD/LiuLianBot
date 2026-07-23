const { getPool, validateString, validateInt } = require('./pool');

async function getAllConnections() {
  const p = await getPool();
  const [connections] = await p.execute(
    `SELECT id, name, slug, target_url, description, enabled, hidden, created_at, updated_at
     FROM website_connections ORDER BY name ASC`
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
     WHERE c.enabled = 1 AND c.hidden = 0
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
              SELECT 1 FROM website_user_roles aur
              JOIN website_roles ar ON ar.id = aur.role_id
              WHERE aur.user_id = u.id AND ar.name = 'admin'
            ) AS admin_access,
            EXISTS(
              SELECT 1 FROM website_connection_users cu
              WHERE cu.connection_id = c.id AND cu.user_id = u.id
            ) AS direct_access,
            EXISTS(
              SELECT 1 FROM website_connection_roles cr
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
  await conn.execute(
    'DELETE FROM website_connection_roles WHERE connection_id = ?',
    [connectionId]
  );
  await conn.execute(
    'DELETE FROM website_connection_users WHERE connection_id = ?',
    [connectionId]
  );
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
      'SELECT id FROM website_connections WHERE id = ? FOR UPDATE',
      [safeId]
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
  const [result] = await p.execute(
    'DELETE FROM website_connections WHERE id = ?',
    [safeId]
  );
  if (result.affectedRows === 0) throw new Error('Connection not found');
  return true;
}

module.exports = {
  getAllConnections,
  getAccessibleConnections,
  getConnectionAccessBySlug,
  createConnection,
  updateConnection,
  deleteConnection,
};
