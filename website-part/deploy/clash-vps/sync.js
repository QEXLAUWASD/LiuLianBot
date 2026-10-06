#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');
const { applyAccounts } = require('./config_accounts');
const TARGETS = '/etc/liulian-vpn/targets.json';
const STATE_DIR = '/var/lib/liulian-vpn';

function atomicWrite(filename, content, mode = 0o600, ownership) {
  const temporary = `${filename}.llb-${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(temporary, content, { mode, flag: 'wx' });
    if (ownership) fs.chownSync(temporary, ownership.uid, ownership.gid);
    fs.renameSync(temporary, filename);
  } finally { try { fs.unlinkSync(temporary); } catch {} }
}
function run(binary, args) {
  execFileSync(binary, args, { timeout: 30000, stdio: 'ignore' });
}
function rootOwnedPath(filename, directory = false) {
  let current = filename;
  let first = true;
  while (true) {
    const info = fs.lstatSync(current);
    if (info.uid !== 0 || (info.mode & 0o022) || info.isSymbolicLink() ||
        (first && !directory ? !info.isFile() : !info.isDirectory())) {
      throw new Error('VPN management paths must be root-owned and not writable by other users');
    }
    if (current === path.dirname(current)) break;
    current = path.dirname(current); first = false;
  }
}
function validateTarget(target) {
  if (!target || !path.isAbsolute(target.config_path || '') || !path.isAbsolute(target.binary || '') ||
      !/^[a-zA-Z0-9_.@-]+\.service$/.test(target.service || '')) throw new Error('Invalid root target configuration');
  rootOwnedPath(target.config_path);
}
function synchronize(target, payload, statePath, { validate = validateTarget, runCommand = run } = {}) {
  validate(target);
  const raw = fs.readFileSync(target.config_path, 'utf8');
  const source = target.engine === 'hysteria2' ? yaml.load(raw, { schema: yaml.JSON_SCHEMA }) : JSON.parse(raw);
  const updated = applyAccounts(source, target, payload);
  const changed = JSON.stringify(source) !== JSON.stringify(updated);
  if (changed) {
    const content = target.engine === 'hysteria2' ? yaml.dump(updated, { noRefs: true }) : `${JSON.stringify(updated, null, 2)}\n`;
    const candidate = `${target.config_path}.llb-candidate`;
    const ownership = fs.statSync(target.config_path);
    try {
      atomicWrite(candidate, content, ownership.mode & 0o777, ownership);
      if (target.engine === 'sing-box') runCommand(target.binary, ['check', '-c', candidate]);
      if (target.engine === 'xray') runCommand(target.binary, ['run', '-test', '-config', candidate]);
      // Hysteria2 has no assumed test command: structural/auth validation above, rollback below.
      atomicWrite(`${target.config_path}.llb-backup`, raw, 0o600);
      fs.renameSync(candidate, target.config_path);
      try {
        runCommand('/usr/bin/systemctl', ['restart', target.service]);
        runCommand('/usr/bin/systemctl', ['is-active', '--quiet', target.service]);
      } catch (error) {
        atomicWrite(target.config_path, raw, ownership.mode & 0o777, ownership);
        try { runCommand('/usr/bin/systemctl', ['restart', target.service]); } catch {}
        throw error;
      }
    } finally { try { fs.unlinkSync(candidate); } catch {} }
  }
  // Persist successful expiries locally even when the user list did not change.
  atomicWrite(statePath, JSON.stringify(payload));
  return changed;
}
function main(payload, expire = false) {
  rootOwnedPath(TARGETS);
  const targets = JSON.parse(fs.readFileSync(TARGETS, 'utf8'));
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  rootOwnedPath(STATE_DIR, true);
  if (expire) {
    let failed = false;
    for (const [name, target] of Object.entries(targets)) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) { failed = true; continue; }
      const statePath = path.join(STATE_DIR, `${name}.json`);
      const intentPath = `${statePath}.intent`;
      if (!fs.existsSync(statePath) && !fs.existsSync(intentPath)) continue;
      try {
        const request = fs.readFileSync(fs.existsSync(intentPath) ? intentPath : statePath, 'utf8');
        synchronize(target, JSON.parse(request), statePath);
        if (fs.existsSync(intentPath)) fs.unlinkSync(intentPath);
      } catch {
        failed = true;
        // A rejected new configuration must not prevent expiry of the last valid accounts.
        if (fs.existsSync(statePath)) {
          try { synchronize(target, JSON.parse(fs.readFileSync(statePath, 'utf8')), statePath); } catch {}
        }
      }
    }
    if (failed) throw new Error('Expiry cleanup failed');
  } else {
    // Website outages must not leave managed credentials active indefinitely.
    run('/usr/bin/systemctl', ['is-active', '--quiet', 'liulian-vpn-expire.timer']);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(payload.target || '') || !Object.hasOwn(targets, payload.target)) throw new Error('Unknown target');
    const target = targets[payload.target];
    const statePath = path.join(STATE_DIR, `${payload.target}.json`);
    // Validate the complete payload before making the expiry intent durable.
    validateTarget(target);
    const raw = fs.readFileSync(target.config_path, 'utf8');
    applyAccounts(target.engine === 'hysteria2' ? yaml.load(raw, { schema: yaml.JSON_SCHEMA }) : JSON.parse(raw), target, payload);
    atomicWrite(`${statePath}.intent`, JSON.stringify(payload));
    synchronize(target, payload, statePath);
    fs.unlinkSync(`${statePath}.intent`);
  }
}
if (require.main === module) {
  const fail = () => { process.stdout.write('{"success":false}\n'); process.exitCode = 1; };
  if (process.argv[2] === '--expire') {
    try { main(null, true); process.stdout.write('{"success":true}\n'); } catch { fail(); }
  } else {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; if (Buffer.byteLength(input) > 2 * 1024 * 1024) process.exit(1); });
    process.stdin.on('end', () => { try { main(JSON.parse(input)); process.stdout.write('{"success":true}\n'); } catch { fail(); } });
  }
}
module.exports = { atomicWrite, synchronize, main };
