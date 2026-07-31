function enabled(value, defaultValue = true) {
  if (value === undefined || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function remoteFeatures(env = process.env) {
  return {
    ssh: enabled(env.REMOTE_SSH_ENABLED),
    rdp: enabled(env.REMOTE_RDP_ENABLED),
  };
}

module.exports = { enabled, remoteFeatures };
