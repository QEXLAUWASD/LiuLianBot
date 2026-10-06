const fs = require('node:fs');

function managerFor(target) {
  const manager = target.service_manager || 'systemd';
  if (!['systemd', 'procd'].includes(manager)) throw new Error('Unsupported service manager');
  const pattern = manager === 'systemd' ? /^[a-zA-Z0-9_.@-]+\.service$/ : /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
  if (!pattern.test(target.service || '')) throw new Error('Invalid VPN service name');
  return manager;
}
function serviceCommand(target, operation) {
  const manager = managerFor(target);
  if (!['restart', 'running'].includes(operation)) throw new Error('Invalid service operation');
  return manager === 'procd'
    ? { binary: `/etc/init.d/${target.service}`, args: [operation] }
    : { binary: '/usr/bin/systemctl', args: operation === 'restart' ? ['restart', target.service] : ['is-active', '--quiet', target.service] };
}
function runService(target, operation, run) {
  const command = serviceCommand(target, operation);
  run(command.binary, command.args);
}
function expiryCommand(exists = fs.existsSync) {
  return exists('/etc/openwrt_release')
    ? { binary: '/etc/init.d/liulian-vpn-expire', args: ['running'] }
    : { binary: '/usr/bin/systemctl', args: ['is-active', '--quiet', 'liulian-vpn-expire.timer'] };
}
module.exports = { managerFor, serviceCommand, runService, expiryCommand };
