const { ConflictError } = require('../errors');
const { getPool, validateString, validateInt } = require('./pool');

async function getAllRoles() {
  const p = await getPool();
  const [rows] = await p.execute(
    `SELECT r.*, COUNT(DISTINCT ur.user_id) AS user_count
     FROM website_roles r
     LEFT JOIN website_user_roles ur ON ur.role_id = r.id
     GROUP BY r.id ORDER BY r.id ASC`
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

async function findMutableRole(p, id) {
  const [roles] = await p.execute('SELECT name FROM website_roles WHERE id = ?', [id]);
  if (roles.length === 0) throw new Error('Role not found');
  if (roles[0].name === 'admin') {
    throw new ConflictError('The admin group cannot be renamed or deleted');
  }
}

async function updateRole(id, name, description) {
  const safeId = validateInt(id, 'role id');
  const safeName = validateString(name, 'role name');
  const safeDesc = typeof description === 'string' ? description.trim() : '';
  const p = await getPool();
  await findMutableRole(p, safeId);
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
  await findMutableRole(p, safeId);
  const [users] = await p.execute(
    'SELECT COUNT(*) AS cnt FROM website_user_roles WHERE role_id = ?',
    [safeId]
  );
  if (users[0].cnt > 0) {
    throw new Error(`Cannot delete role: ${users[0].cnt} user(s) are still assigned`);
  }
  const [result] = await p.execute('DELETE FROM website_roles WHERE id = ?', [safeId]);
  if (result.affectedRows === 0) throw new Error('Role not found');
  return true;
}

module.exports = { getAllRoles, createRole, updateRole, deleteRole };
