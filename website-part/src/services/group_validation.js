const { InputError } = require('../errors');

function normalizeGroupInput(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim()) {
    throw new InputError('Group name is required');
  }

  const name = input.name.trim();
  if (name.length > 50) {
    throw new InputError('Group name must be 50 characters or less');
  }
  if (input.description !== undefined && typeof input.description !== 'string') {
    throw new InputError('Group description must be a string');
  }

  const description = (input.description || '').trim();
  if (description.length > 255) {
    throw new InputError('Group description must be 255 characters or less');
  }

  return { name, description };
}

module.exports = { normalizeGroupInput };
