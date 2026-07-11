const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const {
  getAllUsers,
  updateUserRole,
  deleteUser,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getAllGuilds,
  getGuildDetail,
} = require('../db');

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

// PUT /api/admin/users/:id — update user role
router.put('/users/:id', async (req, res) => {
  try {
    const { role_id } = req.body;
    if (role_id !== null && (typeof role_id !== 'number' || role_id < 1)) {
      return res.status(400).json({ error: 'Invalid role_id' });
    }

    // Prevent self-demotion
    if (req.params.id === req.session.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await updateUserRole(req.params.id, role_id);
    res.json({ success: true, user });
  } catch (err) {
    console.error('[Admin] PUT /users/:id error:', err);
    const status = err.message === 'User not found' ? 404 : 500;
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
router.post('/groups', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    if (name.trim().length > 50) {
      return res.status(400).json({ error: 'Group name must be 50 characters or less' });
    }

    const role = await createRole(name.trim(), description || '');
    res.json({ success: true, group: role });
  } catch (err) {
    console.error('[Admin] POST /groups error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/groups/:id — update a role
router.put('/groups/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const role = await updateRole(id, name.trim(), description || '');
    res.json({ success: true, group: role });
  } catch (err) {
    console.error('[Admin] PUT /groups/:id error:', err);
    const status = err.message === 'Role not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/admin/groups/:id — delete a role
router.delete('/groups/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    await deleteRole(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] DELETE /groups/:id error:', err);
    const status = err.message === 'Role not found' ? 404
      : err.message.includes('still assigned') ? 409 : 500;
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
