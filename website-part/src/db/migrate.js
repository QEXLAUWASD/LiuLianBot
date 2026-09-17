async function addColumnIfMissing(conn, sql) {
  try {
    await conn.execute(sql);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

async function columnLength(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT CHARACTER_MAXIMUM_LENGTH AS length
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows.length === 0) return null;
  const value = rows[0].length;
  return value === null || value === undefined ? null : Number(value);
}

// Widens a column only when it is still too short, so the migration is safe to
// replay on databases that already store longer identifiers.
async function widenColumn(conn, table, column, definition, minimumLength = 64) {
  const length = await columnLength(conn, table, column);
  if (length === null || length >= minimumLength) return false;
  await conn.execute(
    `ALTER TABLE ${quoteIdentifier(table)} MODIFY COLUMN ${quoteIdentifier(column)} ${definition}`
  );
  return true;
}

// User ids are `crypto.randomUUID()` values (36 characters) while migration 001
// declared 30 character columns, so every insert failed with ER_DATA_TOO_LONG.
const USER_ID_COLUMNS = [
  ['website_user_roles', 'user_id'],
  ['website_connection_users', 'user_id'],
  ['website_page_visibility_users', 'user_id'],
  ['website_remote_profiles', 'user_id'],
  ['website_rdp_profiles', 'user_id'],
  ['website_event_participants', 'user_id'],
  ['website_link_codes', 'user_id'],
  ['website_events', 'created_by'],
  ['website_announcements', 'created_by'],
];

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
          legacy_proxy_routing TINYINT(1) NOT NULL DEFAULT 0,
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
  {
    version: '010',
    name: 'connection proxy routing mode',
    async up(conn) {
      await addColumnIfMissing(
        conn,
        'ALTER TABLE website_connections ADD COLUMN legacy_proxy_routing TINYINT(1) NOT NULL DEFAULT 0 AFTER hidden'
      );
    },
  },
  {
    version: '011',
    name: 'terms acceptance and encrypted remote profiles',
    async up(conn) {
      await addColumnIfMissing(
        conn,
        'ALTER TABLE website_users ADD COLUMN terms_accepted_at DATETIME DEFAULT NULL'
      );
      await addColumnIfMissing(
        conn,
        "ALTER TABLE website_users ADD COLUMN terms_version VARCHAR(32) DEFAULT NULL"
      );
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_remote_profiles (
          user_id VARCHAR(30) PRIMARY KEY,
          encrypted_data MEDIUMTEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    version: '012',
    name: 'website page visibility controls',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_page_visibility (
          page_key VARCHAR(50) PRIMARY KEY,
          public_access TINYINT(1) NOT NULL DEFAULT 0,
          authenticated_access TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_page_visibility_roles (
          page_key VARCHAR(50) NOT NULL,
          role_id INT NOT NULL,
          PRIMARY KEY (page_key, role_id),
          FOREIGN KEY (page_key) REFERENCES website_page_visibility(page_key) ON DELETE CASCADE,
          FOREIGN KEY (role_id) REFERENCES website_roles(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_page_visibility_users (
          page_key VARCHAR(50) NOT NULL,
          user_id VARCHAR(30) NOT NULL,
          PRIMARY KEY (page_key, user_id),
          FOREIGN KEY (page_key) REFERENCES website_page_visibility(page_key) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        INSERT IGNORE INTO website_page_visibility
          (page_key, public_access, authenticated_access) VALUES
          ('roller', 1, 1),
          ('events', 0, 1),
          ('account', 0, 1),
          ('remote', 0, 1),
          ('chromium', 0, 1)
      `);
    },
  },
  {
    version: '013',
    name: 'guild manager and categorized log channels',
    async up(conn) {
      await addColumnIfMissing(conn, 'ALTER TABLE discord_guild_metadata ADD COLUMN owner_id BIGINT NULL AFTER guild_name');
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS guild_log_channel_settings (
          guild_id BIGINT NOT NULL, log_type VARCHAR(30) NOT NULL, channel_id BIGINT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (guild_id, log_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
  },
  {
    version: '014',
    name: 'Discord guild channel types for private voice settings',
    async up(conn) {
      await addColumnIfMissing(
        conn,
        "ALTER TABLE discord_guild_channels ADD COLUMN channel_type VARCHAR(16) NOT NULL DEFAULT 'text' AFTER channel_name"
      );
    },
  },
  {
    version: '015',
    name: 'VLESS tunnel page visibility',
    async up(conn) {
      await conn.execute(`
        INSERT IGNORE INTO website_page_visibility
          (page_key, public_access, authenticated_access)
        VALUES ('vless-tunnel', 0, 1)
      `);
    },
  },
  {
    version: '016',
    name: 'per-user named encrypted RDP profiles',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_rdp_profiles (
          id CHAR(36) NOT NULL PRIMARY KEY,
          user_id VARCHAR(30) NOT NULL,
          name VARCHAR(100) NOT NULL,
          encrypted_data MEDIUMTEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_rdp_profiles_user (user_id),
          FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    version: '017',
    name: 'widen website user identifiers for uuid ids',
    async up(conn) {
      // Foreign keys have to be dropped first: InnoDB refuses to change a column
      // that a foreign key still uses, even with FOREIGN_KEY_CHECKS disabled.
      const [referencingKeys] = await conn.execute(
        `SELECT k.TABLE_NAME AS table_name, k.COLUMN_NAME AS column_name,
                k.CONSTRAINT_NAME AS constraint_name,
                r.DELETE_RULE AS delete_rule, r.UPDATE_RULE AS update_rule
           FROM information_schema.KEY_COLUMN_USAGE k
           JOIN information_schema.REFERENTIAL_CONSTRAINTS r
             ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
            AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
          WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'website_users'`
      );

      const keys = referencingKeys.map(row => ({
        table: row.table_name ?? row.TABLE_NAME,
        column: row.column_name ?? row.COLUMN_NAME,
        constraint: row.constraint_name ?? row.CONSTRAINT_NAME,
        deleteRule: row.delete_rule ?? row.DELETE_RULE,
        updateRule: row.update_rule ?? row.UPDATE_RULE,
      }));

      for (const key of keys) {
        await conn.execute(
          `ALTER TABLE ${quoteIdentifier(key.table)} DROP FOREIGN KEY ${quoteIdentifier(key.constraint)}`
        );
      }

      await widenColumn(conn, 'website_users', 'id', 'VARCHAR(64) NOT NULL');

      const widened = new Set(keys.map(key => `${key.table}.${key.column}`));
      for (const key of keys) {
        await widenColumn(conn, key.table, key.column, 'VARCHAR(64) NOT NULL');
      }
      // Reference columns that exist without a foreign key still have to fit a
      // UUID, so widen the known list as well.
      for (const [table, column] of USER_ID_COLUMNS) {
        if (widened.has(`${table}.${column}`)) continue;
        await widenColumn(conn, table, column, 'VARCHAR(64) NOT NULL');
      }

      for (const key of keys) {
        await conn.execute(
          `ALTER TABLE ${quoteIdentifier(key.table)}
             ADD CONSTRAINT ${quoteIdentifier(key.constraint)}
             FOREIGN KEY (${quoteIdentifier(key.column)}) REFERENCES website_users (id)
             ON DELETE ${key.deleteRule} ON UPDATE ${key.updateRule}`
        );
      }
    },
  },
  {
    version: '018',
    name: 'FnOS file permissions and expiring shares',
    async up(conn) {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_file_permissions (
          user_id VARCHAR(64) NOT NULL PRIMARY KEY,
          can_read TINYINT(1) NOT NULL DEFAULT 0,
          can_write TINYINT(1) NOT NULL DEFAULT 0,
          can_share TINYINT(1) NOT NULL DEFAULT 0,
          requested_at DATETIME NULL,
          FOREIGN KEY (user_id) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS website_file_shares (
          id CHAR(36) NOT NULL PRIMARY KEY,
          owner_id VARCHAR(64) NOT NULL,
          code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
          source_path TEXT NOT NULL,
          name VARCHAR(255) NOT NULL,
          is_directory TINYINT(1) NOT NULL,
          expires_at DATETIME NOT NULL,
          revoked_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_file_shares_owner (owner_id),
          FOREIGN KEY (owner_id) REFERENCES website_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
