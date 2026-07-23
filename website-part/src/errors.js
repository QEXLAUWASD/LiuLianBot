class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class InputError extends AppError {
  constructor(message) {
    super(message, 400, 'INVALID_INPUT');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

module.exports = { AppError, InputError, ConflictError };
