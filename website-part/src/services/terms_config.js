function termsRequired(env = process.env) {
  return String(env.TERMS_OF_SERVICE_REQUIRED ?? 'true').toLowerCase() === 'true';
}

module.exports = { termsRequired };
