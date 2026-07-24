async function addColumnIfMissing(conn, sql) {
  try {
    await conn.execute(sql);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

const MIGRATIONS = [
  {
    version: '001',
    name: 'website roles and users',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_roles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(50) NOT NULL UNIQUE,
          description VARCHAR(255) DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        INSERT IGNORE INTO website_roles (name, description) VALUES
          ('admin', 'Administrator with full access to admin panel'),
          ('user', 'Regular user with basic access')
      `);
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_users (
          id VARCHAR(30) PRIMARY KEY,
          username VARCHAR(20) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role_id INT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (role_id) REFERENCES website_roles(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await addColumnIfMissing(
        conn,
        'ALTER TABLE website_users ADD COLUMN role_id INT DEFAULT NULL'
      );
      const [roles] = await conn.execute(
        'SELECT id FROM website_roles WHERE name = ?',
        ['user']
      );
      if (roles.length > 0) {
        await conn.execute(
          'UPDATE website_users SET role_id = ? WHERE role_id IS NULL',
          [roles[0].id]
        );
      }
    },
  },
  {
    version: '002',
    name: 'role memberships and sessions',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_user_roles (
          user_id VARCHAR(30) NOT NULL,
          role_id INT NOT NULL,
          assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, role_id),
          FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE,
          FOREIGN KEY (role_id) REFERENCES website_roles(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        INSERT IGNORE INTO website_user_roles (user_id, role_id)
        SELECT id, role_id FROM website_users WHERE role_id IS NOT NULL
      `);
      const [roles] = await conn.execute(
        'SELECT id FROM website_roles WHERE name = ?',
        ['user']
      );
      if (roles.length > 0) {
        await conn.execute(
          `INSERT IGNORE INTO website_user_roles (user_id, role_id)
           SELECT u.id, ? FROM website_users u
           LEFT JOIN website_user_roles ur ON ur.user_id = u.id
           WHERE ur.user_id IS NULL`,
          [roles[0].id]
        );
      }
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_sessions (
          sid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
          data MEDIUMTEXT NOT NULL,
          expires_at BIGINT UNSIGNED NOT NULL,
          INDEX idx_website_sessions_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    version: '003',
    name: 'website connections',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_connections (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(80) NOT NULL,
          slug VARCHAR(50) NOT NULL UNIQUE,
          target_url TEXT NOT NULL,
          description VARCHAR(255) DEFAULT '',
          enabled TINYINT(1) NOT NULL DEFAULT 1,
          hidden TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await addColumnIfMissing(
        conn,
        'ALTER TABLE website_connections ADD COLUMN hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER enabled'
      );
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_connection_roles (
          connection_id INT NOT NULL,
          role_id INT NOT NULL,
          PRIMARY KEY (connection_id, role_id),
          FOREIGN KEY (connection_id) REFERENCES website_connections(id) ON DELETE CASCADE,
          FOREIGN KEY (role_id) REFERENCES website_roles(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_connection_users (
          connection_id INT NOT NULL,
          user_id VARCHAR(30) NOT NULL,
          PRIMARY KEY (connection_id, user_id),
          FOREIGN KEY (connection_id) REFERENCES website_connections(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    version: '004',
    name: 'events and Discord account links',
    async up(conn) {
      await addColumnIfMissing(
        conn,
        'ALTER TABLE website_users ADD COLUMN discord_user_id VARCHAR(32) DEFAULT NULL UNIQUE'
      );
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_link_codes (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(30) NOT NULL,
          code_hash CHAR(64) NOT NULL,
          expires_at DATETIME NOT NULL,
          used_at DATETIME DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_link_codes_hash (code_hash),
          FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_events (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          created_by VARCHAR(30) NOT NULL,
          guild_id BIGINT NOT NULL,
          channel_id BIGINT DEFAULT NULL,
          title VARCHAR(100) NOT NULL,
          description VARCHAR(500) DEFAULT '',
          mode VARCHAR(30) DEFAULT 'Custom match',
          start_at DATETIME NOT NULL,
          max_players SMALLINT UNSIGNED NOT NULL DEFAULT 10,
          status ENUM('draft', 'open', 'closed', 'cancelled') NOT NULL DEFAULT 'open',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_events_guild_start (guild_id, start_at),
          FOREIGN KEY (created_by) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_event_participants (
          event_id BIGINT NOT NULL,
          user_id VARCHAR(30) NOT NULL,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (event_id, user_id),
          FOREIGN KEY (event_id) REFERENCES website_events(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    version: '005',
    name: 'event visibility controls',
    async up(conn) {
      await addColumnIfMissing(
        conn,
        'ALTER TABLE website_events ADD COLUMN visible TINYINT(1) NOT NULL DEFAULT 1 AFTER status'
      );
    },
  },
  {
    version: '006',
    name: 'guild activity statistics',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS guild_activity_stats (
          guild_id BIGINT NOT NULL,
          day DATE NOT NULL,
          command_count INT NOT NULL DEFAULT 0,
          voice_joins INT NOT NULL DEFAULT 0,
          PRIMARY KEY (guild_id, day)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
  },
  {
    version: '007',
    name: 'scheduled announcements',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_announcements (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          created_by VARCHAR(30) NOT NULL,
          guild_id BIGINT NOT NULL,
          channel_id BIGINT NOT NULL,
          content VARCHAR(2000) NOT NULL,
          scheduled_at DATETIME NOT NULL,
          status ENUM('scheduled', 'sent', 'cancelled') NOT NULL DEFAULT 'scheduled',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_announcements_due (status, scheduled_at),
          FOREIGN KEY (created_by) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    version: '008',
    name: 'Discord guild metadata',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS discord_guild_metadata (
          guild_id BIGINT PRIMARY KEY,
          guild_name VARCHAR(100) NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
  },
  {
    version: '009',
    name: 'Discord guild channels',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS discord_guild_channels (
          guild_id BIGINT NOT NULL,
          channel_id BIGINT NOT NULL,
          channel_name VARCHAR(100) NOT NULL,
          PRIMARY KEY (guild_id, channel_id),
          INDEX idx_guild_channel_name (guild_id, channel_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
  },
];

async function runMigrations(conn, migrations = MIGRATIONS) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS website_schema_migrations (
      version VARCHAR(32) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const [rows] = await conn.execute('SELECT version FROM website_schema_migrations');
  const applied = new Set(rows.map(row => String(row.version)));

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    await migration.up(conn);
    await conn.execute(
      'INSERT INTO website_schema_migrations (version, name) VALUES (?, ?)',
      [migration.version, migration.name]
    );
  }
}

module.exports = { runMigrations, MIGRATIONS };
