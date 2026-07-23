const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { runMigrations } = require('./migrate');

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'shared', 'database', 'config.json');
const MAX_STRING_LEN = 255;

let pool = null;
let poolInitialization = null;

function validateString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`[DB] ${label}: expected string, got ${typeof value}`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`[DB] ${label}: cannot be empty`);
  if (trimmed.length > MAX_STRING_LEN) {
    throw new Error(`[DB] ${label}: exceeds max length (${MAX_STRING_LEN})`);
  }
  return trimmed;
}

function validateInt(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`[DB] ${label}: expected non-negative integer, got ${value}`);
  }
  return num;
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw);
  return config.mysql || config.mysql_config || {};
}

async function getPool() {
  if (poolInitialization) return poolInitialization;
  if (pool) return pool;

  const cfg = loadConfig();
  const candidate = mysql.createPool({
    host: cfg.host || 'localhost',
    port: cfg.port || 3306,
    user: cfg.user || 'root',
    password: cfg.password || '',
    database: cfg.database || 'discordbot',
    charset: cfg.charset || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
  pool = candidate;
  poolInitialization = (async () => {
    const conn = await candidate.getConnection();
    try {
      await runMigrations(conn);
    } finally {
      conn.release();
    }
    return candidate;
  })();

  try {
    return await poolInitialization;
  } catch (err) {
    pool = null;
    await candidate.end().catch(() => {});
    throw err;
  } finally {
    poolInitialization = null;
  }
}

async function closePool() {
  const activePool = pool;
  pool = null;
  poolInitialization = null;
  if (activePool) await activePool.end();
}

module.exports = { getPool, closePool, validateString, validateInt };
