const fs = require('fs');

const file = 'website-part/src/db.js';
let source = fs.readFileSync(file, 'utf8').replace(/\\r\\n/g, '\\n');

function replaceRequired(before, after) {
  if (!source.includes(before)) throw new Error(`Anchor not found: ${before.slice(0, 80)}`);
  source = source.replace(before, after);
}

replaceRequired(
  'let pool = null;\n',
  'let pool = null;\nlet poolInitialization = null;\n'
);

replaceRequired(
  `async function getPool() {
  if (pool) return pool;

  const cfg = loadConfig();
  pool = mysql.createPool({`,
  `async function getPool() {
  if (poolInitialization) return poolInitialization;
  if (pool) return pool;

  const cfg = loadConfig();
  pool = mysql.createPool({`
);

replaceRequired(
  `  const conn = await pool.getConnection();
  try {`,
  `  const candidate = pool;
  poolInitialization = (async () => {
    const conn = await candidate.getConnection();
    try {`
);

replaceRequired(
  `    console.log('[DB] website connection tables ready.');
  } finally {
    conn.release();
  }

  return pool;
}`,
  `      console.log('[DB] website connection tables ready.');
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
}`
);

replaceRequired(
  `     JOIN website_users current_user ON current_user.id = ?
     LEFT JOIN website_roles current_role ON current_role.id = current_user.role_id
     LEFT JOIN website_connection_roles cr
       ON cr.connection_id = c.id AND cr.role_id = current_user.role_id
     LEFT JOIN website_connection_users cu
       ON cu.connection_id = c.id AND cu.user_id = current_user.id
     WHERE c.enabled = 1
       AND (current_role.name = 'admin' OR cr.role_id IS NOT NULL OR cu.user_id IS NOT NULL)`,
  `     JOIN website_users wu ON wu.id = ?
     LEFT JOIN website_roles wr ON wr.id = wu.role_id
     LEFT JOIN website_connection_roles cr
       ON cr.connection_id = c.id AND cr.role_id = wu.role_id
     LEFT JOIN website_connection_users cu
       ON cu.connection_id = c.id AND cu.user_id = wu.id
     WHERE c.enabled = 1
       AND (wr.name = 'admin' OR cr.role_id IS NOT NULL OR cu.user_id IS NOT NULL)`
);

fs.writeFileSync(file, source);
