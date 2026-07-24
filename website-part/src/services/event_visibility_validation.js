function normalizeEventVisibility(value) {
  if (typeof value !== 'boolean') throw new Error('visible must be a boolean');
  return value;
}

module.exports = { normalizeEventVisibility };
