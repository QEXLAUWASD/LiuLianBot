const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;

function parsePort(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > MAX_PORT) {
    throw new Error(`PORT must be an integer between 0 and ${MAX_PORT}`);
  }
  return port;
}

function buildListenOptions(env = process.env) {
  const options = { port: parsePort(env.PORT) };
  const bindIp = env.BIND_IP?.trim();

  if (bindIp) options.host = bindIp;

  return options;
}

module.exports = { buildListenOptions, parsePort };
