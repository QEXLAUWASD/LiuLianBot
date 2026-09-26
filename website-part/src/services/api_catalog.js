// Public discovery metadata, not an authorization policy. Each handler remains
// responsible for session, group, ownership, destination and feature checks.
const groups = {
  discovery: ['GET mobile/capabilities', 'GET mobile/openapi'],
  account: [
    'POST auth/login', 'POST auth/register', 'POST auth/logout', 'GET auth/me',
    'GET auth/terms-status', 'GET auth/terms-document', 'POST auth/terms',
    'GET auth/discord-link', 'POST auth/discord-link', 'DELETE auth/discord-link',
    'PUT auth/username', 'PUT auth/password',
  ],
  roller: ['GET roller/operator', 'GET roller/map', 'GET roller/operators'],
  events: ['GET events', 'POST events', 'GET events/:id/participants', 'POST events/:id/join', 'POST events/:id/leave'],
  files: [
    'GET files/access', 'POST files/access/request', 'GET files/list', 'GET files/download',
    'POST files/archive', 'PUT files/upload', 'POST files/folder', 'POST files/rename',
    'DELETE files/entry', 'GET files/permissions', 'PUT files/permissions',
    'GET files/shares', 'POST files/shares', 'DELETE files/shares/:id',
    'POST files/shared/list', 'POST files/shared/download', 'POST files/shared/archive', 'POST files/shared/archive-all',
  ],
  connections: ['GET connections', 'GET mobile/connections/:slug', 'GET mobile/connect/:slug'],
  guildManager: ['GET guild-manager/guilds', 'GET guild-manager/guilds/:guildId', 'PUT guild-manager/guilds/:guildId'],
  admin: [
    'GET admin/users', 'PUT admin/users/:id', 'DELETE admin/users/:id',
    'GET admin/groups', 'POST admin/groups', 'PUT admin/groups/:id', 'DELETE admin/groups/:id',
    'GET admin/connections', 'POST admin/connections', 'PUT admin/connections/:id', 'DELETE admin/connections/:id',
    'GET admin/guilds', 'GET admin/guilds/:id', 'GET admin/stats',
    'GET admin/events', 'PUT admin/events/:id/visibility',
    'GET admin/announcement-targets', 'GET admin/announcements', 'POST admin/announcements', 'DELETE admin/announcements/:id',
    'GET admin/page-visibility', 'PUT admin/page-visibility/:pageKey',
  ],
  visibility: ['GET page-visibility'],
  remote: [
    'GET remote-profile', 'PUT remote-profile', 'DELETE remote-profile',
    'POST rdp/download', 'GET rdp/profiles', 'POST rdp/profiles',
    'GET rdp/profiles/:id', 'PUT rdp/profiles/:id', 'DELETE rdp/profiles/:id',
  ],
  vless: ['POST vless-tunnel/generate'],
};
const apiCatalog = {
  apiVersion: 1,
  http: Object.fromEntries(Object.entries(groups).map(([name, operations]) => [name, operations.map(value => {
    const [method, path] = value.split(' ');
    return { method, path: `/api/${path}` };
  })])),
  realtime: {
    ssh: { transport: 'websocket', path: '/api/ssh', messages: ['connect', 'input', 'resize', 'disconnect'] },
    chromium: { transport: 'websocket', path: '/api/chromium/ws', messages: ['open', 'navigate', 'input', 'close'] },
    rdp: { transport: 'socket.io', path: '/socket.io/', bitmapFormats: ['protocol', 'rgba'], events: ['infos', 'mouse', 'wheel', 'scancode', 'unicode'] },
  },
};
module.exports = { apiCatalog };
