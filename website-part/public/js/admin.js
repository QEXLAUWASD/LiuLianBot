// ======================== Admin Panel Logic ========================

let allUsers = [];
let allGroups = [];
let allGuilds = [];
let currentEditUserId = null;

// ---------- Helpers ----------

function showToast(message, type) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

// ---------- Confirm Dialog ----------

let confirmCallback = null;

function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = message;
  confirmCallback = callback;
  document.getElementById('confirmDialog').style.display = 'flex';
}

function closeConfirm() {
  confirmCallback = null;
  document.getElementById('confirmDialog').style.display = 'none';
}

document.getElementById('confirmOkBtn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

// ---------- Tab Switching ----------

document.addEventListener('DOMContentLoaded', () => {
  const tabBtns = document.querySelectorAll('.admin-tabs .tab-btn');
  const adminTabs = document.querySelectorAll('.admin-tab');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      adminTabs.forEach(t => t.classList.toggle('active', t.id === tab + 'Tab'));

      if (tab === 'users') loadUsers();
      else if (tab === 'groups') loadGroups();
      else if (tab === 'guilds') loadGuilds();
    });
  });

  // Load users on initial page load
  loadUsers();
});

// ======================== Users ========================

async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users');
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    allUsers = data.users || [];
    renderUsers();
  } catch (err) {
    console.error('loadUsers error:', err);
    renderUsersError();
  }
}

