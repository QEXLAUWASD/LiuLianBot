const { AppError } = require('../errors');

function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      request_id: req.requestId,
    });
  }

  console.error(`[HTTP:${req.requestId}] Unexpected error:`, err);
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    request_id: req.requestId,
  });
}

module.exports = { errorHandler };
