const crypto = require('crypto');

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch (_) {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

function validSignature(value, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64')
    .replace(/=+$/, '');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function getSessionId(cookieHeader, cookieName, sessionSecret) {
  const signedValue = parseCookies(cookieHeader)[cookieName];
  if (!signedValue || !signedValue.startsWith('s:')) return null;

  const valueAndSignature = signedValue.slice(2);
  const separator = valueAndSignature.lastIndexOf('.');
  if (separator < 1) return null;

  const value = valueAndSignature.slice(0, separator);
  const signature = valueAndSignature.slice(separator + 1);
  const secrets = Array.isArray(sessionSecret) ? sessionSecret : [sessionSecret];
  return secrets.some(secret => validSignature(value, signature, secret)) ? value : null;
}

function getStoredSession(store, sessionId) {
  return new Promise((resolve, reject) => {
    store.get(sessionId, (err, sessionData) => {
      if (err) reject(err);
      else resolve(sessionData || null);
    });
  });
}

module.exports = { getSessionId, getStoredSession, parseCookies };
