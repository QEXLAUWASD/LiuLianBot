const { apiCatalog } = require('./api_catalog');
const string = { type: 'string' };
const boolean = { type: 'boolean' };
const integer = { type: 'integer' };
const strings = { type: 'array', items: string };
const integers = { type: 'array', items: integer };
const object = properties => ({ type: 'object', properties, additionalProperties: false });
const remote = object({ host: string, port: integer, username: string, domain: string, privateKey: string });
const connection = object({ name: string, slug: string, target_url: string, description: string, enabled: boolean,
  hidden: boolean, legacy_proxy_routing: boolean, role_ids: integers, user_ids: strings });
const bodies = {
  'POST auth/login': object({ username: string, password: string, remember: boolean }),
  'POST auth/register': object({ username: string, password: string, termsAccepted: boolean }),
  'POST auth/terms': object({ termsAccepted: { type: 'boolean', enum: [true] } }),
  'PUT auth/username': object({ username: string, currentPassword: string }),
  'PUT auth/password': object({ currentPassword: string, newPassword: string, confirmPassword: string }),
  'POST events': object({ guildId: string, channelId: { type: 'string', nullable: true }, title: string,
    description: string, mode: string, startAt: { type: 'string', format: 'date-time' }, maxPlayers: integer }),
  'POST files/shared/list': object({ code: string, path: string }),
  'POST files/shared/download': object({ code: string, path: string }),
  'POST files/shared/archive': object({ code: string, paths: strings }),
  'POST files/shared/archive-all': object({ code: string }),
  'POST files/archive': object({ paths: strings, name: string }),
  'PUT files/permissions': object({ username: string, read: boolean, write: boolean, share: boolean }),
  'POST files/shares': object({ path: string, hours: integer }),
  'POST files/folder': object({ path: string }),
  'POST files/rename': object({ from: string, to: string }),
  'DELETE files/entry': object({ path: string }),
  'PUT admin/users/:id': object({ role_ids: integers }),
  'POST admin/groups': object({ name: string, description: string }),
  'PUT admin/groups/:id': object({ name: string, description: string }),
  'POST admin/connections': connection,
  'PUT admin/connections/:id': connection,
  'PUT admin/events/:id/visibility': object({ visible: boolean }),
  'POST admin/announcements': object({ guildId: string, channelId: string, content: string,
    scheduledAt: { type: 'string', format: 'date-time' } }),
  'PUT admin/page-visibility/:pageKey': object({ public_access: boolean, authenticated_access: boolean, role_ids: integers, user_ids: strings }),
  'PUT guild-manager/guilds/:guildId': object({ language: { type: 'string', enum: ['en', 'zh_TW'] },
    log_channels: { type: 'object', additionalProperties: string }, private_voice_trigger_channel_id: { type: 'string', nullable: true } }),
  'PUT remote-profile': object({ ssh: { ...remote, nullable: true }, rdp: { ...remote, nullable: true } }),
  'POST rdp/download': object({ host: string, port: integer, username: string, domain: string }),
  'POST rdp/profiles': object({ name: string, host: string, port: integer, username: string, domain: string, password: string }),
  'PUT rdp/profiles/:id': object({ name: string, host: string, port: integer, username: string, domain: string, password: string }),
  'POST vless-tunnel/generate': object({ format: { type: 'string', enum: ['vless', 'clash'] }, source: string }),
};
const requiredFields = {
  'POST auth/login': ['username', 'password'], 'POST auth/register': ['username', 'password'],
  'POST auth/terms': ['termsAccepted'], 'PUT auth/username': ['username', 'currentPassword'],
  'PUT auth/password': ['currentPassword', 'newPassword', 'confirmPassword'],
  'POST events': ['guildId', 'title', 'startAt'],
  'POST files/shared/list': ['code'], 'POST files/shared/download': ['code'],
  'POST files/shared/archive': ['code', 'paths'], 'POST files/shared/archive-all': ['code'],
  'POST files/archive': ['paths'], 'PUT files/permissions': ['username', 'read', 'write', 'share'],
  'POST files/shares': ['path', 'hours'], 'POST files/folder': ['path'],
  'POST files/rename': ['from', 'to'], 'DELETE files/entry': ['path'],
  'PUT admin/users/:id': ['role_ids'], 'POST admin/groups': ['name'], 'PUT admin/groups/:id': ['name'],
  'POST admin/connections': ['name', 'slug', 'target_url'], 'PUT admin/connections/:id': ['name', 'slug', 'target_url'],
  'PUT admin/events/:id/visibility': ['visible'], 'POST admin/announcements': ['guildId', 'channelId', 'content', 'scheduledAt'],
  'PUT admin/page-visibility/:pageKey': ['public_access', 'authenticated_access'],
  'PUT guild-manager/guilds/:guildId': ['language', 'log_channels'],
  'POST rdp/download': ['host', 'username'], 'POST rdp/profiles': ['name', 'host', 'username'],
  'PUT rdp/profiles/:id': ['name', 'host', 'username'], 'POST vless-tunnel/generate': ['format', 'source'],
};
for (const [key, fields] of Object.entries(requiredFields)) bodies[key].required = fields;
const queries = { 'GET roller/operator': ['side'], 'GET events': ['guildId'], 'GET files/list': ['path'],
  'GET files/download': ['path'], 'PUT files/upload': ['path'] };
