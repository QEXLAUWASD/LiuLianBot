const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/admin_auth');
const {
  getAllUsers,
  updateUserRoles,
  deleteUser,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getAllGuilds,
  getGuildDetail,
} = require('../db');
const {
  UserGroupInputError,
  normalizeRoleIds,
} = require('../services/user_group_validation');
const { InputError, ConflictError } = require('../errors');
const { normalizeGroupInput } = require('../services/group_validation');

function groupErrorStatus(err) {
  if (err instanceof InputError) return 400;
  if (err instanceof ConflictError || err.code === 'ER_DUP_ENTRY') return 409;
  if (err.message === 'Role not found') return 404;
  if (err.message.includes('still assigned')) return 409;
  return 500;
}

// All routes require admin
router.use(requireAdmin);

// ======================== Users ========================

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('[Admin] GET /users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:id — replace user group memberships
router.put('/users/:id', async (req, res) => {
  try {
    const roleIds = normalizeRoleIds(req.body?.role_ids);

    // Administrators may add their own groups but cannot remove admin access.
    if (req.params.id === req.session.user.id) {
      const roles = await getAllRoles();
      const adminRole = roles.find(role => role.name === 'admin');
      if (!adminRole || !roleIds.includes(Number(adminRole.id))) {
        return res.status(400).json({ error: 'Cannot remove your own admin group' });
      }
    }

    const user = await updateUserRoles(req.params.id, roleIds);
    res.json({ success: true, user });
  } catch (err) {
    const status = err instanceof UserGroupInputError
      || err.message === 'One or more groups do not exist'
      || err.message === 'At least one group is required'
      ? 400
      : err.message === 'User not found' ? 404 : 500;
    if (status === 500) console.error('[Admin] PUT /users/:id error:', err);
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id — delete a user
router.delete('/users/:id', async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.session.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await deleteUser(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] DELETE /users/:id error:', err);
    const status = err.message === 'User not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ======================== Groups / Roles ========================

// GET /api/admin/groups — list all roles
router.get('/groups', async (req, res) => {
  try {
    const roles = await getAllRoles();
    res.json({ groups: roles });
  } catch (err) {
    console.error('[Admin] GET /groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// POST /api/admin/groups — create a new role
router.post('/groups', async (req, res, next) => {
  try {
    const { name, description } = normalizeGroupInput(req.body);
    const role = await createRole(name, description);
    res.json({ success: true, group: role });
  } catch (err) {
    const status = groupErrorStatus(err);
    if (status === 500) return next(err);
    res.status(status).json({ error: err.message });
  }
});

// PUT /api/admin/groups/:id — update a role
router.put('/groups/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const { name, description } = normalizeGroupInput(req.body);
    const role = await updateRole(id, name, description);
    res.json({ success: true, group: role });
  } catch (err) {
    const status = groupErrorStatus(err);
    if (status === 500) return next(err);
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/admin/groups/:id — delete a role
router.delete('/groups/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    await deleteRole(id);
    res.json({ success: true });
  } catch (err) {
    const status = groupErrorStatus(err);
    if (status === 500) return next(err);
    res.status(status).json({ error: err.message });
  }
});

// ======================== Guilds (read-only) ========================

// GET /api/admin/guilds — list all guilds
router.get('/guilds', async (req, res) => {
  try {
    const guilds = await getAllGuilds();
    res.json({ guilds });
  } catch (err) {
    console.error('[Admin] GET /guilds error:', err);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// GET /api/admin/guilds/:id — guild detail
router.get('/guilds/:id', async (req, res) => {
  try {
    const guild = await getGuildDetail(req.params.id);
    res.json({ guild });
  } catch (err) {
    console.error('[Admin] GET /guilds/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch guild details' });
  }
});

module.exports = router;
