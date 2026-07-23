function buildSessionOptions(env, store) {
  const production = env.NODE_ENV === 'production';
  if (production && !env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
  }

  return {
    store,
    name: env.SESSION_COOKIE_NAME || 'connect.sid',
    secret: env.SESSION_SECRET || 'development-only-session-secret',
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