function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (allUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No users found</p></td></tr>';
    return;
  }

  tbody.innerHTML = allUsers.map(u => {
    const roleBadge = u.role_name === 'admin'
      ? '<span class="badge badge-admin">admin</span>'
      : `<span class="badge badge-user">${escapeHTML(u.role_name || 'user')}</span>`;

    const created = u.created_at ? new Date(u.created_at).toLocaleDateString('zh-TW') : '-';

    return `
      <tr>
        <td><strong>${escapeHTML(u.username)}</strong></td>
        <td>${roleBadge}</td>
        <td>${created}</td>
        <td class="actions">
          <button class="btn btn-sm btn-outline" onclick="openUserEdit('${escapeHTML(u.id)}')">Edit Role</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteUser('${escapeHTML(u.id)}', '${escapeHTML(u.username)}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderUsersError() {
  document.getElementById('usersTableBody').innerHTML =
    '<tr><td colspan="4" class="empty-state"><p style="color:var(--error);">Failed to load users</p></td></tr>';
}

// --- User Edit Modal ---

function openUserEdit(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  currentEditUserId = userId;
  document.getElementById('editUserUsername').value = user.username;
  document.getElementById('userEditError').textContent = '';

  // Populate role dropdown
  const select = document.getElementById('editUserRole');
  select.innerHTML = allGroups.length > 0
    ? allGroups.map(g => `<option value="${g.id}" ${g.name === user.role_name ? 'selected' : ''}>${escapeHTML(g.name)}</option>`).join('')
    : `<option value="">Loading...</option>`;

  // Also load groups if not yet loaded
  if (allGroups.length === 0) {
    fetch('/api/admin/groups').then(r => r.json()).then(d => {
      allGroups = d.groups || [];
      select.innerHTML = allGroups.map(g =>
        `<option value="${g.id}" ${g.name === user.role_name ? 'selected' : ''}>${escapeHTML(g.name)}</option>`
      ).join('');
    }).catch(() => {});
  }

  openModal('userEditModal');
}

document.getElementById('saveUserRoleBtn').addEventListener('click', async () => {
  const roleId = parseInt(document.getElementById('editUserRole').value, 10);
  const errorEl = document.getElementById('userEditError');
  errorEl.textContent = '';

  if (!currentEditUserId || isNaN(roleId)) {
    errorEl.textContent = 'Invalid role selection';
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${currentEditUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    });
    const data = await res.json();

    if (res.ok) {
      showToast('User role updated', 'success');
      closeModal('userEditModal');
      loadUsers();
    } else {
      errorEl.textContent = data.error || 'Failed to update';
    }
  } catch (err) {
    errorEl.textContent = 'Network error';
  }
});

// --- Delete User ---

function confirmDeleteUser(userId, username) {
  showConfirm(
    'Delete User',
    `Are you sure you want to delete "${username}"? This action cannot be undone.`,
    async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          showToast(`User "${username}" deleted`, 'success');
          loadUsers();
        } else {
          showToast(data.error || 'Delete failed', 'error');
        }
      } catch (err) {
        showToast('Network error', 'error');
      }
    }
  );
}

// ======================== Groups ========================

async function loadGroups() {
  try {
    const res = await fetch('/api/admin/groups');
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    allGroups = data.groups || [];
    renderGroups();
  } catch (err) {
    console.error('loadGroups error:', err);
    document.getElementById('groupsTableBody').innerHTML =
      '<tr><td colspan="4" class="empty-state"><p style="color:var(--error);">Failed to load groups</p></td></tr>';
  }
}

function renderGroups() {
  const tbody = document.getElementById('groupsTableBody');
  if (allGroups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No groups found</p></td></tr>';
    return;
  }

  tbody.innerHTML = allGroups.map(g => {
    const badgeClass = g.name === 'admin' ? 'badge-admin' : g.name === 'user' ? 'badge-user' : 'badge-moderator';
    return `
      <tr>
        <td><span class="badge ${badgeClass}">${escapeHTML(g.name)}</span></td>
        <td>${escapeHTML(g.description || '-')}</td>
        <td>${g.user_count}</td>
        <td class="actions">
          <button class="btn btn-sm btn-outline" onclick="openGroupEdit(${g.id}, '${escapeHTML(g.name)}', '${escapeHTML(g.description || '')}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="confirmDeleteGroup(${g.id}, '${escapeHTML(g.name)}', ${g.user_count})">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// --- Group Create/Edit Modal ---

document.getElementById('createGroupBtn').addEventListener('click', () => {
  document.getElementById('groupModalTitle').textContent = 'Create Group';
  document.getElementById('editGroupId').value = '';
  document.getElementById('editGroupName').value = '';
  document.getElementById('editGroupDesc').value = '';
  document.getElementById('groupEditError').textContent = '';
  document.getElementById('saveGroupBtn').textContent = 'Create';
  openModal('groupEditModal');
});

function openGroupEdit(id, name, description) {
  document.getElementById('groupModalTitle').textContent = 'Edit Group';
  document.getElementById('editGroupId').value = id;
  document.getElementById('editGroupName').value = name;
  document.getElementById('editGroupDesc').value = description;
  document.getElementById('groupEditError').textContent = '';
  document.getElementById('saveGroupBtn').textContent = 'Save';
  openModal('groupEditModal');
}

document.getElementById('saveGroupBtn').addEventListener('click', async () => {
  const id = document.getElementById('editGroupId').value;
  const name = document.getElementById('editGroupName').value.trim();
  const description = document.getElementById('editGroupDesc').value.trim();
  const errorEl = document.getElementById('groupEditError');
  errorEl.textContent = '';

  if (!name) {
    errorEl.textContent = 'Name is required';
    return;
  }

  const isEdit = !!id;
  const url = isEdit ? `/api/admin/groups/${id}` : '/api/admin/groups';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json();

    if (res.ok) {
      showToast(isEdit ? 'Group updated' : 'Group created', 'success');
      closeModal('groupEditModal');
      loadGroups();
    } else {
      errorEl.textContent = data.error || 'Operation failed';
    }
  } catch (err) {
    errorEl.textContent = 'Network error';
  }
});

// --- Delete Group ---

function confirmDeleteGroup(id, name, userCount) {
  if (userCount > 0) {
    showToast(`Cannot delete "${name}": ${userCount} user(s) are still assigned`, 'error');
    return;
  }

  showConfirm(
    'Delete Group',
    `Are you sure you want to delete the group "${name}"?`,
    async () => {
      try {
        const res = await fetch(`/api/admin/groups/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          showToast(`Group "${name}" deleted`, 'success');
          loadGroups();
        } else {
          showToast(data.error || 'Delete failed', 'error');
        }
      } catch (err) {
        showToast('Network error', 'error');
      }
    }
  );
}

// ======================== Guilds ========================

async function loadGuilds() {
  try {
    const res = await fetch('/api/admin/guilds');
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    allGuilds = data.guilds || [];
    renderGuilds();
  } catch (err) {
    console.error('loadGuilds error:', err);
    document.getElementById('guildsTableBody').innerHTML =
      '<tr><td colspan="7" class="empty-state"><p style="color:var(--error);">Failed to load guilds</p></td></tr>';
  }
}

function renderGuilds() {
  const tbody = document.getElementById('guildsTableBody');
  if (allGuilds.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No Discord guilds found</p></td></tr>';
    return;
  }

  tbody.innerHTML = allGuilds.map(g => {
    const langLabel = g.language === 'zh_TW' ? '中文' : g.language;
    const dmLabel = g.roller_dm_result === 1 ? 'DM' : 'Channel';

    return `
      <tr>
        <td><span class="mono">${escapeHTML(g.guild_id)}</span></td>
        <td>${escapeHTML(langLabel)}</td>
        <td>${g.admin_count}</td>
        <td>${g.log_channel_id ? `<span class="mono">${escapeHTML(g.log_channel_id)}</span>` : '<span class="text-muted">-</span>'}</td>
        <td>${g.roller_channel_id ? `<span class="mono">${escapeHTML(g.roller_channel_id)}</span> (${dmLabel})` : '<span class="text-muted">-</span>'}</td>
        <td>${g.voice_channel_count}</td>
        <td class="actions">
          <button class="btn btn-sm btn-outline" onclick="openGuildDetail('${escapeHTML(g.guild_id)}')">Details</button>
        </td>
      </tr>
    `;
  }).join('');
}

// --- Guild Detail Modal ---

async function openGuildDetail(guildId) {
  document.getElementById('guildDetailContent').innerHTML = '<p>Loading...</p>';
  openModal('guildDetailModal');

  try {
    const res = await fetch(`/api/admin/guilds/${guildId}`);
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    const g = data.guild;

    let html = `
      <div class="guild-info-card">
        <h3>General</h3>
        <div class="guild-info-grid">
          <div class="guild-info-item">
            <div class="label">Guild ID</div>
            <div class="value mono">${escapeHTML(g.guild_id)}</div>
          </div>
          <div class="guild-info-item">
            <div class="label">Language</div>
            <div class="value">${escapeHTML(g.language)}</div>
          </div>
          <div class="guild-info-item">
            <div class="label">Guild Admins</div>
            <div class="value">${g.admin_ids.length} admins</div>
          </div>
        </div>
      </div>

      <div class="guild-info-card">
        <h3>Channels</h3>
        <div class="guild-info-grid">
          <div class="guild-info-item">
            <div class="label">Log Channel</div>
            <div class="value mono">${g.log_channel_id ? escapeHTML(g.log_channel_id) : 'Not set'}</div>
          </div>
          <div class="guild-info-item">
            <div class="label">Roller Channel</div>
            <div class="value mono">${g.roller_channel_id ? escapeHTML(g.roller_channel_id) : 'Not set'}</div>
          </div>
          <div class="guild-info-item">
            <div class="label">Roller DM Mode</div>
            <div class="value">${g.roller_dm_result === 1 ? 'DM result' : 'Channel result'}</div>
          </div>
        </div>
      </div>

      <div class="guild-info-card">
        <h3>Admin User IDs</h3>
        ${g.admin_ids.length > 0
          ? `<ul class="voice-channel-list">${g.admin_ids.map(id => `<li><span class="mono">${escapeHTML(String(id))}</span></li>`).join('')}</ul>`
          : '<p style="color:var(--text-muted);">No guild admins configured</p>'}
      </div>

      <div class="guild-info-card">
        <h3>Private Voice Channels (${g.voice_channels.length})</h3>
        ${g.voice_channels.length > 0
          ? `<ul class="voice-channel-list">${g.voice_channels.map(v => `
              <li>
                <span>Channel: <span class="mono">${escapeHTML(v.channel_id)}</span></span>
                <span class="vc-owner">Owner: ${escapeHTML(v.owner_id)}</span>
              </li>`).join('')}</ul>`
          : '<p style="color:var(--text-muted);">No private voice channels</p>'}
      </div>
    `;

    document.getElementById('guildDetailContent').innerHTML = html;
  } catch (err) {
    document.getElementById('guildDetailContent').innerHTML =
      '<p style="color:var(--error);">Failed to load guild details</p>';
  }
}
