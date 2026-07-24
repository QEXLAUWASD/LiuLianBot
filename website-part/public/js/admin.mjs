import { ApiError, requestJSON } from './api_client.mjs';
import { element, replaceChildren } from './dom.mjs';
import { withBusyControl } from './form_state.mjs';
import { setupTabs } from './tabs.mjs';
import { setupAdminDialogs } from './admin_dialogs.mjs';
import { formatUtc8, utc8InputToIso } from './time_zone.mjs';

let allUsers = [];
let allGroups = [];
let allGuilds = [];
let allConnections = [];
let allEvents = [];
let currentEditUserId = null;
let confirmCallback = null;

const dialogs = setupAdminDialogs(document);
const adminRoot = document.querySelector('.admin-container');

function showToast(message, type) {
  document.querySelector('.toast')?.remove();
  const toast = element('div', {
    className: `toast toast-${type}`,
    text: message,
    attributes: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openModal(modalId, opener = document.activeElement) {
  return dialogs.open(modalId, opener);
}

function closeModal(modalId, reason = 'programmatic') {
  return dialogs.close(modalId, reason);
}

function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = message;
  confirmCallback = callback;
  openModal('confirmDialog');
}

function closeConfirm() {
  confirmCallback = null;
  closeModal('confirmDialog');
}

document.getElementById('confirmDialog').addEventListener('dialog:close', () => {
  confirmCallback = null;
});

document.getElementById('confirmOkBtn').addEventListener('click', async event => {
  const callback = confirmCallback;
  if (!callback) return;
  await withBusyControl(event.currentTarget, async () => {
    closeConfirm();
    await callback();
  });
});

function tableMessage(colspan, message, { error = false } = {}) {
  const paragraph = element('p', {
    className: error ? 'status-error' : '',
    text: message,
    attributes: error ? { role: 'alert' } : {},
  });
  return element('tr', {}, [
    element('td', { className: 'empty-state', attributes: { colspan } }, [paragraph]),
  ]);
}

function actionButton(text, action, id, className = 'btn-outline') {
  return element('button', {
    className: `btn btn-sm ${className}`,
    text,
    type: 'button',
    dataset: { action, id },
  });
}

function badgeClass(name) {
  if (name === 'admin') return 'badge-admin';
  if (name === 'user') return 'badge-user';
  return 'badge-moderator';
}

function renderLoadError(targetId, colspan, message) {
  replaceChildren(document.getElementById(targetId), [tableMessage(colspan, message, { error: true })]);
}

function redirectForAuthError(error) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    window.location.href = '/login.html';
    return true;
  }
  return false;
}

async function loadUsers() {
  try {
    const data = await requestJSON('/api/admin/users');
    allUsers = data?.users || [];
    renderUsers();
  } catch (error) {
    if (!redirectForAuthError(error)) {
      console.error('loadUsers error:', error);
      renderLoadError('usersTableBody', 4, 'Failed to load users');
    }
  }
}

function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (allUsers.length === 0) {
    replaceChildren(tbody, [tableMessage(4, 'No users found')]);
    return;
  }

  replaceChildren(tbody, allUsers.map(user => {
    const groups = Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : user.role_name ? [{ name: user.role_name }] : [];
    const groupNodes = groups.length > 0
      ? groups.map(group => element('span', {
          className: `badge ${badgeClass(group.name)}`,
          text: group.name,
        }))
      : [element('span', { className: 'text-muted', text: 'No groups' })];
    const created = user.created_at ? new Date(user.created_at).toLocaleDateString('zh-TW') : '-';

    return element('tr', {}, [
      element('td', {}, [element('strong', { text: user.username })]),
      element('td', {}, groupNodes),
      element('td', { text: created }),
      element('td', { className: 'actions' }, [
        actionButton('Edit Groups', 'edit-user', user.id),
        actionButton('Delete', 'delete-user', user.id, 'btn-danger'),
      ]),
    ]);
  }));
}

