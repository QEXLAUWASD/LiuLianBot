const { getPool } = require('../db/pool');
const { encryptionKey, encryptProfile, decryptProfile } = require('./remote_profile_crypto');
const { readProfiles, syncOverSsh, createAccount, accountProxy } = require('./clash_ssh');

function credentialKey(env = process.env) {
  const key = encryptionKey(env.CLASH_CREDENTIAL_ENCRYPTION_KEY);
  if (!key) throw new Error('CLASH_CREDENTIAL_ENCRYPTION_KEY must contain a base64 32-byte key');
  return key;
}
function createSyncWorker({ poolProvider = getPool, transport = syncOverSsh, profilesProvider = readProfiles, env = process.env } = {}) {
  let pending = null;
  let timer = null;
  let stopped = false;
  async function synchronize() {
    const pool = await poolProvider();
    const conn = await pool.getConnection();
    let locked = false;
    try {
      const [[lock]] = await conn.execute("SELECT GET_LOCK('liulian-clash-ssh', 0) AS acquired");
      locked = Number(lock.acquired) === 1;
      if (!locked) return;
      const [servers] = await conn.execute("SELECT * FROM website_clash_servers WHERE management_profile IS NOT NULL AND NOT (deleted_at IS NOT NULL AND sync_status='revoked')");
      for (const server of servers) {
        if (stopped) break;
        try {
          const profile = profilesProvider(env)[server.management_profile];
          if (!profile) throw new Error('SSH profile is missing');
          const [users] = await conn.execute(`SELECT s.user_id, s.expires_at FROM website_clash_grants g
            JOIN website_clash_subscriptions s ON s.user_id=g.user_id
            JOIN website_users u ON u.id=s.user_id
            WHERE g.server_id=? AND s.enabled=1 AND s.expires_at>UTC_TIMESTAMP()`, [server.id]);
          const activeUsers = server.enabled && !server.deleted_at ? users : [];
          const accounts = [];
          const prepared = [];
          for (const user of activeUsers) {
            const key = credentialKey(env);
            const [existing] = await conn.execute('SELECT credential_encrypted FROM website_clash_accounts WHERE server_id=? AND user_id=?', [server.id, user.user_id]);
            const account = existing.length ? decryptProfile(existing[0].credential_encrypted, key) : createAccount(server, user.user_id);
            if (account.type !== JSON.parse(server.proxy_json).type) throw new Error('Managed node protocol changed');
            account.proxy_json = accountProxy(server, account, profile.credential_style || 'standard');
            const encrypted = encryptProfile(account, key);
            await conn.execute(`INSERT INTO website_clash_accounts (server_id,user_id,credential_encrypted,applied)
              VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE credential_encrypted=credential_encrypted`, [server.id, user.user_id, encrypted]);
            prepared.push({ user_id: user.user_id, encrypted });
            const { proxy_json, ...remote } = account;
            accounts.push({ ...remote, expires_at: new Date(user.expires_at).toISOString() });
          }
          await transport(profile, { credential_style: profile.credential_style || 'standard', owner_prefix: `llb-s${server.id}-`, accounts }, { env });
          await conn.beginTransaction();
          try {
            await conn.execute('UPDATE website_clash_accounts SET applied=0 WHERE server_id=?', [server.id]);
            for (const user of prepared) await conn.execute('UPDATE website_clash_accounts SET applied=1, credential_encrypted=? WHERE server_id=? AND user_id=?', [user.encrypted, server.id, user.user_id]);
            await conn.execute("UPDATE website_clash_servers SET sync_status=IF(deleted_at IS NOT NULL AND ?!='revoked','pending',?), synced_at=UTC_TIMESTAMP(), sync_error=NULL WHERE id=? AND proxy_json=? AND management_profile=?",
              [server.deleted_at ? 'revoked' : 'ready', server.deleted_at ? 'revoked' : 'ready', server.id, server.proxy_json, server.management_profile]);
            await conn.commit();
          } catch (err) { await conn.rollback(); throw err; }
        } catch (err) {
          // Error details may contain credentials; store a fixed diagnostic only.
          await conn.execute("UPDATE website_clash_servers SET sync_status='error', sync_error=? WHERE id=?",
            ['SSH sync failed; verify profile, encryption key, VPS helper and service configuration', server.id]);
        }
      }
    } finally {
      if (locked) await conn.execute("SELECT RELEASE_LOCK('liulian-clash-ssh')").catch(() => {});
      conn.release();
    }
  }
  function runOnce() {
    if (stopped) return Promise.resolve();
    if (!pending) pending = synchronize().finally(() => { pending = null; });
    return pending;
  }
  const trigger = () => runOnce().catch(() => console.error('[ClashSync] Synchronization failed; will retry'));
  return {
    runOnce,
    start() { if (timer) return; stopped = false; trigger(); timer = setInterval(trigger, 30000); timer.unref(); },
    async stop() { stopped = true; clearInterval(timer); timer = null; if (pending) await pending; },
  };
}
module.exports = { credentialKey, createSyncWorker };
