#!/usr/bin/env node
const { execFile } = require('node:child_process');

function createExpiryDaemon({ execute = execFile, interval = 60000, log = () => console.error('[VPN expiry] Cleanup failed; retrying next cycle') } = {}) {
  let timer = null;
  let child = null;
  let active = false;
  let stopped = false;
  function tick() {
    if (active || stopped) return;
    active = true;
    try {
      child = execute('/usr/local/libexec/liulian-vpn-sync', ['--expire'], { timeout: 300000, maxBuffer: 4096 }, (error, stdout) => {
        active = false; child = null;
        if (stopped) return;
        let success = false;
        try { success = JSON.parse(stdout).success === true; } catch {}
        if (error || !success) log();
      });
    } catch { active = false; child = null; if (!stopped) log(); }
  }
  return {
    tick,
    start() { if (timer) return; stopped = false; timer = setInterval(tick, interval); tick(); },
    stop() { stopped = true; clearInterval(timer); timer = null; child?.kill('SIGTERM'); },
  };
}
if (require.main === module) {
  const daemon = createExpiryDaemon();
  process.once('SIGTERM', () => daemon.stop());
  process.once('SIGINT', () => daemon.stop());
  daemon.start();
}
module.exports = { createExpiryDaemon };