function accessOption(name, value, label, checked) {
  const input = element('input', {
    type: 'checkbox',
    attributes: { name, value },
  });
  input.checked = checked;
  return element('label', { className: 'access-option' }, [
    input,
    element('span', { text: label }),
  ]);
}

function renderUserGroupOptions(user) {
  const selectedRoleIds = new Set((user.roles || []).map(role => Number(role.id)));
  const children = allGroups.length > 0
    ? allGroups.map(group => accessOption(
        'userGroup',
        group.id,
        group.name,
        selectedRoleIds.has(Number(group.id)),
      ))
    : [element('span', { className: 'text-muted', text: 'No groups available' })];
  replaceChildren(document.getElementById('editUserRoles'), children);
}

async function openUserEdit(userId) {
  const user = allUsers.find(item => String(item.id) === String(userId));
  if (!user) return;

  currentEditUserId = user.id;
  document.getElementById('editUserUsername').value = user.username;
  document.getElementById('userEditError').textContent = '';
  replaceChildren(document.getElementById('editUserRoles'), [
    element('span', { className: 'text-muted', text: 'Loading...' }),
  ]);
  openModal('userEditModal');

  try {
    if (allGroups.length === 0) {
      const data = await requestJSON('/api/admin/groups');
      allGroups = data?.groups || [];
    }
    renderUserGroupOptions(user);
  } catch (error) {
    document.getElementById('userEditError').textContent = error.message;
  }
}

