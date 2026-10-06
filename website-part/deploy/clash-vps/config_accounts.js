const crypto = require('node:crypto');

function applyAccounts(source, target, payload, now = Date.now()) {
  if (!target || !['sing-box', 'xray', 'hysteria2', 'mihomo'].includes(target.engine) ||
      !/^llb-s[1-9]\d*-$/.test(target.owner_prefix || '') || payload.owner_prefix !== target.owner_prefix ||
      !['ss', 'vless', 'vmess', 'trojan', 'hysteria2'].includes(target.protocol) || !Array.isArray(payload.accounts) || payload.accounts.length > 10000) {
    throw new Error('Invalid target or ownership');
  }
  const expectedStyle = target.engine === 'hysteria2' ? 'hysteria2-userpass' : 'standard';
  if ((payload.credential_style || 'standard') !== expectedStyle) throw new Error('Credential style does not match VPN engine');
  const names = new Set();
  for (const account of payload.accounts) {
    if (!account || !account.name?.startsWith(target.owner_prefix) || !/^llb-s\d+-[a-f0-9]{24}$/.test(account.name) ||
        names.has(account.name) || account.type !== target.protocol || !Number.isFinite(Date.parse(account.expires_at))) throw new Error('Invalid account');
    names.add(account.name);
    if (['vless', 'vmess'].includes(account.type) && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(account.uuid || '')) throw new Error('Invalid UUID');
    if (!['vless', 'vmess'].includes(account.type) && (typeof account.password !== 'string' || !account.password || account.password.length > 256)) throw new Error('Invalid password');
    if (account.flow && !['', 'xtls-rprx-vision'].includes(account.flow)) throw new Error('Invalid flow');
  }
  const active = payload.accounts.filter(account => Date.parse(account.expires_at) > now);
  const result = structuredClone(source);
  if (target.engine === 'mihomo') {
    const listeners = result.listeners?.filter(listener => listener.name === target.inbound_tag);
    if (!target.inbound_tag || listeners?.length !== 1) throw new Error('Expected exactly one matching Mihomo listener');
    const listener = listeners[0];
    if (listener.type !== target.protocol || !['hysteria2', 'vless'].includes(target.protocol)) throw new Error('Unsupported Mihomo listener');
    const previous = source.listeners.find(item => item.name === target.inbound_tag);
    if (target.protocol === 'hysteria2') {
      if (!listener.users || typeof listener.users !== 'object' || Array.isArray(listener.users)) throw new Error('Mihomo Hysteria2 requires a users map');
      listener.users = Object.fromEntries([...Object.entries(listener.users).filter(([name]) => !name.startsWith(target.owner_prefix)),
        ...active.map(account => [account.name, account.password])]);
      if (!Object.keys(listener.users).length) {
        const name = `${target.owner_prefix}disabled`;
        listener.users[name] = previous.users[name] || crypto.randomBytes(32).toString('hex');
      }
    } else {
      if (!Array.isArray(listener.users)) throw new Error('Mihomo VLESS requires a users array');
      listener.users = [...listener.users.filter(user => !String(user.username || '').startsWith(target.owner_prefix)),
        ...active.map(account => ({ username: account.name, uuid: account.uuid, ...(account.flow ? { flow: account.flow } : {}) }))];
      if (!listener.users.length) listener.users.push(previous.users.find(user => user.username === `${target.owner_prefix}disabled`) ||
        { username: `${target.owner_prefix}disabled`, uuid: crypto.randomUUID() });
    }
  } else if (target.engine === 'hysteria2') {
    if (target.protocol !== 'hysteria2' || result.auth?.type !== 'userpass' || !result.auth.userpass || typeof result.auth.userpass !== 'object' || Array.isArray(result.auth.userpass)) {
      throw new Error('Standalone Hysteria2 requires an existing userpass auth map');
    }
    const existing = Object.entries(result.auth.userpass).filter(([name]) => !name.startsWith(target.owner_prefix));
    result.auth.userpass = Object.fromEntries([...existing, ...active.map(account => [account.name, account.password])]);
    if (!Object.keys(result.auth.userpass).length) {
      const name = `${target.owner_prefix}disabled`;
      result.auth.userpass[name] = source.auth.userpass[name] || crypto.randomBytes(32).toString('hex');
    }
  } else {
    const inbounds = result.inbounds?.filter(inbound => inbound.tag === target.inbound_tag);
    if (!target.inbound_tag || inbounds?.length !== 1) throw new Error('Expected exactly one matching inbound');
    const inbound = inbounds[0];
    if (target.engine === 'sing-box') {
      const type = target.protocol === 'ss' ? 'shadowsocks' : target.protocol;
      if (inbound.type !== type || !Array.isArray(inbound.users)) throw new Error('Inbound must already use multi-user authentication');
      if (type === 'shadowsocks') {
        if (!['2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm'].includes(inbound.method) || inbound.managed || inbound.destinations) throw new Error('Only static AEAD 2022 AES users are supported');
        for (const account of active) {
          const length = inbound.method.includes('128') ? 16 : 32;
          if (account.cipher !== inbound.method || account.server_password !== inbound.password || Buffer.from(account.password, 'base64').length !== length) throw new Error('SS2022 server key/cipher mismatch');
        }
      }
      inbound.users = [...inbound.users.filter(user => !String(user.name || '').startsWith(target.owner_prefix)),
        ...active.map(account => ['vless', 'vmess'].includes(type)
          ? { name: account.name, uuid: account.uuid, ...(account.flow ? { flow: account.flow } : {}) }
          : { name: account.name, password: account.password })];
      // Some multi-user engines fall back to the listener's shared password when users is empty.
      // Keep a random inaccessible sentinel instead of ever leaving an empty account list.
      if (!inbound.users.length) inbound.users.push(source.inbounds.find(item => item.tag === target.inbound_tag).users.find(user => user.name === `${target.owner_prefix}disabled`) || (['vless', 'vmess'].includes(type)
        ? { name: `${target.owner_prefix}disabled`, uuid: crypto.randomUUID() }
        : { name: `${target.owner_prefix}disabled`, password: type === 'shadowsocks' ? crypto.randomBytes(inbound.method.includes('128') ? 16 : 32).toString('base64') : crypto.randomBytes(32).toString('hex') }));
    } else {
      if (!['vless', 'vmess', 'trojan'].includes(target.protocol) || inbound.protocol !== target.protocol || !Array.isArray(inbound.settings?.clients)) throw new Error('Unsupported Xray inbound');
      inbound.settings.clients = [...inbound.settings.clients.filter(user => !String(user.email || '').startsWith(target.owner_prefix)),
        ...active.map(account => ({ email: account.name,
          ...(account.uuid ? { id: account.uuid, ...(account.flow ? { flow: account.flow } : {}) } : { password: account.password }) }))];
      if (!inbound.settings.clients.length) inbound.settings.clients.push(
        source.inbounds.find(item => item.tag === target.inbound_tag).settings.clients.find(user => user.email === `${target.owner_prefix}disabled`) ||
        { email: `${target.owner_prefix}disabled`, ...(target.protocol === 'trojan' ? { password: crypto.randomBytes(32).toString('hex') } : { id: crypto.randomUUID() }) });
    }
  }
  return result;
}
module.exports = { applyAccounts };
