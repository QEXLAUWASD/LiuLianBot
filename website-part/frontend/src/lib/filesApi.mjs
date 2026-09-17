import { ApiError } from './apiClient.mjs';

// Every authenticated mutation carries a non-simple header, so a cross-site
// form cannot reach the write endpoints. The Express router rejects requests
// that omit it.
export const FILES_REQUEST_HEADER = 'X-Files-Request';

export const UPLOAD_LIMIT = 1024 ** 3;

export const SHARE_HOURS = Object.freeze([
  { value: 1, label: '1 小時' },
  { value: 24, label: '1 天' },
  { value: 168, label: '7 天' },
]);

function requestInit({ method, body, binary }) {
  const headers = { [FILES_REQUEST_HEADER]: '1' };
  if (body !== undefined) {
    headers['Content-Type'] = binary ? 'application/octet-stream' : 'application/json';
  }
  return {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
  };
}

function isJSON(response) {
  return (response.headers?.get?.('content-type') ?? '').includes('application/json');
}

async function failureMessage(response) {
  try {
    const payload = await response.json();
    if (typeof payload?.error === 'string' && payload.error) return payload.error;
  } catch (_) {
    // Non JSON responses keep the HTTP status wording.
  }
  return `操作失敗 (${response.status})`;
}

// Thin wrapper over `/api/files`: JSON in, JSON out, binary only for uploads.
export async function filesRequest(path, { method = 'GET', body, binary = false } = {}, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(`/api/files${path}`, requestInit({ method, body, binary }));
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('無法連線至檔案服務，請稍後再試', { status: 0, code: 'NETWORK_ERROR' });
  }

  if (!response.ok) {
    throw new ApiError(await failureMessage(response), { status: response.status });
  }
  return response.status === 204 || !isJSON(response) ? null : response.json();
}

export function joinPath(parent, child) {
  return [parent, child].filter(Boolean).join('/');
}

export function formatSize(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} B`;
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return `${(value / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`;
}

export function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

// Folder names are pasted straight into SFTP paths, so separators and control
// characters are rejected before the request is sent.
export function entryName(value) {
  if (!value || value === '.' || value === '..' || /[/\\\x00-\x1f\x7f]/.test(value)) {
    throw new Error('名稱不能留空或包含斜線與控制字元');
  }
  return value;
}

export function breadcrumbTrail(path) {
  return path.split('/').filter(Boolean).reduce((trail, part) => {
    const target = joinPath(trail.at(-1)?.path, part);
    trail.push({ name: part, path: target });
    return trail;
  }, []);
}
