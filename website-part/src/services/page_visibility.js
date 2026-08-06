const PAGE_DEFINITIONS = Object.freeze([
  { key: 'roller', name: 'R6 Roller', path: '/roller.html' },
  { key: 'events', name: 'Events', path: '/events.html' },
  { key: 'account', name: 'Account', path: '/account.html' },
  { key: 'remote', name: 'Remote', path: '/remote.html' },
  { key: 'chromium', name: 'Chromium', path: '/chromium.html' },
]);

const PAGE_KEYS = new Set(PAGE_DEFINITIONS.map(page => page.key));

class PageVisibilityInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PageVisibilityInputError';
    this.statusCode = 400;
  }
}

function pageDefinition(pageKey) {
  const key = typeof pageKey === 'string' ? pageKey.trim().toLowerCase() : '';
  return PAGE_KEYS.has(key) ? PAGE_DEFINITIONS.find(page => page.key === key) : null;
}

function normalizeIds(values, label, pattern = null) {
  if (!Array.isArray(values)) throw new PageVisibilityInputError(`${label} must be an array`);
  const normalized = values.map(value => {
    if (pattern && (typeof value !== 'string' || !pattern.test(value))) {
      throw new PageVisibilityInputError(`${label} contains an invalid ID`);
    }
    const number = Number(value);
    if (!pattern && (!Number.isInteger(number) || number < 1)) {
      throw new PageVisibilityInputError(`${label} contains an invalid ID`);
    }
    return pattern ? value : number;
  });
  return [...new Set(normalized)];
}

function normalizePageVisibility(pageKey, input) {
  const page = pageDefinition(pageKey);
  if (!page) throw new PageVisibilityInputError('Unknown website page');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PageVisibilityInputError('Invalid page visibility data');
  }
  for (const [field, label] of [
    ['public_access', 'Public access'],
    ['authenticated_access', 'Authenticated access'],
  ]) {
    if (typeof input[field] !== 'boolean') {
      throw new PageVisibilityInputError(`${label} must be a boolean`);
    }
  }

  return {
    page_key: page.key,
    public_access: input.public_access,
    authenticated_access: input.authenticated_access,
    role_ids: normalizeIds(input.role_ids || [], 'Group IDs'),
    user_ids: normalizeIds(input.user_ids || [], 'User IDs', /^[A-Za-z0-9_-]{1,30}$/),
  };
}

module.exports = {
  PAGE_DEFINITIONS,
  PageVisibilityInputError,
  normalizePageVisibility,
  pageDefinition,
};
