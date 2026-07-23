function requireApiAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: 'Login required' });
}

function requirePageAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/login.html');
}

module.exports = { requireApiAuth, requirePageAuth };
