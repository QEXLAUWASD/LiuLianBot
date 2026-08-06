const { getPool, validateString } = require('./pool');
const { PAGE_DEFINITIONS, pageDefinition } = require('../services/page_visibility');

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row[key])) grouped.set(row[key], []);
    grouped.get(row[key]).push(row);
  }
  return grouped;
}

async function getAllPageVisibility() {
  const p = await getPool();
  const [[pages], [roles], [users]] = await Promise.all([
    p.execute(
      `SELECT page_key, public_access, authenticated_access
       FROM website_page_visibility ORDER BY page_key ASC`
    ),
    p.execute(
      `SELECT pr.page_key, r.id, r.name
       FROM website_page_visibility_roles pr
       JOIN website_roles r ON r.id = pr.role_id
       ORDER BY r.name ASC`
    ),
    p.execute(
      `SELECT pu.page_key, u.id, u.username
       FROM website_page_visibility_users pu
       JOIN website_users u ON u.id = pu.user_id
       ORDER BY u.username ASC`
    ),
  ]);

  const pageRows = new Map(pages.map(page => [page.page_key, page]));
  const rolesByPage = groupBy(roles, 'page_key');
  const usersByPage = groupBy(users, 'page_key');
  return PAGE_DEFINITIONS.map(definition => {
    const page = pageRows.get(definition.key) || {};
    const pageRoles = rolesByPage.get(definition.key) || [];
    const pageUsers = usersByPage.get(definition.key) || [];
    return {
      ...definition,
      public_access: Boolean(page.public_access),
      authenticated_access: Boolean(page.authenticated_access),
      role_ids: pageRoles.map(role => Number(role.id)),
      roles: pageRoles.map(({ id, name }) => ({ id, name })),
      user_ids: pageUsers.map(user => user.id),
      users: pageUsers.map(({ id, username }) => ({ id, username })),
    };
  });
}

async function getVisiblePageKeys(userId = null) {
  const pages = await getAllPageVisibility();
  if (!userId) {
    return Object.fromEntries(pages.map(page => [page.key, page.public_access]));
  }

  const safeUserId = validateString(userId, 'user id');
  const p = await getPool();
  const [roleRows] = await p.execute(
    `SELECT r.name
     FROM website_user_roles ur
     JOIN website_roles r ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
    [safeUserId]
  );
  const roleNames = new Set(roleRows.map(row => row.name));
  if (roleNames.has('admin')) {
    return Object.fromEntries(pages.map(page => [page.key, true]));
  }

  const [roleIds] = await p.execute(
    `SELECT role_id FROM website_user_roles WHERE user_id = ?`,
    [safeUserId]
  );
  const userRoleIds = new Set(roleIds.map(row => Number(row.role_id)));
  return Object.fromEntries(pages.map(page => [
    page.key,
    page.authenticated_access
      || page.user_ids.includes(safeUserId)
      || page.role_ids.some(roleId => userRoleIds.has(roleId)),
  ]));
}

async function updatePageVisibility(pageKey, data) {
  const page = pageDefinition(pageKey);
  if (!page) throw new Error('Unknown website page');
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO website_page_visibility (page_key, public_access, authenticated_access)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE public_access = VALUES(public_access),
       authenticated_access = VALUES(authenticated_access)`,
      [page.key, data.public_access ? 1 : 0, data.authenticated_access ? 1 : 0]
    );
    await conn.execute('DELETE FROM website_page_visibility_roles WHERE page_key = ?', [page.key]);
    await conn.execute('DELETE FROM website_page_visibility_users WHERE page_key = ?', [page.key]);

    if (data.role_ids.length > 0) {
      const values = data.role_ids.flatMap(roleId => [page.key, roleId]);
      await conn.execute(
        `INSERT INTO website_page_visibility_roles (page_key, role_id)
         VALUES ${data.role_ids.map(() => '(?, ?)').join(', ')}`,
        values
      );
    }
    if (data.user_ids.length > 0) {
      const values = data.user_ids.flatMap(userId => [page.key, userId]);
      await conn.execute(
        `INSERT INTO website_page_visibility_users (page_key, user_id)
         VALUES ${data.user_ids.map(() => '(?, ?)').join(', ')}`,
        values
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  getAllPageVisibility,
  getVisiblePageKeys,
  updatePageVisibility,
};
