const callbackPromise = fn => new Promise((resolve, reject) => {
  fn(err => (err ? reject(err) : resolve()));
});

async function establishUserSession(req, user, maxAge = null) {
  await callbackPromise(callback => req.session.regenerate(callback));
  req.session.cookie.maxAge = maxAge;
  req.session.user = { id: user.id, username: user.username };
  await callbackPromise(callback => req.session.save(callback));
}

async function revokeOtherUserSessions(req, userId) {
  if (typeof req.sessionStore?.destroyUserSessions !== 'function') return;
  await callbackPromise(callback => {
    req.sessionStore.destroyUserSessions(userId, req.sessionID, callback);
  });
}

module.exports = { establishUserSession, revokeOtherUserSessions };
