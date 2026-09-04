function buildSessionOptions(env, store) {
  const production = env.NODE_ENV === 'production';
  if (typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET is required and must be at least 32 characters');
  }

  return {
    store,
    name: env.SESSION_COOKIE_NAME || 'connect.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: production,
    },
  };
}

module.exports = { buildSessionOptions };
