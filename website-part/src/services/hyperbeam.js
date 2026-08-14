const DEFAULT_ENDPOINT = 'https://engine.hyperbeam.com/v0/vm';

class HyperbeamApiError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'HyperbeamApiError';
    this.statusCode = statusCode;
  }
}

function normalizeStartUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new HyperbeamApiError('A start URL is required', 400);

  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw new HyperbeamApiError('Start URL must use http:// or https://', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new HyperbeamApiError('Start URL must use http:// or https://', 400);
  }
  return url.toString();
}

function hyperbeamConfig(env = process.env) {
  return {
    apiKey: String(env.HYPERBEAM_API_KEY || '').trim(),
    endpoint: String(env.HYPERBEAM_API_URL || DEFAULT_ENDPOINT).trim(),
    region: String(env.HYPERBEAM_REGION || 'AS').trim().toUpperCase(),
  };
}

async function createHyperbeamSession({
  startUrl,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = normalizeStartUrl(startUrl);
  const config = hyperbeamConfig(env);
  if (!config.apiKey) throw new HyperbeamApiError('Hyperbeam is not configured', 503);
  if (typeof fetchImpl !== 'function') throw new HyperbeamApiError('Fetch is unavailable', 500);

  let response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_url: url,
        kiosk: true,
        region: config.region,
        width: 1280,
        height: 720,
        timeout: { inactive: 3600, absolute: 14400, offline: 300 },
      }),
    });
  } catch (_) {
    throw new HyperbeamApiError('Unable to reach Hyperbeam', 502);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : 'Hyperbeam session creation failed';
    throw new HyperbeamApiError(message, response.status >= 400 && response.status < 500 ? 502 : 503);
  }
  if (!data?.embed_url || typeof data.embed_url !== 'string') {
    throw new HyperbeamApiError('Hyperbeam returned an invalid session', 502);
  }

  return {
    sessionId: typeof data.session_id === 'string' ? data.session_id : null,
    embedUrl: data.embed_url,
    adminToken: typeof data.admin_token === 'string' ? data.admin_token : null,
  };
}

module.exports = { DEFAULT_ENDPOINT, HyperbeamApiError, createHyperbeamSession, hyperbeamConfig, normalizeStartUrl };
