const AUTH_RATE_LIMIT = Object.freeze({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

module.exports = { AUTH_RATE_LIMIT };
