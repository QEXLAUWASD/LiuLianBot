import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, requestJSON } from '../lib/apiClient.mjs';
import { formatUtc8, utc8InputToIso } from '../lib/timeZone.mjs';
import { Modal } from '../components/Modal.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { TabList, TabPanel, useTabs } from '../components/Tabs.jsx';
import { Toasts } from '../components/Toasts.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';
import { useToast } from '../hooks/useToast.mjs';

const TABS = [
  { id: 'users', label: '👤 Users', tabId: 'users-tab', panelId: 'usersTab' },
  { id: 'groups', label: '🔐 Groups', tabId: 'groups-tab', panelId: 'groupsTab' },
  { id: 'guilds', label: '🌐 Discord Guilds', tabId: 'guilds-tab', panelId: 'guildsTab' },
  { id: 'connections', label: '🔗 Website Access', tabId: 'connections-tab', panelId: 'connectionsTab' },
  { id: 'page-visibility', label: '👁️ Page Visibility', tabId: 'page-visibility-tab', panelId: 'pageVisibilityTab' },
  { id: 'events', label: '📅 Events', tabId: 'events-tab', panelId: 'eventsTab' },
  { id: 'stats', label: '📊 Stats', tabId: 'stats-tab', panelId: 'statsTab' },
  { id: 'announcements', label: '📣 Announcements', tabId: 'announcements-tab', panelId: 'announcementsTab' },
];

const TABLE_KEYS = ['users', 'groups', 'guilds', 'connections', 'pageVisibility', 'events', 'stats', 'announcements'];

const idleTables = () => Object.fromEntries(
  TABLE_KEYS.map(key => [key, { status: 'idle', items: [] }]),
);

export function badgeClass(name) {
  if (name === 'admin') return 'badge-admin';
  if (name === 'user') return 'badge-user';
  return 'badge-moderator';
}

export function tableRow(colspan, message, { error = false } = {}) {
  return (
    <tr>
      <td className="empty-state" colSpan={colspan}>
        <p className={error ? 'status-error' : ''} role={error ? 'alert' : undefined}>{message}</p>
      </td>
    </tr>
  );
}

