const { findUserById } = require('../db/users');
const { createRepository } = require('../db/file_permissions');
const { AppError } = require('../errors');
function createAccess({ permissions = createRepository(), findUser = findUserById, env = process.env } = {}) {
  return async function access(req) {
    if (!req.session?.user) throw new AppError('請先登入', 401);
    const user = await findUser(req.session.user.id);
    if (!user) throw new AppError('帳號不存在', 401);
    if (!env.FILES_OWNER_USER_ID) throw new AppError('檔案權限管理者尚未設定', 503);
    // Pin the existing LiuLian account ID, not an editable username or general admin role.
    const owner = String(user.id) === env.FILES_OWNER_USER_ID;
    const grant = owner ? null : await permissions.get(user.id);
    return { owner, userId: user.id, read: owner || Boolean(grant?.can_read),
      write: owner || Boolean(grant?.can_read && grant?.can_write),
      share: owner || Boolean(grant?.can_read && grant?.can_share), requested: Boolean(grant?.requested_at) };
  };
}
module.exports = { createAccess };
