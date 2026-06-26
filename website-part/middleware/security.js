/**
 * Security middleware — SQL injection defense layer.
 * Detects and blocks requests containing SQL injection patterns
 * before they reach route handlers.
 */

// ---------- SQL injection pattern blacklist ----------
const SQLI_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|UNION|MERGE)\b)/i,
  /(\b(INFORMATION_SCHEMA|SYS\.|sysobjects|syscolumns)\b)/i,
  /('|--|#|\/\*|\*\/|;)/,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  /(\bAND\b\s+\d+\s*=\s*\d+)/i,
  /(\\x[0-9a-fA-F]{2})/,
];

// ---------- Blocked SQL keywords in input ----------
const SQL_KEYWORDS = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER',
  'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE', 'UNION', 'MERGE',
  'INFORMATION_SCHEMA', 'BENCHMARK', 'SLEEP', 'WAITFOR',
];

/**
 * Check a single string value for SQL injection patterns.
 * Returns true if the value passes validation (clean), false if suspicious.
 */
function isValueClean(value) {
  if (typeof value !== 'string') return true; // numbers, booleans are fine
  if (value.length === 0) return true;

  // Check for SQL keywords (case-insensitive whole-word match)
  const upper = value.toUpperCase().trim();
  for (const kw of SQL_KEYWORDS) {
    // Use word-boundary regex to avoid false positives on names like "selection"
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(value)) return false;
  }

  // Check for SQL metacharacters
  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(value)) return false;
  }

  return true;
}

/**
 * Recursively scan an object's string values for SQL injection.
 * Returns { clean: true } or { clean: false, field, value }.
 */
function scanObject(obj, prefix = '') {
  if (obj === null || obj === undefined) return { clean: true };

  if (typeof obj === 'string') {
    if (!isValueClean(obj)) {
      return { clean: false, field: prefix || '(value)', value: obj.slice(0, 100) };
    }
    return { clean: true };
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = scanObject(obj[i], `${prefix}[${i}]`);
      if (!result.clean) return result;
    }
    return { clean: true };
  }

  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const result = scanObject(obj[key], prefix ? `${prefix}.${key}` : key);
      if (!result.clean) return result;
    }
    return { clean: true };
  }

  return { clean: true }; // numbers, booleans
}

// ---------- Express middleware ----------

/**
 * Middleware that scans req.body, req.query, and req.params for SQL injection patterns.
 * Blocks the request with 400 if suspicious input is detected.
 */
function sqlInjectionGuard(req, res, next) {
  const sources = [
    { name: 'body', data: req.body },
    { name: 'query', data: req.query },
    { name: 'params', data: req.params },
  ];

  for (const source of sources) {
    if (!source.data) continue;
    const result = scanObject(source.data, source.name);
    if (!result.clean) {
      console.warn(`[SECURITY] SQL injection blocked in ${result.field}: "${result.value}" from ${req.ip}`);
      return res.status(400).json({ error: 'Invalid input detected' });
    }
  }

  next();
}

module.exports = { sqlInjectionGuard, isValueClean, scanObject };
