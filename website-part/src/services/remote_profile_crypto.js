const crypto = require('node:crypto');

function encryptionKey(value = process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const key = Buffer.from(value, 'base64');
    return key.length === 32 ? key : null;
  } catch (_) {
    return null;
  }
}

function encryptProfile(data, key = encryptionKey()) {
  if (!key) throw new Error('Remote credential encryption is not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptProfile(value, key = encryptionKey()) {
  if (!key) throw new Error('Remote credential encryption is not configured');
  const parts = String(value || '').split('.');
  if (parts.length !== 4) throw new Error('Invalid encrypted profile');
  const [version, ivText, tagText, encryptedText] = parts;
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted profile');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encryptionKey, encryptProfile, decryptProfile };
