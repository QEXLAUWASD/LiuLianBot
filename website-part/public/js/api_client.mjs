export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN_ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function isJSONResponse(response) {
  const contentType = response.headers?.get('content-type') ?? '';
  return /(?:^|\s|;)application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType);
}

function networkError(error) {
  if (error?.name === 'AbortError') {
    return error;
  }

  return new ApiError('Network request failed', {
    status: 0,
    code: 'NETWORK_ERROR',
  });
}

export async function requestJSON(url, options = {}, fetchImpl = globalThis.fetch) {
  let response;
  let text;

  try {
    response = await fetchImpl(url, options);
    text = await response.text();
  } catch (error) {
    throw networkError(error);
  }

  if (!text) {
    if (response.ok) {
      return null;
    }

    throw new ApiError(`Request failed with status ${response.status}`, {
      status: response.status,
      code: 'HTTP_ERROR',
    });
  }

  let body = null;

  if (response.ok || isJSONResponse(response)) {
    try {
      body = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ApiError('Response contained invalid JSON', {
          status: response.status,
          code: 'INVALID_JSON',
        });
      }
    }
  }

  if (!response.ok) {
    const message =
      typeof body?.message === 'string' && body.message
        ? body.message
        : `Request failed with status ${response.status}`;
    const code = typeof body?.code === 'string' && body.code ? body.code : 'HTTP_ERROR';

    throw new ApiError(message, { status: response.status, code });
  }

  return body;
}
