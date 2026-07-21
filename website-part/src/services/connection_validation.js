class ConnectionInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConnectionInputError';
    this.statusCode = 400;
  }
}

function normalizeText(value, label, maxLength, required = true) {
  if (typeof value !== 'string') {
    throw new ConnectionInputError(`${label} must be a string`);
  }

  const normalized = value.trim();
  if (required && normalized.length === 0) {
    throw new ConnectionInputError(`${label} is required`);
  }
  if (normalized.length > maxLength) {
    throw new ConnectionInputError(`${label} must be ${maxLength} characters or less`);
  }
  return normalized;
}

function normalizeTargetUrl(value) {
  const raw = normalizeText(value, 'Target URL', 2048);
  let target;

  try {
    target = new URL(raw);
  } catch (_) {
    throw new ConnectionInputError('Target URL must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new ConnectionInputError('Target URL must use http:// or https://');
  }
  if (target.username || target.password) {
    throw new ConnectionInputError('Target URL must not contain credentials');
  }
  if (target.search || target.hash) {
    throw new ConnectionInputError('Target URL must not contain a query string or fragment');
  }

  if (!target.pathname.endsWith('/')) target.pathname += '/';
  return target.toString();
}

function normalizeIntegerIds(values, label) {
  if (!Array.isArray(values)) {
    throw new ConnectionInputError(`${label} must be an array`);
  }

  const normalized = values.map(value => Number(value));
  if (normalized.some(value => !Number.isInteger(value) || value < 1)) {
    throw new ConnectionInputError(`${label} contains an invalid ID`);
  }
  return [...new Set(normalized)];
}

function normalizeUserIds(values) {
  if (!Array.isArray(values)) {
    throw new ConnectionInputError('User IDs must be an array');
  }

  const normalized = values.map(value => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,30}$/.test(value)) {
      throw new ConnectionInputError('User IDs contains an invalid ID');
    }
    return value;
  });
  return [...new Set(normalized)];
}

function normalizeConnectionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ConnectionInputError('Invalid connection data');
  }

  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new ConnectionInputError('Enabled must be a boolean');
  }

  const slug = normalizeText(input.slug, 'Slug', 50).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug)) {
    throw new ConnectionInputError('Slug may only contain lowercase letters, numbers, and hyphens');
  }

  return {
    name: normalizeText(input.name, 'Name', 80),
    slug,
    target_url: normalizeTargetUrl(input.target_url),
    description: normalizeText(input.description || '', 'Description', 255, false),
    enabled: input.enabled === undefined ? true : input.enabled === true,
    role_ids: normalizeIntegerIds(input.role_ids || [], 'Role IDs'),
    user_ids: normalizeUserIds(input.user_ids || []),
  };
}

module.exports = {
  ConnectionInputError,
  normalizeConnectionInput,
  normalizeTargetUrl,
};
