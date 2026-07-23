const { getPool, validateString, validateInt } = require('./pool');

async function findUserByUsername(username) {
  const safe = validateString(username, 'username');
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT u.id, u.username, u.password, u.role_id, u.created_at,
            CASE
              WHEN EXISTS (
                SELECT 1 FROM website_user_roles aur
                JOIN website_roles ar ON ar.id = aur.role_id
                WHERE aur.user_id = u.id AND ar.name = 'admin'
              ) THEN 'admin'
              ELSE COALESCE((
                SELECT r.name FROM website_user_roles ur
                JOIN website_roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id ORDER BY r.id ASC LIMIT 1
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
      'SELECT id FROM website_roles WHERE name = ?',
      ['user']
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
                SELECT 1 FROM website_user_roles aur
                JOIN website_roles ar ON ar.id = aur.role_id
                WHERE aur.user_id = u.id AND ar.name = 'admin'
              ) THEN 'admin'
              ELSE COALESCE((
                SELECT r.name FROM website_user_roles ur
                JOIN website_roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id ORDER BY r.id ASC LIMIT 1
              ), 'user')
            END AS role_name
     FROM website_users u WHERE u.id = ?`,
    [safe]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function findUserCredentialsById(id) {
  const safe = validateString(id, 'id');
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT id, username, password FROM website_users WHERE id = ?',
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

async function getAllUsers() {
  const p = await getPool();
  const [users] = await p.execute(
    'SELECT u.id, u.username, u.created_at FROM website_users u ORDER BY u.created_at DESC'
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
    if (safeRoleId < 1) throw new Error('Group IDs must be positive integers');
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
    const primaryRole = orderedRoles.find(role => role.name === 'admin') || orderedRoles[0];
    await conn.execute('DELETE FROM website_user_roles WHERE user_id = ?', [safeUserId]);
    for (const roleId of safeRoleIds) {
      await conn.execute(
        'INSERT INTO website_user_roles (user_id, role_id) VALUES (?, ?)',
        [safeUserId, roleId]
      );
    }
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
  const [result] = await p.execute('DELETE FROM website_users WHERE id = ?', [safeUserId]);
  if (result.affectedRows === 0) throw new Error('User not found');
  return true;
}

module.exports = {
  findUserByUsername,
  findUserById,
  findUserCredentialsById,
  createUser,
  updateUsername,
  updatePasswordHash,
  getAllUsers,
  updateUserRoles,
  deleteUser,
};
