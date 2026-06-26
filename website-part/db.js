/**
 * Shared MySQL database module for website-part.
 * Reads connection settings from shared/database/config.json.
 *
 * All queries use parameterized statements (mysql2 .execute with ? placeholders).
 * Input values are validated before reaching the database.
 */
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'shared', 'database', 'config.json');

// ---------- input validation ----------

/** Characters / patterns that must never appear in query parameters */
const FORBIDDEN_IN_INPUT = /['";\\]/;

/** Maximum length for string-type parameters */
const MAX_STRING_LEN = 255;

/**
 * Validate and sanitize a string value intended for a database query.
 * Throws if the value is clearly malicious; returns trimmed string otherwise.
 */
function validateString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`[DB] ${label}: expected string, got ${typeof value}`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`[DB] ${label}: cannot be empty`);
  }
  if (trimmed.length > MAX_STRING_LEN) {
    throw new Error(`[DB] ${label}: exceeds max length (${MAX_STRING_LEN})`);
  }
  if (FORBIDDEN_IN_INPUT.test(trimmed)) {
    throw new Error(`[DB] ${label}: contains forbidden characters`);
  }
  return trimmed;
}

let pool = null;

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw);
  // Support both "mysql" and "mysql_config" keys
  return config.mysql || config.mysql_config || {};
}

async function getPool() {
  if (pool) return pool;

  const cfg = loadConfig();
  pool = mysql.createPool({
    host: cfg.host || 'localhost',
    user: cfg.user || 'root',
    password: cfg.password || '',
    database: cfg.database || 'discordbot',
    charset: cfg.charset || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Ensure the website_users table exists
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS website_users (
        id VARCHAR(30) PRIMARY KEY,
        username VARCHAR(20) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[DB] website_users table ready.');
  } finally {
    conn.release();
  }

  return pool;
}

/**
 * Find a user by username (case-insensitive).
 * Returns user object or null.
 */
async function findUserByUsername(username) {
  const safe = validateString(username, 'username');
  const p = await getPool();
  const [rows] = await p.execute(
    'SELECT id, username, password, created_at FROM website_users WHERE LOWER(username) = LOWER(?)',
    [safe]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new user.
 * Returns the created user object (without password).
 */
async function createUser(id, username, hashedPassword) {
  const safeId = validateString(id, 'id');
  const safeUsername = validateString(username, 'username');
  if (typeof hashedPassword !== 'string' || hashedPassword.length === 0) {
    throw new Error('[DB] password hash: invalid');
  }
  const p = await getPool();
  await p.execute(
    'INSERT INTO website_users (id, username, password) VALUES (?, ?, ?)',
    [safeId, safeUsername, hashedPassword]
  );
  return { id: safeId, username: safeUsername };
}

module.exports = { getPool, findUserByUsername, createUser, validateString };
