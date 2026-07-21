const session = require('express-session');
const { getPool } = require('./db');

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function sessionExpiry(sessionData, fallbackTtlMs) {
  const cookieExpiry = sessionData?.cookie?.expires;
  const expiresAt = cookieExpiry ? new Date(cookieExpiry).getTime() : NaN;
  return Number.isFinite(expiresAt) ? expiresAt : Date.now() + fallbackTtlMs;
}

class MySqlSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.getPool = options.getPool || getPool;
    this.fallbackTtlMs = options.fallbackTtlMs || DEFAULT_SESSION_TTL_MS;
  }

  async get(sid, callback) {
    try {
      const pool = await this.getPool();
      const [rows] = await pool.execute(
        'SELECT data FROM website_sessions WHERE sid = ? AND expires_at > ?',
        [sid, Date.now()]
      );

      if (rows.length === 0) {
        await pool.execute(
          'DELETE FROM website_sessions WHERE sid = ? AND expires_at <= ?',
          [sid, Date.now()]
        );
        return callback(null, null);
      }

      callback(null, JSON.parse(rows[0].data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, sessionData, callback = () => {}) {
    try {
      const pool = await this.getPool();
      await pool.execute(
        `INSERT INTO website_sessions (sid, data, expires_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)`,
        [sid, JSON.stringify(sessionData), sessionExpiry(sessionData, this.fallbackTtlMs)]
      );
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sid, callback = () => {}) {
    try {
      const pool = await this.getPool();
      await pool.execute('DELETE FROM website_sessions WHERE sid = ?', [sid]);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async touch(sid, sessionData, callback = () => {}) {
    try {
      const pool = await this.getPool();
      await pool.execute(
        'UPDATE website_sessions SET expires_at = ? WHERE sid = ?',
        [sessionExpiry(sessionData, this.fallbackTtlMs), sid]
      );
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = { MySqlSessionStore, sessionExpiry };
