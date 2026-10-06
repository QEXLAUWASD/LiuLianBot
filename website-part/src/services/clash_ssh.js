const fs = require('node:fs');
const crypto = require('node:crypto');
const { Client } = require('ssh2');

function readProfiles(env = process.env) {
  if (!env.CLASH_SSH_PROFILES_FILE) return {};
  const profiles = JSON.parse(fs.readFileSync(env.CLASH_SSH_PROFILES_FILE, 'utf8'));
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) throw new Error('Invalid SSH profiles');
  return profiles;
}
function profileOptions(profile, env = process.env) {
  if (!profile || typeof profile.host !== 'string' || !profile.host || typeof profile.username !== 'string' ||
      !profile.username || !/^[a-f0-9]{64}$/i.test(profile.host_fingerprint || '') ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(profile.target || '') ||
      !['standard', 'hysteria2-userpass'].includes(profile.credential_style || 'standard')) throw new Error('Invalid SSH profile');
  const port = profile.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH port');
  const privateKey = profile.private_key_path ? fs.readFileSync(profile.private_key_path) : undefined;
  const password = profile.password_env ? env[profile.password_env] : undefined;
  if (!privateKey && !password) throw new Error('SSH credentials are not configured');
  return { host: profile.host, port, username: profile.username, privateKey, password,
    hostHash: 'sha256', hostVerifier: hash => hash === profile.host_fingerprint.toLowerCase(), readyTimeout: 15000 };
}

function syncOverSsh(profile, payload, { env = process.env, clientFactory = () => new Client(), timeout = 90000 } = {}) {
  const options = profileOptions(profile, env);
  return new Promise((resolve, reject) => {
    const client = clientFactory();
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timer); client.end();
      if (error) reject(new Error('VPN SSH synchronization failed; check the VPS helper and SSH profile'));
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error('timeout')), timeout);
    client.on('error', finish);
    client.on('close', () => { if (!settled) finish(new Error('closed')); });
    client.once('ready', () => {
      // Fixed command; all target/user data travels through stdin, never shell interpolation.
      client.exec('sudo -n /usr/local/libexec/liulian-vpn-sync', (error, stream) => {
        if (error) return finish(error);
        let output = '';
        stream.on('data', chunk => { output += chunk; if (output.length > 4096) finish(new Error('output limit')); });
        stream.stderr.on('data', () => {}); // Never log remote config/credentials or arbitrary stderr.
        stream.on('error', finish);
        stream.on('close', code => {
          let result;
          try { result = JSON.parse(output); } catch { return finish(new Error('invalid response')); }
          finish(code === 0 && result.success === true ? null : new Error('remote failure'));
        });
        stream.end(JSON.stringify({ ...payload, target: profile.target }));
      });
    });
    try { client.connect(options); } catch (err) { finish(err); }
  });
}

function createAccount(server, userId) {
  const proxy = JSON.parse(server.proxy_json);
  const name = `llb-s${server.id}-${crypto.createHash('sha256').update(userId).digest('hex').slice(0, 24)}`;
  const account = { name, type: proxy.type };
  if (['vless', 'vmess'].includes(proxy.type)) account.uuid = crypto.randomUUID();
  else if (proxy.type === 'ss') {
    if (!['2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm'].includes(proxy.cipher)) throw new Error('Managed Shadowsocks requires AEAD 2022 AES');
    account.password = crypto.randomBytes(proxy.cipher.includes('128') ? 16 : 32).toString('base64');
    account.cipher = proxy.cipher;
    account.server_password = proxy.password.split(':')[0];
  } else if (['trojan', 'hysteria2'].includes(proxy.type)) account.password = crypto.randomBytes(32).toString('hex');
  else throw new Error('Unsupported managed VPN protocol');
  if (proxy.flow) account.flow = proxy.flow;
  return account;
}
function accountProxy(server, account, style = 'standard') {
  const proxy = JSON.parse(server.proxy_json);
  if (account.uuid) proxy.uuid = account.uuid;
  if (account.password) proxy.password = account.type === 'ss' ? `${account.server_password}:${account.password}`
    : style === 'hysteria2-userpass' ? `${account.name}:${account.password}` : account.password;
  return JSON.stringify(proxy);
}
module.exports = { readProfiles, profileOptions, syncOverSsh, createAccount, accountProxy };
