class UserGroupInputError extends Error {}

function normalizeRoleIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new UserGroupInputError('At least one group is required');
  }

  const roleIds = [];
  const seen = new Set();
  for (const roleId of value) {
    if (!Number.isInteger(roleId) || roleId < 1) {
      throw new UserGroupInputError('Group IDs must be positive integers');
    }
    if (!seen.has(roleId)) {
      seen.add(roleId);
      roleIds.push(roleId);
    }
  }

  return roleIds;
}

module.exports = { UserGroupInputError, normalizeRoleIds };