export function AccessOption({ name, value, label, checked, onChange }) {
  return (
    <label className="access-option">
      <input type="checkbox" name={name} value={value} checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function actionButtonProps(action, id, className = 'btn-outline') {
  return {
    className: `btn btn-sm ${className}`,
    type: 'button',
    'data-action': action,
    'data-id': id,
  };
}

export function AdminPage() {
  const tabs = useTabs({ items: TABS, initialId: 'users' });
  const { toasts, showToast, dismiss } = useToast();
  const [tables, setTables] = useState(idleTables);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [targets, setTargets] = useState([]);
  const [announcementStatus, setAnnouncementStatus] = useState({ message: '', tone: '' });
  const [announcementForm, setAnnouncementForm] = useState({ guildId: '', channelId: '', content: '', scheduledAt: '' });

  const [userEdit, setUserEdit] = useState(null);
  const [groupEdit, setGroupEdit] = useState(null);
  const [connectionEdit, setConnectionEdit] = useState(null);
  const [pageEdit, setPageEdit] = useState(null);
  const [guildDetail, setGuildDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const saveAction = useAsyncAction();

  const redirectForAuthError = useCallback(error => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      globalThis.location.href = '/login.html';
      return true;
    }
    return false;
  }, []);

  const loadResource = useCallback(async (key, url, transform, label) => {
    setTables(current => ({ ...current, [key]: { ...current[key], status: 'loading' } }));
    try {
      const data = await requestJSON(url);
      const items = transform(data);
      setTables(current => ({ ...current, [key]: { status: 'ready', items } }));
      return data;
    } catch (error) {
      if (redirectForAuthError(error)) return null;
      console.error(`${key} load error:`, error);
      setTables(current => ({
        ...current,
        [key]: { status: 'error', items: [], error: `Failed to load ${label}` },
      }));
      return null;
    }
  }, [redirectForAuthError]);

  const loadUsers = useCallback(async () => {
    const data = await loadResource('users', '/api/admin/users', value => value?.users || [], 'users');
    if (data?.users) setUsers(data.users);
  }, [loadResource]);

  const loadGroups = useCallback(async () => {
    const data = await loadResource('groups', '/api/admin/groups', value => value?.groups || [], 'groups');
    if (data?.groups) setGroups(data.groups);
  }, [loadResource]);

  const loadGuilds = useCallback(
    () => loadResource('guilds', '/api/admin/guilds', value => value?.guilds || [], 'Discord guilds'),
    [loadResource],
  );

  const loadConnections = useCallback(
    () => loadResource('connections', '/api/admin/connections', value => value?.connections || [], 'website connections'),
    [loadResource],
  );

  const loadPageVisibility = useCallback(async () => {
    const data = await loadResource(
      'pageVisibility',
      '/api/admin/page-visibility',
      value => value?.pages || [],
      'page visibility',
    );
    if (data?.groups) setGroups(data.groups);
    if (data?.users) setUsers(data.users);
  }, [loadResource]);

  const loadEvents = useCallback(
    () => loadResource('events', '/api/admin/events', value => value?.events || [], 'events'),
    [loadResource],
  );

  const loadStats = useCallback(
    () => loadResource('stats', '/api/admin/stats', value => value?.stats || [], 'statistics'),
    [loadResource],
  );

  const loadAnnouncements = useCallback(
    () => loadResource('announcements', '/api/admin/announcements', value => value?.announcements || [], 'announcements'),
    [loadResource],
  );

  const loadAnnouncementTargets = useCallback(async () => {
    try {
      const data = await requestJSON('/api/admin/announcement-targets');
      setTargets(data?.guilds || []);
    } catch (error) {
      if (!redirectForAuthError(error)) showToast('Failed to load Discord servers', 'error');
    }
  }, [redirectForAuthError, showToast]);

  const loaders = useMemo(() => ({
    users: loadUsers,
    groups: loadGroups,
    guilds: loadGuilds,
    connections: loadConnections,
    'page-visibility': loadPageVisibility,
    events: loadEvents,
    stats: loadStats,
    announcements: async () => {
      await Promise.all([loadAnnouncements(), loadAnnouncementTargets()]);
    },
  }), [
    loadUsers, loadGroups, loadGuilds, loadConnections, loadPageVisibility,
    loadEvents, loadStats, loadAnnouncements, loadAnnouncementTargets,
  ]);

  useEffect(() => {
    loaders.users();
  }, [loaders]);

  useEffect(() => {
    if (tabs.activeId && tabs.activeId !== 'users') loaders[tabs.activeId]?.();
  }, [tabs.activeId, loaders]);

  const ensureAccessData = async () => {
    const requests = [];
    if (users.length === 0) requests.push(loadUsers());
    if (groups.length === 0) requests.push(loadGroups());
    await Promise.all(requests);
  };

  const askConfirm = (title, message, onConfirm) => setConfirm({ title, message, onConfirm });

  const updateUserGroups = () => {
    const roleIds = userEdit.roleIds.map(Number);
    if (roleIds.length === 0) {
      setUserEdit(current => ({ ...current, error: 'Select at least one group' }));
      return;
    }
    saveAction.run(async () => {
      try {
        await requestJSON(`/api/admin/users/${userEdit.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role_ids: roleIds }),
        });
        showToast('User groups updated', 'success');
        setUserEdit(null);
        await loadUsers();
      } catch (error) {
        setUserEdit(current => ({ ...current, error: error.message || 'Failed to update' }));
      }
    });
  };

  const deleteUser = userId => {
    const user = users.find(item => String(item.id) === String(userId));
    if (!user) return;
    askConfirm(
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
  };

  const saveGroup = () => {
    const name = (groupEdit.name || '').trim();
    if (!name) {
      setGroupEdit(current => ({ ...current, error: 'Name is required' }));
      return;
    }
    saveAction.run(async () => {
      try {
        await requestJSON(groupEdit.id ? `/api/admin/groups/${groupEdit.id}` : '/api/admin/groups', {
          method: groupEdit.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description: (groupEdit.description || '').trim() }),
        });
        showToast(groupEdit.id ? 'Group updated' : 'Group created', 'success');
        setGroupEdit(null);
        await loadGroups();
      } catch (error) {
        setGroupEdit(current => ({ ...current, error: error.message || 'Operation failed' }));
      }
    });
  };

  const deleteGroup = id => {
    const group = groups.find(item => Number(item.id) === Number(id));
    if (!group) return;
    if (Number(group.user_count) > 0) {
      showToast(`Cannot delete "${group.name}": ${group.user_count} user(s) are still assigned`, 'error');
      return;
    }
    askConfirm('Delete Group', `Are you sure you want to delete the group "${group.name}"?`, async () => {
      try {
        await requestJSON(`/api/admin/groups/${group.id}`, { method: 'DELETE' });
        showToast(`Group "${group.name}" deleted`, 'success');
        await loadGroups();
      } catch (error) {
        showToast(error.message || 'Delete failed', 'error');
      }
    });
  };

  const openGuildDetail = async guildId => {
    setGuildDetail({ status: 'loading', guildId });
    try {
      const data = await requestJSON(`/api/admin/guilds/${encodeURIComponent(guildId)}`);
      setGuildDetail({ status: 'ready', guild: data.guild });
    } catch (_) {
      setGuildDetail({ status: 'error', guildId });
    }
  };

  const saveConnection = () => {
    const payload = {
      name: connectionEdit.name.trim(),
      slug: connectionEdit.slug.trim(),
      target_url: connectionEdit.targetUrl.trim(),
      description: connectionEdit.description.trim(),
      enabled: connectionEdit.enabled,
      hidden: connectionEdit.hidden,
      legacy_proxy_routing: connectionEdit.legacyRouting,
      role_ids: connectionEdit.roleIds.map(Number),
      user_ids: connectionEdit.userIds.map(String),
    };
    saveAction.run(async () => {
      try {
        await requestJSON(
          connectionEdit.id ? `/api/admin/connections/${connectionEdit.id}` : '/api/admin/connections',
          {
            method: connectionEdit.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );
        showToast(connectionEdit.id ? 'Website updated' : 'Website added', 'success');
        setConnectionEdit(null);
        await loadConnections();
      } catch (error) {
        setConnectionEdit(current => ({ ...current, error: error.message || 'Operation failed' }));
      }
    });
  };

  const deleteConnection = id => {
    const connection = tables.connections.items.find(item => Number(item.id) === Number(id));
    if (!connection) return;
    askConfirm('Delete Website', `Delete "${connection.name}" and all of its access rules?`, async () => {
      try {
        await requestJSON(`/api/admin/connections/${connection.id}`, { method: 'DELETE' });
        showToast('Website deleted', 'success');
        await loadConnections();
      } catch (error) {
        showToast(error.message || 'Delete failed', 'error');
      }
    });
  };

  const savePageVisibility = () => {
    saveAction.run(async () => {
      try {
        await requestJSON(`/api/admin/page-visibility/${encodeURIComponent(pageEdit.key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            public_access: pageEdit.publicAccess,
            authenticated_access: pageEdit.authenticatedAccess,
            role_ids: pageEdit.roleIds.map(Number),
            user_ids: pageEdit.userIds.map(String),
          }),
        });
        setPageEdit(null);
        showToast('Page visibility updated', 'success');
        await loadPageVisibility();
      } catch (error) {
        setPageEdit(current => ({ ...current, error: error.message || 'Failed to update page visibility' }));
      }
    });
  };

  const toggleEventVisibility = async id => {
    const event = tables.events.items.find(item => Number(item.id) === Number(id));
    if (!event) return;
    try {
      await requestJSON(`/api/admin/events/${event.id}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: !event.visible }),
      });
      await loadEvents();
      showToast(`Event ${event.visible ? 'hidden' : 'visible'}`, 'success');
    } catch (error) {
      showToast(error.message || 'Visibility update failed', 'error');
    }
  };

  const scheduleAnnouncement = event => {
    event.preventDefault();
    saveAction.run(async () => {
      try {
        await requestJSON('/api/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guildId: announcementForm.guildId,
            channelId: announcementForm.channelId,
            content: announcementForm.content,
            scheduledAt: utc8InputToIso(announcementForm.scheduledAt),
          }),
        });
        setAnnouncementStatus({ message: 'Announcement scheduled.', tone: '' });
        setAnnouncementForm({ guildId: '', channelId: '', content: '', scheduledAt: '' });
        await loadAnnouncements();
      } catch (error) {
        setAnnouncementStatus({ message: error.message, tone: 'error' });
      }
    });
  };

  const cancelAnnouncement = async id => {
    try {
      await requestJSON(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      await loadAnnouncements();
    } catch (error) {
      showToast(error.message || 'Cancel failed', 'error');
    }
  };

  const toggleConnectionRole = (id, checked) => setConnectionEdit(current => ({
    ...current,
    roleIds: checked
      ? [...current.roleIds, String(id)]
      : current.roleIds.filter(value => String(value) !== String(id)),
  }));

  const toggleConnectionUser = (id, checked) => setConnectionEdit(current => ({
    ...current,
    userIds: checked
      ? [...current.userIds, String(id)]
      : current.userIds.filter(value => String(value) !== String(id)),
  }));

  const handleTableClick = event => {
    const control = event.target.closest('[data-action]');
    if (!control) return;
    const id = control.dataset.id;
    switch (control.dataset.action) {
      case 'edit-user': {
        const user = users.find(item => String(item.id) === String(id));
        if (!user) return;
        ensureAccessData().then(() => setUserEdit({
          id: user.id,
          username: user.username,
          roleIds: (user.roles || []).map(role => String(role.id)),
          error: '',
        }));
        break;
      }
      case 'delete-user': deleteUser(id); break;
      case 'edit-group': {
        const group = groups.find(item => Number(item.id) === Number(id));
        if (group) setGroupEdit({ id: group.id, name: group.name, description: group.description || '', error: '' });
        break;
      }
      case 'delete-group': deleteGroup(id); break;
      case 'guild-detail': openGuildDetail(id); break;
      case 'edit-connection': {
        const connection = tables.connections.items.find(item => Number(item.id) === Number(id));
        if (!connection) return;
        ensureAccessData().then(() => setConnectionEdit({
          id: connection.id,
          name: connection.name,
          slug: connection.slug,
          targetUrl: connection.target_url,
          description: connection.description || '',
          enabled: Boolean(connection.enabled),
          hidden: Boolean(connection.hidden),
          legacyRouting: Boolean(connection.legacy_proxy_routing),
          roleIds: (connection.roles || []).map(role => String(role.id)),
          userIds: (connection.users || []).map(user => String(user.id)),
          error: '',
        }));
        break;
      }
      case 'delete-connection': deleteConnection(id); break;
      case 'edit-page-visibility': {
        const page = tables.pageVisibility.items.find(item => item.key === id);
        if (!page) return;
        setPageEdit({
          key: page.key,
          path: page.path,
          publicAccess: Boolean(page.public_access),
          authenticatedAccess: Boolean(page.authenticated_access),
          roleIds: (page.role_ids || []).map(Number).map(String),
          userIds: (page.user_ids || []).map(String),
          error: '',
        });
        break;
      }
      case 'toggle-event-visibility': toggleEventVisibility(id); break;
      case 'cancel-announcement': cancelAnnouncement(id); break;
      default: break;
    }
  };

  const channelOptions = targets.find(item => item.guild_id === announcementForm.guildId)?.channels || [];

  const renderTableBody = (key, colspan, emptyMessage, rows) => {
    const table = tables[key];
    if (table.status === 'error') return tableRow(colspan, table.error || 'Failed to load', { error: true });
    if (table.status === 'loading' || table.status === 'idle') return tableRow(colspan, 'Loading...');
    if (rows.length === 0) return tableRow(colspan, emptyMessage);
    return rows;
  };

  return (
    <main className="main-content" id="main-content">
      <div className="admin-container tabs" onClick={handleTableClick}>
        <h2>⚙️ Admin Panel</h2>

        <TabList tabs={tabs} label="Administration sections" />

        <TabPanel tabs={tabs} id="users">
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr><th>Username</th><th>Groups</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody id="usersTableBody">
                {renderTableBody('users', 4, 'No users found', tables.users.items.map(user => {
                  const roles = Array.isArray(user.roles) && user.roles.length > 0
                    ? user.roles
                    : user.role_name ? [{ name: user.role_name }] : [];
                  return (
                    <tr key={user.id}>
                      <td><strong>{user.username}</strong></td>
                      <td>
                        {roles.length > 0
                          ? roles.map(role => (
                            <span key={role.name} className={`badge ${badgeClass(role.name)}`}>{role.name}</span>
                          ))
                          : <span className="text-muted">No groups</span>}
                      </td>
                      <td>{user.created_at ? new Date(user.created_at).toLocaleDateString('zh-TW') : '-'}</td>
                      <td className="actions">
                        <button {...actionButtonProps('edit-user', user.id)}>Edit Groups</button>
                        <button {...actionButtonProps('delete-user', user.id, 'btn-danger')}>Delete</button>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel tabs={tabs} id="groups">
          <div className="admin-toolbar">
            <button
              id="createGroupBtn"
              className="btn btn-primary"
              type="button"
              onClick={() => setGroupEdit({ id: null, name: '', description: '', error: '' })}
            >
              + Create Group
            </button>
          </div>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr><th>Name</th><th>Description</th><th>Users</th><th>Actions</th></tr>
              </thead>
              <tbody id="groupsTableBody">
                {renderTableBody('groups', 4, 'No groups found', tables.groups.items.map(group => (
                  <tr key={group.id}>
                    <td><span className={`badge ${badgeClass(group.name)}`}>{group.name}</span></td>
                    <td>{group.description || '-'}</td>
                    <td>{group.user_count}</td>
                    <td className="actions">
                      <button {...actionButtonProps('edit-group', group.id)}>Edit</button>
                      <button {...actionButtonProps('delete-group', group.id, 'btn-danger')}>Delete</button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel tabs={tabs} id="connections">
          <div className="admin-toolbar">
            <button
              id="createConnectionBtn"
              className="btn btn-primary"
              type="button"
              onClick={async () => {
                await ensureAccessData();
                setConnectionEdit({
                  id: null,
                  name: '',
                  slug: '',
                  targetUrl: '',
                  description: '',
                  enabled: true,
                  hidden: false,
                  legacyRouting: false,
                  roleIds: [],
                  userIds: [],
                  error: '',
                });
              }}
            >
              + Add Website
            </button>
          </div>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr><th>Name</th><th>Target</th><th>Allowed Access</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody id="connectionsTableBody">
                {renderTableBody('connections', 5, 'No website connections configured', tables.connections.items.map(connection => {
                  const access = [
                    ...(connection.roles || []).map(role => `Group: ${role.name}`),
                    ...(connection.users || []).map(user => `User: ${user.username}`),
                  ];
                  return (
                    <tr key={connection.id}>
                      <td>
                        <strong>{connection.name}</strong>
                        <div className="table-subtext">{`/connect/${connection.slug}/`}</div>
                      </td>
                      <td><span className="mono target-url">{connection.target_url}</span></td>
                      <td>
                        {access.length
                          ? access.map(item => <span key={item} className="access-label">{item}</span>)
                          : <span className="text-muted">Admins only</span>}
                      </td>
                      <td>
                        <span className={`badge ${connection.enabled ? 'badge-enabled' : 'badge-disabled'}`}>
                          {connection.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {connection.hidden && <span className="badge badge-hidden">Hidden</span>}
                      </td>
                      <td className="actions">
                        {connection.enabled && (
                          <a
                            className="btn btn-sm btn-outline"
                            href={`/connect/${encodeURIComponent(connection.slug)}/`}
                            target="_blank"
                            rel="noopener"
                          >
                            Open
                          </a>
                        )}
                        <button {...actionButtonProps('edit-connection', connection.id)}>Edit</button>
                        <button {...actionButtonProps('delete-connection', connection.id, 'btn-danger')}>Delete</button>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel tabs={tabs} id="page-visibility">
          <div className="admin-toolbar page-visibility-toolbar">
            <p className="table-subtext">Choose who can see each website subpage in navigation and dashboard links.</p>
          </div>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Page</th><th>Guest</th><th>All signed-in users</th><th>Groups</th><th>Users</th><th>Actions</th>
                </tr>
              </thead>
              <tbody id="pageVisibilityTableBody">
                {renderTableBody('pageVisibility', 6, 'No configurable pages found', tables.pageVisibility.items.map(page => (
                  <tr key={page.key}>
                    <td>
                      <strong>{page.name}</strong>
                      <div className="table-subtext mono">{page.path}</div>
                    </td>
                    <td>
                      <span className={`badge ${page.public_access ? 'badge-enabled' : 'badge-disabled'}`}>
                        {page.public_access ? 'Shown' : 'Hidden'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${page.authenticated_access ? 'badge-enabled' : 'badge-disabled'}`}>
                        {page.authenticated_access ? 'Shown' : 'Hidden'}
                      </span>
                    </td>
                    <td>{page.roles?.map(role => role.name).join(', ') || '-'}</td>
                    <td>{page.users?.map(user => user.username).join(', ') || '-'}</td>
                    <td className="actions">
                      <button {...actionButtonProps('edit-page-visibility', page.key)}>Edit</button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel tabs={tabs} id="guilds">
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Guild</th><th>Language</th><th>Admins</th><th>Log Channel</th>
                  <th>Roller Channel</th><th>Voice Channels</th><th>Actions</th>
                </tr>
              </thead>
              <tbody id="guildsTableBody">
                {renderTableBody('guilds', 7, 'No Discord guilds found', tables.guilds.items.map(guild => {
                  const rollerChannel = guild.roller_channel_id
                    ? `${guild.roller_channel_id} (${guild.roller_dm_result === 1 ? 'DM' : 'Channel'})`
                    : '';
                  return (
                    <tr key={guild.guild_id}>
                      <td>
                        <strong>{guild.guild_name || `Guild ${guild.guild_id}`}</strong>
                        <div className="table-subtext mono">{guild.guild_id}</div>
                      </td>
                      <td>{guild.language === 'zh_TW' ? '中文' : guild.language}</td>
                      <td>{guild.admin_count}</td>
                      <td><span className={guild.log_channel_id ? 'mono' : 'text-muted'}>{guild.log_channel_id || '-'}</span></td>
                      <td><span className={rollerChannel ? 'mono' : 'text-muted'}>{rollerChannel || '-'}</span></td>
                      <td>{guild.voice_channel_count}</td>
                      <td className="actions">
                        <button {...actionButtonProps('guild-detail', guild.guild_id)}>Details</button>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel tabs={tabs} id="events">
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr><th>Event</th><th>Guild</th><th>Start</th><th>Participants</th><th>Visibility</th><th>Actions</th></tr>
              </thead>
              <tbody id="eventsTableBody">
                {renderTableBody('events', 6, 'No events found', tables.events.items.map(event => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      <div className="table-subtext">{event.creator_username}</div>
                    </td>
                    <td>
                      <strong>{event.guild_name || `Guild ${event.guild_id}`}</strong>
                      <div className="table-subtext mono">{event.guild_id}</div>
                    </td>
                    <td>{event.start_at ? formatUtc8(event.start_at) : '-'}</td>
                    <td>{String(event.participant_count || 0)}</td>
                    <td>
                      <span className={`badge ${event.visible ? 'badge-enabled' : 'badge-disabled'}`}>
                        {event.visible ? 'Visible' : 'Hidden'}
                      </span>
                    </td>
                    <td className="actions">
                      <button {...actionButtonProps('toggle-event-visibility', event.id)}>
                        {event.visible ? 'Hide' : 'Show'}
                      </button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel tabs={tabs} id="stats">
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr><th>Guild</th><th>Commands (30d)</th><th>Voice joins (30d)</th><th>Last activity</th></tr>
              </thead>
              <tbody id="statsTableBody">
                {renderTableBody('stats', 4, 'No activity recorded yet', tables.stats.items.map(item => (
                  <tr key={item.guild_id}>
                    <td className="mono">{item.guild_id}</td>
                    <td>{String(item.command_count || 0)}</td>
                    <td>{String(item.voice_joins || 0)}</td>
                    <td>{item.last_day ? new Date(item.last_day).toLocaleDateString() : '-'}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel tabs={tabs} id="announcements">
          <form id="announcementForm" className="admin-toolbar" onSubmit={scheduleAnnouncement}>
            <select
              id="announcementGuild"
              required
              disabled={targets.length === 0}
              value={announcementForm.guildId}
              onChange={event => setAnnouncementForm({
                ...announcementForm,
                guildId: event.target.value,
                channelId: '',
              })}
            >
              <option value="">{targets.length ? 'Select Discord server' : 'No Discord servers available'}</option>
              {targets.map(guild => (
                <option key={guild.guild_id} value={guild.guild_id}>
                  {guild.guild_name || `Guild ${guild.guild_id}`}
                </option>
              ))}
            </select>
            <select
              id="announcementChannel"
              required
              disabled={channelOptions.length === 0}
              value={announcementForm.channelId}
              onChange={event => setAnnouncementForm({ ...announcementForm, channelId: event.target.value })}
            >
              <option value="">{channelOptions.length ? 'Select channel' : 'No text channels available'}</option>
              {channelOptions.map(channel => (
                <option key={channel.channel_id} value={channel.channel_id}>
                  {`#${channel.channel_name}`}
                </option>
              ))}
            </select>
            <input
              id="announcementContent"
              placeholder="Announcement"
              maxLength="2000"
              required
              value={announcementForm.content}
              onChange={event => setAnnouncementForm({ ...announcementForm, content: event.target.value })}
            />
            <label htmlFor="announcementTime">Scheduled time (UTC+8)</label>
            <input
              id="announcementTime"
              type="datetime-local"
              required
              value={announcementForm.scheduledAt}
              onChange={event => setAnnouncementForm({ ...announcementForm, scheduledAt: event.target.value })}
            />
            <button className="btn btn-primary" type="submit" disabled={saveAction.busy}>Schedule</button>
          </form>
          <StatusMessage id="announcementStatus" message={announcementStatus.message} tone={announcementStatus.tone} />
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr><th>Guild</th><th>Channel</th><th>Content</th><th>Scheduled</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody id="announcementsTableBody">
                {renderTableBody('announcements', 6, 'No announcements found', tables.announcements.items.map(item => (
                  <tr key={item.id}>
                    <td className="mono">{item.guild_id}</td>
                    <td className="mono">{item.channel_id}</td>
                    <td>{item.content}</td>
                    <td>{item.scheduled_at ? formatUtc8(item.scheduled_at) : '-'}</td>
                    <td>{item.status}</td>
                    <td className="actions">
                      {item.status === 'scheduled' && (
                        <button {...actionButtonProps('cancel-announcement', item.id, 'btn-danger')}>Cancel</button>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </TabPanel>
      </div>

      <Modal open={Boolean(userEdit)} labelledBy="userEditModalTitle" onClose={() => setUserEdit(null)}>
        <div className="modal-header">
          <h3 id="userEditModalTitle">Edit User Groups</h3>
          <button className="modal-close" type="button" data-dialog-close title="Close" onClick={() => setUserEdit(null)}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="editUserUsername">Username</label>
            <input type="text" id="editUserUsername" value={userEdit?.username || ''} disabled readOnly />
          </div>
          <div className="form-group">
            <label>Groups</label>
            <div id="editUserRoles" className="access-option-list">
              {groups.length > 0
                ? groups.map(group => (
                  <AccessOption
                    key={group.id}
                    name="userGroup"
                    value={group.id}
                    label={group.name}
                    checked={userEdit?.roleIds.includes(String(group.id)) || false}
                    onChange={event => setUserEdit(current => ({
                      ...current,
                      roleIds: event.target.checked
                        ? [...current.roleIds, String(group.id)]
                        : current.roleIds.filter(value => String(value) !== String(group.id)),
                    }))}
                  />
                ))
                : <span className="text-muted">No groups available</span>}
            </div>
          </div>
          <StatusMessage className="error-msg" id="userEditError" message={userEdit?.error || ''} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" type="button" data-dialog-close onClick={() => setUserEdit(null)}>Cancel</button>
          <button className="btn btn-primary" id="saveUserGroupsBtn" type="button" disabled={saveAction.busy} onClick={updateUserGroups}>
            Save
          </button>
        </div>
      </Modal>

      <Modal open={Boolean(groupEdit)} labelledBy="groupModalTitle" onClose={() => setGroupEdit(null)}>
        <div className="modal-header">
          <h3 id="groupModalTitle">{groupEdit?.id ? 'Edit Group' : 'Create Group'}</h3>
          <button className="modal-close" type="button" data-dialog-close title="Close" onClick={() => setGroupEdit(null)}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="editGroupName">Name</label>
            <input
              type="text"
              id="editGroupName"
              placeholder="Group name (e.g. moderator)"
              maxLength="50"
              value={groupEdit?.name || ''}
              onChange={event => setGroupEdit(current => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="editGroupDesc">Description</label>
            <input
              type="text"
              id="editGroupDesc"
              placeholder="Short description"
              maxLength="255"
              value={groupEdit?.description || ''}
              onChange={event => setGroupEdit(current => ({ ...current, description: event.target.value }))}
            />
          </div>
          <StatusMessage className="error-msg" id="groupEditError" message={groupEdit?.error || ''} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" type="button" data-dialog-close onClick={() => setGroupEdit(null)}>Cancel</button>
          <button className="btn btn-primary" id="saveGroupBtn" type="button" disabled={saveAction.busy} onClick={saveGroup}>
            {groupEdit?.id ? 'Save' : 'Create'}
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(connectionEdit)}
        labelledBy="connectionModalTitle"
        className="connection-modal"
        onClose={() => setConnectionEdit(null)}
      >
        <div className="modal-header">
          <h3 id="connectionModalTitle">{connectionEdit?.id ? 'Edit Website' : 'Add Website'}</h3>
          <button className="modal-close" type="button" data-dialog-close title="Close" onClick={() => setConnectionEdit(null)}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="editConnectionName">Name</label>
            <input
              type="text"
              id="editConnectionName"
              maxLength="80"
              placeholder="Internal dashboard"
              value={connectionEdit?.name || ''}
              onChange={event => setConnectionEdit(current => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="editConnectionSlug">URL slug</label>
            <input
              type="text"
              id="editConnectionSlug"
              maxLength="50"
              placeholder="internal-dashboard"
              value={connectionEdit?.slug || ''}
              onChange={event => setConnectionEdit(current => ({ ...current, slug: event.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="editConnectionTarget">Target URL</label>
            <input
              type="url"
              id="editConnectionTarget"
              maxLength="2048"
              placeholder="http://localhost:8080/"
              value={connectionEdit?.targetUrl || ''}
              onChange={event => setConnectionEdit(current => ({ ...current, targetUrl: event.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="editConnectionDesc">Description</label>
            <input
              type="text"
              id="editConnectionDesc"
              maxLength="255"
              placeholder="Short description shown to allowed users"
              value={connectionEdit?.description || ''}
              onChange={event => setConnectionEdit(current => ({ ...current, description: event.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Allowed groups</label>
            <div id="connectionRoleOptions" className="access-option-list">
              {groups.length > 0
                ? groups.map(group => (
                  <AccessOption
                    key={group.id}
                    name="connectionRole"
                    value={group.id}
                    label={group.name}
                    checked={connectionEdit?.roleIds.includes(String(group.id)) || false}
                    onChange={event => toggleConnectionRole(group.id, event.target.checked)}
                  />
                ))
                : <span className="text-muted">No groups available</span>}
            </div>
          </div>
          <div className="form-group">
            <label>Allowed users</label>
            <div id="connectionUserOptions" className="access-option-list">
              {users.length > 0
                ? users.map(user => (
                  <AccessOption
                    key={user.id}
                    name="connectionUser"
                    value={user.id}
                    label={user.username}
                    checked={connectionEdit?.userIds.includes(String(user.id)) || false}
                    onChange={event => toggleConnectionUser(user.id, event.target.checked)}
                  />
                ))
                : <span className="text-muted">No users available</span>}
            </div>
          </div>
          <label className="toggle-row" htmlFor="editConnectionEnabled">
            <input
              type="checkbox"
              id="editConnectionEnabled"
              checked={connectionEdit?.enabled || false}
              onChange={event => setConnectionEdit(current => ({ ...current, enabled: event.target.checked }))}
            />
            <span>Enabled</span>
          </label>
          <label className="toggle-row" htmlFor="editConnectionHidden">
            <input
              type="checkbox"
              id="editConnectionHidden"
              checked={connectionEdit?.hidden || false}
              onChange={event => setConnectionEdit(current => ({ ...current, hidden: event.target.checked }))}
            />
            <span>Hidden from Connected websites</span>
          </label>
          <label className="toggle-row" htmlFor="editConnectionLegacyRouting">
            <input
              type="checkbox"
              id="editConnectionLegacyRouting"
              checked={connectionEdit?.legacyRouting || false}
              onChange={event => setConnectionEdit(current => ({ ...current, legacyRouting: event.target.checked }))}
            />
            <span>Use legacy proxy routing</span>
          </label>
          <StatusMessage className="error-msg" id="connectionEditError" message={connectionEdit?.error || ''} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" type="button" data-dialog-close onClick={() => setConnectionEdit(null)}>Cancel</button>
          <button className="btn btn-primary" type="button" id="saveConnectionBtn" disabled={saveAction.busy} onClick={saveConnection}>
            Save
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(pageEdit)}
        labelledBy="pageVisibilityModalTitle"
        className="connection-modal"
        onClose={() => setPageEdit(null)}
      >
        <div className="modal-header">
          <h3 id="pageVisibilityModalTitle">Edit Page Visibility</h3>
          <button className="modal-close" type="button" data-dialog-close title="Close" onClick={() => setPageEdit(null)}>&times;</button>
        </div>
        <div className="modal-body">
          <p id="pageVisibilityPath" className="table-subtext">{pageEdit?.path}</p>
          <label className="toggle-row" htmlFor="editPageVisibilityPublic">
            <input
              type="checkbox"
              id="editPageVisibilityPublic"
              checked={pageEdit?.publicAccess || false}
              onChange={event => setPageEdit(current => ({ ...current, publicAccess: event.target.checked }))}
            />
            <span>Show to non-logged-in visitors</span>
          </label>
          <label className="toggle-row" htmlFor="editPageVisibilityAuthenticated">
            <input
              type="checkbox"
              id="editPageVisibilityAuthenticated"
              checked={pageEdit?.authenticatedAccess || false}
              onChange={event => setPageEdit(current => ({ ...current, authenticatedAccess: event.target.checked }))}
            />
            <span>Show to all signed-in users</span>
          </label>
          <div className="form-group">
            <label>Website groups</label>
            <div id="pageVisibilityRoleOptions" className="access-option-list">
              {groups.length > 0
                ? groups.map(group => (
                  <AccessOption
                    key={group.id}
                    name="pageVisibilityRole"
                    value={group.id}
                    label={group.name}
                    checked={pageEdit?.roleIds.includes(String(group.id)) || false}
                    onChange={event => setPageEdit(current => ({
                      ...current,
                      roleIds: event.target.checked
                        ? [...current.roleIds, String(group.id)]
                        : current.roleIds.filter(value => String(value) !== String(group.id)),
                    }))}
                  />
                ))
                : <span className="text-muted">No groups available</span>}
            </div>
          </div>
          <div className="form-group">
            <label>Website users</label>
            <div id="pageVisibilityUserOptions" className="access-option-list">
              {users.length > 0
                ? users.map(user => (
                  <AccessOption
                    key={user.id}
                    name="pageVisibilityUser"
                    value={user.id}
                    label={user.username}
                    checked={pageEdit?.userIds.includes(String(user.id)) || false}
                    onChange={event => setPageEdit(current => ({
                      ...current,
                      userIds: event.target.checked
                        ? [...current.userIds, String(user.id)]
                        : current.userIds.filter(value => String(value) !== String(user.id)),
                    }))}
                  />
                ))
                : <span className="text-muted">No users available</span>}
            </div>
          </div>
          <StatusMessage className="error-msg" id="pageVisibilityEditError" message={pageEdit?.error || ''} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" type="button" data-dialog-close onClick={() => setPageEdit(null)}>Cancel</button>
          <button className="btn btn-primary" type="button" id="savePageVisibilityBtn" disabled={saveAction.busy} onClick={savePageVisibility}>
            Save
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(guildDetail)}
        labelledBy="guildDetailModalTitle"
        onClose={() => setGuildDetail(null)}
      >
        <div className="modal-header">
          <h3 id="guildDetailModalTitle">Guild Details</h3>
          <button className="modal-close" type="button" data-dialog-close title="Close" onClick={() => setGuildDetail(null)}>&times;</button>
        </div>
        <div className="modal-body" id="guildDetailContent">
          {guildDetail?.status === 'loading' && <p>Loading...</p>}
          {guildDetail?.status === 'error' && (
            <p className="status-error" role="alert">Failed to load guild details</p>
          )}
          {guildDetail?.status === 'ready' && (() => {
            const guild = guildDetail.guild;
            const admins = Array.isArray(guild.admin_ids) ? guild.admin_ids : [];
            const voiceChannels = Array.isArray(guild.voice_channels) ? guild.voice_channels : [];
            const infoItem = (label, value, className = '') => (
              <div className="guild-info-item">
                <div className="label">{label}</div>
                <div className={`value ${className}`.trim()}>{value}</div>
              </div>
            );
            return (
              <>
                <div className="guild-info-card">
                  <h3>General</h3>
                  <div className="guild-info-grid">
                    {infoItem('Guild', guild.guild_name || `Guild ${guild.guild_id}`)}
                    {infoItem('Guild ID', guild.guild_id, 'mono')}
                    {infoItem('Language', guild.language)}
                    {infoItem('Guild Admins', `${admins.length} admins`)}
                  </div>
                </div>
                <div className="guild-info-card">
                  <h3>Channels</h3>
                  <div className="guild-info-grid">
                    {infoItem('Log Channel', guild.log_channel_id || 'Not set', 'mono')}
                    {infoItem('Roller Channel', guild.roller_channel_id || 'Not set', 'mono')}
                    {infoItem('Roller DM Mode', guild.roller_dm_result === 1 ? 'DM result' : 'Channel result')}
                  </div>
                </div>
                <div className="guild-info-card">
                  <h3>Admin User IDs</h3>
                  {admins.length === 0
                    ? <p className="text-muted">No guild admins configured</p>
                    : (
                      <ul className="voice-channel-list">
                        {admins.map(id => (
                          <li key={id}><span className="mono">{id}</span></li>
                        ))}
                      </ul>
                    )}
                </div>
                <div className="guild-info-card">
                  <h3>{`Private Voice Channels (${voiceChannels.length})`}</h3>
                  {voiceChannels.length === 0
                    ? <p className="text-muted">No private voice channels</p>
                    : (
                      <ul className="voice-channel-list">
                        {voiceChannels.map(channel => (
                          <li key={channel.channel_id}>
                            <span>Channel: <span className="mono">{channel.channel_id}</span></span>
                            <span className="vc-owner">{`Owner: ${channel.owner_id}`}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              </>
            );
          })()}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" type="button" data-dialog-close onClick={() => setGuildDetail(null)}>Close</button>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        labelledBy="confirmTitle"
        overlayClassName="confirm-overlay"
        className="confirm-box"
        onClose={() => setConfirm(null)}
      >
        <h3 id="confirmTitle">{confirm?.title}</h3>
        <p id="confirmMsg">{confirm?.message}</p>
        <div className="btn-group">
          <button className="btn btn-outline" type="button" data-dialog-close onClick={() => setConfirm(null)}>Cancel</button>
          <button
            className="btn btn-danger"
            id="confirmOkBtn"
            type="button"
            disabled={saveAction.busy}
            onClick={() => saveAction.run(async () => {
              const callback = confirm?.onConfirm;
              setConfirm(null);
              await callback?.();
            })}
          >
            Delete
          </button>
        </div>
      </Modal>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
