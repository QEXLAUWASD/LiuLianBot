function buildListenOptions(env = process.env) {
  const options = { port: env.PORT || 3000 };
  const bindIp = env.BIND_IP?.trim();

  if (bindIp) options.host = bindIp;

  return options;
}

module.exports = { buildListenOptions };