document.getElementById('saveUserGroupsBtn').addEventListener('click', async event => {
  const roleIds = Array.from(
    document.querySelectorAll('input[name="userGroup"]:checked'),
    input => Number(input.value),
  );
  const errorElement = document.getElementById('userEditError');
  errorElement.textContent = '';

  if (!currentEditUserId || roleIds.length === 0) {
    errorElement.textContent = 'Select at least one group';
    return;
  }

  await withBusyControl(event.currentTarget, async () => {
    try {
      await requestJSON(`/api/admin/users/${currentEditUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_ids: roleIds }),
      });
      showToast('User groups updated', 'success');
      closeModal('userEditModal');
      await loadUsers();
    } catch (error) {
      errorElement.textContent = error.message || 'Failed to update';
    }
  });
});

function confirmDeleteUser(userId) {
  const user = allUsers.find(item => String(item.id) === String(userId));
  if (!user) return;
  showConfirm(
    'Delete User',
    `Are you sure you want to delete "${user.username}"? This action cannot be undone.`,
    async () => {
      try {
        await requestJSON(`/api/admin/users/${user.id}`, { method: 'DELETE' });
        showToast(`User "${user.username}" deleted`, 'success');
        await loadUsers();
      } catch (error) {
        showToast(error.message || 'Delete failed', 'error');
      }
    },
  );
}

async function loadGroups() {
  try {
    const data = await requestJSON('/api/admin/groups');
    allGroups = data?.groups || [];
    renderGroups();
  } catch (error) {
    if (!redirectForAuthError(error)) {
      console.error('loadGroups error:', error);
      renderLoadError('groupsTableBody', 4, 'Failed to load groups');
    }
  }
}

function renderGroups() {
  const tbody = document.getElementById('groupsTableBody');
  if (allGroups.length === 0) {
    replaceChildren(tbody, [tableMessage(4, 'No groups found')]);
    return;
  }

  replaceChildren(tbody, allGroups.map(group => element('tr', {}, [
    element('td', {}, [
      element('span', { className: `badge ${badgeClass(group.name)}`, text: group.name }),
    ]),
    element('td', { text: group.description || '-' }),
    element('td', { text: group.user_count }),
    element('td', { className: 'actions' }, [
      actionButton('Edit', 'edit-group', group.id),
      actionButton('Delete', 'delete-group', group.id, 'btn-danger'),
    ]),
  ])));
}

document.getElementById('createGroupBtn').addEventListener('click', () => {
  document.getElementById('groupModalTitle').textContent = 'Create Group';
  document.getElementById('editGroupId').value = '';
  document.getElementById('editGroupName').value = '';
  document.getElementById('editGroupDesc').value = '';
  document.getElementById('groupEditError').textContent = '';
  document.getElementById('saveGroupBtn').textContent = 'Create';
  openModal('groupEditModal');
});

function openGroupEdit(id) {
  const group = allGroups.find(item => Number(item.id) === Number(id));
  if (!group) return;
  document.getElementById('groupModalTitle').textContent = 'Edit Group';
  document.getElementById('editGroupId').value = group.id;
  document.getElementById('editGroupName').value = group.name;
  document.getElementById('editGroupDesc').value = group.description || '';
  document.getElementById('groupEditError').textContent = '';
  document.getElementById('saveGroupBtn').textContent = 'Save';
  openModal('groupEditModal');
}

document.getElementById('saveGroupBtn').addEventListener('click', async event => {
  const id = document.getElementById('editGroupId').value;
  const name = document.getElementById('editGroupName').value.trim();
  const description = document.getElementById('editGroupDesc').value.trim();
  const errorElement = document.getElementById('groupEditError');
  errorElement.textContent = '';

  if (!name) {
    errorElement.textContent = 'Name is required';
    return;
  }

  await withBusyControl(event.currentTarget, async () => {
    try {
      await requestJSON(id ? `/api/admin/groups/${id}` : '/api/admin/groups', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      showToast(id ? 'Group updated' : 'Group created', 'success');
      closeModal('groupEditModal');
      await loadGroups();
    } catch (error) {
      errorElement.textContent = error.message || 'Operation failed';
    }
  });
});

function confirmDeleteGroup(id) {
  const group = allGroups.find(item => Number(item.id) === Number(id));
  if (!group) return;
  if (Number(group.user_count) > 0) {
    showToast(`Cannot delete "${group.name}": ${group.user_count} user(s) are still assigned`, 'error');
    return;
  }

  showConfirm('Delete Group', `Are you sure you want to delete the group "${group.name}"?`, async () => {
    try {
      await requestJSON(`/api/admin/groups/${group.id}`, { method: 'DELETE' });
      showToast(`Group "${group.name}" deleted`, 'success');
      await loadGroups();
    } catch (error) {
      showToast(error.message || 'Delete failed', 'error');
    }
  });
}

async function loadGuilds() {
  try {
    const data = await requestJSON('/api/admin/guilds');
    allGuilds = data?.guilds || [];
    renderGuilds();
  } catch (error) {
    if (!redirectForAuthError(error)) {
      console.error('loadGuilds error:', error);
      renderLoadError('guildsTableBody', 7, 'Failed to load guilds');
    }
  }
}

function optionalValue(value, className = '') {
  return element('span', {
    className: value ? className : 'text-muted',
    text: value || '-',
  });
}

function renderGuilds() {
  const tbody = document.getElementById('guildsTableBody');
  if (allGuilds.length === 0) {
    replaceChildren(tbody, [tableMessage(7, 'No Discord guilds found')]);
    return;
  }

  replaceChildren(tbody, allGuilds.map(guild => {
    const language = guild.language === 'zh_TW' ? '中文' : guild.language;
    const rollerChannel = guild.roller_channel_id
      ? `${guild.roller_channel_id} (${guild.roller_dm_result === 1 ? 'DM' : 'Channel'})`
      : '';
    return element('tr', {}, [
    element('td', {}, [element('strong', { text: guild.guild_name || `Guild ${guild.guild_id}` }), element('div', { className: 'table-subtext mono', text: guild.guild_id })]),
      element('td', { text: language }),
      element('td', { text: guild.admin_count }),
      element('td', {}, [optionalValue(guild.log_channel_id, 'mono')]),
      element('td', {}, [optionalValue(rollerChannel, 'mono')]),
      element('td', { text: guild.voice_channel_count }),
      element('td', { className: 'actions' }, [
        actionButton('Details', 'guild-detail', guild.guild_id),
      ]),
    ]);
  }));
}

function guildInfoItem(label, value, className = '') {
  return element('div', { className: 'guild-info-item' }, [
    element('div', { className: 'label', text: label }),
    element('div', { className: `value ${className}`.trim(), text: value }),
  ]);
}

function guildInfoCard(title, children) {
  return element('div', { className: 'guild-info-card' }, [
    element('h3', { text: title }),
    ...children,
  ]);
}

function renderIdList(values, emptyMessage, itemFactory) {
  if (values.length === 0) return element('p', { className: 'text-muted', text: emptyMessage });
  return element('ul', { className: 'voice-channel-list' }, values.map(itemFactory));
}

async function openGuildDetail(guildId) {
  const content = document.getElementById('guildDetailContent');
  replaceChildren(content, [element('p', { text: 'Loading...' })]);
  openModal('guildDetailModal');

  try {
    const data = await requestJSON(`/api/admin/guilds/${encodeURIComponent(guildId)}`);
    const guild = data.guild;
    const admins = Array.isArray(guild.admin_ids) ? guild.admin_ids : [];
    const voiceChannels = Array.isArray(guild.voice_channels) ? guild.voice_channels : [];

    replaceChildren(content, [
      guildInfoCard('General', [
        element('div', { className: 'guild-info-grid' }, [
          guildInfoItem('Guild', guild.guild_name || `Guild ${guild.guild_id}`),
          guildInfoItem('Guild ID', guild.guild_id, 'mono'),
          guildInfoItem('Language', guild.language),
          guildInfoItem('Guild Admins', `${admins.length} admins`),
        ]),
      ]),
      guildInfoCard('Channels', [
        element('div', { className: 'guild-info-grid' }, [
          guildInfoItem('Log Channel', guild.log_channel_id || 'Not set', 'mono'),
          guildInfoItem('Roller Channel', guild.roller_channel_id || 'Not set', 'mono'),
          guildInfoItem('Roller DM Mode', guild.roller_dm_result === 1 ? 'DM result' : 'Channel result'),
        ]),
      ]),
      guildInfoCard('Admin User IDs', [
        renderIdList(admins, 'No guild admins configured', id => element('li', {}, [
          element('span', { className: 'mono', text: id }),
        ])),
      ]),
      guildInfoCard(`Private Voice Channels (${voiceChannels.length})`, [
        renderIdList(voiceChannels, 'No private voice channels', channel => element('li', {}, [
          element('span', { text: 'Channel: ' }, [
            element('span', { className: 'mono', text: channel.channel_id }),
          ]),
          element('span', { className: 'vc-owner', text: `Owner: ${channel.owner_id}` }),
        ])),
      ]),
    ]);
  } catch (_) {
    replaceChildren(content, [element('p', {
      className: 'status-error',
      text: 'Failed to load guild details',
      attributes: { role: 'alert' },
    })]);
  }
}

async function loadConnections() {
  try {
    const data = await requestJSON('/api/admin/connections');
    allConnections = data?.connections || [];
    renderConnections();
  } catch (error) {
    if (!redirectForAuthError(error)) {
      console.error('loadConnections error:', error);
      renderLoadError('connectionsTableBody', 5, 'Failed to load website connections');
    }
  }
}

async function loadEvents() {
  try {
    const data = await requestJSON('/api/admin/events');
    allEvents = data?.events || [];
    renderEvents();
  } catch (error) {
    if (!redirectForAuthError(error)) renderLoadError('eventsTableBody', 6, 'Failed to load events');
  }
}

function renderEvents() {
  const tbody = document.getElementById('eventsTableBody');
  if (allEvents.length === 0) {
    replaceChildren(tbody, [tableMessage(6, 'No events found')]);
    return;
  }
  replaceChildren(tbody, allEvents.map(event => element('tr', {}, [
    element('td', {}, [element('strong', { text: event.title }), element('div', { className: 'table-subtext', text: event.creator_username })]),
      element('td', {}, [element('strong', { text: event.guild_name || `Guild ${event.guild_id}` }), element('div', { className: 'table-subtext mono', text: event.guild_id })]),
    element('td', { text: event.start_at ? formatUtc8(event.start_at) : '-' }),
    element('td', { text: String(event.participant_count || 0) }),
    element('td', {}, [element('span', { className: `badge ${event.visible ? 'badge-enabled' : 'badge-disabled'}`, text: event.visible ? 'Visible' : 'Hidden' })]),
    element('td', { className: 'actions' }, [actionButton(event.visible ? 'Hide' : 'Show', 'toggle-event-visibility', event.id)]),
  ])));
}

async function toggleEventVisibility(id) {
  const event = allEvents.find(item => Number(item.id) === Number(id));
  if (!event) return;
  try {
    await requestJSON(`/api/admin/events/${event.id}/visibility`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: !Boolean(event.visible) }),
    });
    await loadEvents();
    showToast(`Event ${event.visible ? 'hidden' : 'visible'}`, 'success');
  } catch (error) { showToast(error.message || 'Visibility update failed', 'error'); }
}

async function loadStats() {
  try {
    const data = await requestJSON('/api/admin/stats');
    const stats = data?.stats || [];
    replaceChildren(document.getElementById('statsTableBody'), stats.length ? stats.map(item => element('tr', {}, [
      element('td', { className: 'mono', text: item.guild_id }),
      element('td', { text: String(item.command_count || 0) }),
      element('td', { text: String(item.voice_joins || 0) }),
      element('td', { text: item.last_day ? new Date(item.last_day).toLocaleDateString() : '-' }),
    ])) : [tableMessage(4, 'No activity recorded yet')]);
  } catch (error) {
    if (!redirectForAuthError(error)) renderLoadError('statsTableBody', 4, 'Failed to load statistics');
  }
}

async function loadAnnouncements() {
  try {
    const data = await requestJSON('/api/admin/announcements');
    const items = data?.announcements || [];
    replaceChildren(document.getElementById('announcementsTableBody'), items.length ? items.map(item => element('tr', {}, [
      element('td', { className: 'mono', text: item.guild_id }),
      element('td', { className: 'mono', text: item.channel_id }),
      element('td', { text: item.content }),
      element('td', { text: item.scheduled_at ? formatUtc8(item.scheduled_at) : '-' }),
      element('td', { text: item.status }),
      element('td', { className: 'actions' }, [item.status === 'scheduled' ? actionButton('Cancel', 'cancel-announcement', item.id, 'btn-danger') : null]),
    ])) : [tableMessage(6, 'No announcements found')]);
  } catch (error) { if (!redirectForAuthError(error)) renderLoadError('announcementsTableBody', 6, 'Failed to load announcements'); }
}

const announcementForm = document.getElementById('announcementForm');
announcementForm.addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('announcementStatus');
  try {
    await requestJSON('/api/admin/announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guildId: document.getElementById('announcementGuild').value,
        channelId: document.getElementById('announcementChannel').value,
        content: document.getElementById('announcementContent').value,
        scheduledAt: utc8InputToIso(document.getElementById('announcementTime').value),
      }),
    });
    status.textContent = 'Announcement scheduled.';
  announcementForm.reset();
    await loadAnnouncements();
  } catch (error) { status.textContent = error.message; status.className = 'status-msg status-error'; }
});

async function cancelAnnouncement(id) {
  try { await requestJSON(`/api/admin/announcements/${id}`, { method: 'DELETE' }); await loadAnnouncements(); }
  catch (error) { showToast(error.message || 'Cancel failed', 'error'); }
}

function renderConnections() {
  const tbody = document.getElementById('connectionsTableBody');
  if (allConnections.length === 0) {
    replaceChildren(tbody, [tableMessage(5, 'No website connections configured')]);
    return;
  }

  replaceChildren(tbody, allConnections.map(connection => {
    const access = [
      ...(connection.roles || []).map(role => `Group: ${role.name}`),
      ...(connection.users || []).map(user => `User: ${user.username}`),
    ];
    const status = [
      element('span', {
        className: `badge ${connection.enabled ? 'badge-enabled' : 'badge-disabled'}`,
        text: connection.enabled ? 'Enabled' : 'Disabled',
      }),
      connection.hidden ? element('span', { className: 'badge badge-hidden', text: 'Hidden' }) : null,
    ];
    const actions = [
      connection.enabled ? element('a', {
        className: 'btn btn-sm btn-outline',
        text: 'Open',
        attributes: {
          href: `/connect/${encodeURIComponent(connection.slug)}/`,
          target: '_blank',
          rel: 'noopener',
        },
      }) : null,
      actionButton('Edit', 'edit-connection', connection.id),
      actionButton('Delete', 'delete-connection', connection.id, 'btn-danger'),
    ];

    return element('tr', {}, [
      element('td', {}, [
        element('strong', { text: connection.name }),
        element('div', { className: 'table-subtext', text: `/connect/${connection.slug}/` }),
      ]),
      element('td', {}, [element('span', { className: 'mono target-url', text: connection.target_url })]),
      element('td', {}, access.length
        ? access.map(item => element('span', { className: 'access-label', text: item }))
        : [element('span', { className: 'text-muted', text: 'Admins only' })]),
      element('td', {}, status),
      element('td', { className: 'actions' }, actions),
    ]);
  }));
}

async function ensureConnectionAccessData() {
  const requests = [];
  if (allUsers.length === 0) requests.push(loadUsers());
  if (allGroups.length === 0) requests.push(loadGroups());
  await Promise.all(requests);
}

function renderConnectionAccessOptions(connection) {
  const selectedRoles = new Set((connection?.roles || []).map(role => Number(role.id)));
  const selectedUsers = new Set((connection?.users || []).map(user => String(user.id)));
  const roleOptions = allGroups.length
    ? allGroups.map(role => accessOption(
        'connectionRole', role.id, role.name, selectedRoles.has(Number(role.id)),
      ))
    : [element('span', { className: 'text-muted', text: 'No groups available' })];
  const userOptions = allUsers.length
    ? allUsers.map(user => accessOption(
        'connectionUser', user.id, user.username, selectedUsers.has(String(user.id)),
      ))
    : [element('span', { className: 'text-muted', text: 'No users available' })];

  replaceChildren(document.getElementById('connectionRoleOptions'), roleOptions);
  replaceChildren(document.getElementById('connectionUserOptions'), userOptions);
}

document.getElementById('createConnectionBtn').addEventListener('click', async () => {
  await ensureConnectionAccessData();
  document.getElementById('connectionModalTitle').textContent = 'Add Website';
  document.getElementById('editConnectionId').value = '';
  document.getElementById('editConnectionName').value = '';
  document.getElementById('editConnectionSlug').value = '';
  document.getElementById('editConnectionTarget').value = '';
  document.getElementById('editConnectionDesc').value = '';
  document.getElementById('editConnectionEnabled').checked = true;
  document.getElementById('editConnectionHidden').checked = false;
  document.getElementById('connectionEditError').textContent = '';
  renderConnectionAccessOptions(null);
  openModal('connectionEditModal');
});

async function openConnectionEdit(id) {
  const connection = allConnections.find(item => Number(item.id) === Number(id));
  if (!connection) return;
  await ensureConnectionAccessData();

  document.getElementById('connectionModalTitle').textContent = 'Edit Website';
  document.getElementById('editConnectionId').value = connection.id;
  document.getElementById('editConnectionName').value = connection.name;
  document.getElementById('editConnectionSlug').value = connection.slug;
  document.getElementById('editConnectionTarget').value = connection.target_url;
  document.getElementById('editConnectionDesc').value = connection.description || '';
  document.getElementById('editConnectionEnabled').checked = Boolean(connection.enabled);
  document.getElementById('editConnectionHidden').checked = Boolean(connection.hidden);
  document.getElementById('connectionEditError').textContent = '';
  renderConnectionAccessOptions(connection);
  openModal('connectionEditModal');
}

document.getElementById('saveConnectionBtn').addEventListener('click', async event => {
  const id = document.getElementById('editConnectionId').value;
  const errorElement = document.getElementById('connectionEditError');
  const payload = {
    name: document.getElementById('editConnectionName').value.trim(),
    slug: document.getElementById('editConnectionSlug').value.trim(),
    target_url: document.getElementById('editConnectionTarget').value.trim(),
    description: document.getElementById('editConnectionDesc').value.trim(),
    enabled: document.getElementById('editConnectionEnabled').checked,
    hidden: document.getElementById('editConnectionHidden').checked,
    role_ids: Array.from(
      document.querySelectorAll('input[name="connectionRole"]:checked'),
      input => Number(input.value),
    ),
    user_ids: Array.from(
      document.querySelectorAll('input[name="connectionUser"]:checked'),
      input => input.value,
    ),
  };

  errorElement.textContent = '';
  await withBusyControl(event.currentTarget, async () => {
    try {
      await requestJSON(id ? `/api/admin/connections/${id}` : '/api/admin/connections', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showToast(id ? 'Website updated' : 'Website added', 'success');
      closeModal('connectionEditModal');
      await loadConnections();
    } catch (error) {
      errorElement.textContent = error.message || 'Operation failed';
    }
  });
});

function confirmDeleteConnection(id) {
  const connection = allConnections.find(item => Number(item.id) === Number(id));
  if (!connection) return;
  showConfirm('Delete Website', `Delete "${connection.name}" and all of its access rules?`, async () => {
    try {
      await requestJSON(`/api/admin/connections/${connection.id}`, { method: 'DELETE' });
      showToast('Website deleted', 'success');
      await loadConnections();
    } catch (error) {
      showToast(error.message || 'Delete failed', 'error');
    }
  });
}

const actions = {
  'edit-user': control => openUserEdit(control.dataset.id),
  'delete-user': control => confirmDeleteUser(control.dataset.id),
  'edit-group': control => openGroupEdit(Number(control.dataset.id)),
  'delete-group': control => confirmDeleteGroup(Number(control.dataset.id)),
  'guild-detail': control => openGuildDetail(control.dataset.id),
  'edit-connection': control => openConnectionEdit(Number(control.dataset.id)),
  'delete-connection': control => confirmDeleteConnection(Number(control.dataset.id)),
  'toggle-event-visibility': control => toggleEventVisibility(Number(control.dataset.id)),
  'cancel-announcement': control => cancelAnnouncement(Number(control.dataset.id)),
};

adminRoot.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control || !adminRoot.contains(control)) return;
  actions[control.dataset.action]?.(control);
});

document.addEventListener('DOMContentLoaded', () => {
  const tabs = setupTabs(adminRoot);
  adminRoot.addEventListener('tabs:change', event => {
    const tab = event.detail?.tab;
    if (event.target !== adminRoot || tab?.closest('[data-tabs]') !== adminRoot) return;
    const loaders = {
      users: loadUsers,
      groups: loadGroups,
      guilds: loadGuilds,
      connections: loadConnections,
      events: loadEvents,
      stats: loadStats,
      announcements: loadAnnouncements,
    };
    loaders[tab.dataset.tab]?.();
  });
  if (tabs) loadUsers();
});

export { loadConnections, loadGroups, loadGuilds, loadUsers, showConfirm };