const publicOperations = new Set(['POST auth/login', 'POST auth/register', 'POST auth/logout', 'GET auth/me',
  'GET auth/terms-status', 'GET auth/terms-document', 'GET page-visibility']);
function createOpenApi(cookieName = 'connect.sid') {
  const paths = {};
  for (const [group, operations] of Object.entries(apiCatalog.http)) {
    for (const { method, path } of operations) {
      const relative = path.slice(5);
      const key = `${method} ${relative}`;
      const normalized = path.replace(/:([A-Za-z]+)/g, '{$1}');
      const binary = relative.includes('download') || relative.includes('archive') || relative === 'rdp/download';
      const parameters = [...path.matchAll(/:([A-Za-z]+)/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: string }));
      for (const name of queries[key] || []) parameters.push({ name, in: 'query', required: relative === 'files/upload' || relative === 'files/download', schema: string });
      if (group === 'files' && method !== 'GET') parameters.push({ name: 'X-Files-Request', in: 'header', required: true, schema: { type: 'string', enum: ['1'] } });
      const operation = {
        tags: [group], operationId: `${method.toLowerCase()}_${relative.replace(/[^a-z0-9]/gi, '_')}`,
        summary: `${method} ${path}`, description: 'Request fields and permissions are described in docs/API.md. Authorization is enforced by the endpoint, not this discovery document.',
        security: publicOperations.has(key) || group === 'roller' || relative.startsWith('files/shared/') ? [] : [{ session: [] }],
        parameters,
        responses: {
          200: { description: binary ? 'Streamed file or ZIP; Content-Disposition supplies the filename.' : 'Successful JSON response; exact response fields are documented in docs/API.md.', content: { [binary ? 'application/octet-stream' : 'application/json']: { schema: binary ? { type: 'string', format: 'binary' } : { type: 'object' } } } },
          201: { description: 'Created (JSON for records; plain text for folder/upload).' },
          204: { description: 'Completed without a response body.' },
          ...Object.fromEntries([400, 401, 403, 404, 409, 413, 429, 500, 502, 503].map(code => [code, { description: `HTTP ${code}`, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }])),
        },
      };
      if (bodies[key]) operation.requestBody = { required: true, content: { 'application/json': { schema: bodies[key] } } };
      if (key === 'PUT files/upload') operation.requestBody = { required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } };
      if (relative === 'mobile/connect/:slug') operation.responses = {
        302: { description: 'Legacy browser redirect to the authorized proxy path.', headers: { Location: { schema: string } } },
        401: operation.responses[401], 403: operation.responses[403], 404: operation.responses[404],
      };
      paths[normalized] ||= {};
      paths[normalized][method.toLowerCase()] = operation;
    }
  }
  for (const endpoint of ['capabilities', 'openapi']) paths[`/api/mobile/${endpoint}`] = { get: {
    operationId: `get_mobile_${endpoint}`, tags: ['discovery'], security: [], responses: { 200: { description: 'Public API discovery document', content: { 'application/json': { schema: { type: 'object' } } } } },
  } };
  paths['/healthz'] = { get: { operationId: 'get_health', tags: ['health'], security: [], responses: { 200: { description: 'Database ready' }, 503: { description: 'Database unavailable' } } } };
  return {
    openapi: '3.0.3', info: { title: 'LiuLianBot website and native API', version: '1.0.0' },
    servers: [{ url: '/' }], paths,
    components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: cookieName } }, schemas: { Error: object({ error: string, code: string, requestId: string }) } },
    'x-realtime': apiCatalog.realtime,
  };
}
module.exports = { createOpenApi };
