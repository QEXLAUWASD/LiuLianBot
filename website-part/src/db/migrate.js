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
