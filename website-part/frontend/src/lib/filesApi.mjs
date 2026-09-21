import { ApiError } from './apiClient.mjs';

// Every authenticated mutation carries a non-simple header, so a cross-site
// form cannot reach the write endpoints. The Express router rejects requests
// that omit it.
export const FILES_REQUEST_HEADER = 'X-Files-Request';

export const UPLOAD_LIMIT = 1024 ** 3;
export const ARCHIVE_LIMIT = 50;
export const ARCHIVE_TYPE = 'application/zip';

export const SHARE_HOURS = Object.freeze([
  { value: 1, label: '1 小時' },
  { value: 24, label: '1 天' },
  { value: 168, label: '7 天' },
]);

// The server derives the same name, but the browser has to know it before the
// request starts: the save dialog may only open during the click that began it.
export function suggestArchiveName(paths, now = new Date()) {
  if (paths.length === 1) return `${paths[0].split('/').filter(Boolean).pop()}.zip`;
  const pad = value => String(value).padStart(2, '0');
  return `FnOS-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}

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

// The Router sends an RFC 6266 header; prefer the UTF-8 form so Chinese file
// names keep their real spelling.
export function attachmentFilename(header) {
  if (typeof header !== 'string') return '';
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch (_) {
      return '';
    }
  }
  const plain = /filename="([^"]*)"/i.exec(header);
  return plain ? plain[1] : '';
}

// Streams the response straight into a file the user picks when the browser
// supports the File System Access API, and falls back to a blob download
// otherwise, so a large archive is not kept in memory.
export async function saveArchive(response, filename, writable) {
  if (writable && typeof response.body?.pipeTo === 'function') {
    await response.body.pipeTo(writable);
    return;
  }
  const url = globalThis.URL.createObjectURL(await response.blob());
  try {
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    globalThis.document.body.append(link);
    link.click();
    link.remove();
  } finally {
    globalThis.URL.revokeObjectURL(url);
  }
}

// Packs the given paths into one ZIP on the server and downloads it. The paths
// travel in the body, so very long selections never hit a URL length limit.
export async function downloadArchive(paths, { fetchImpl = globalThis.fetch, picker = globalThis.showSaveFilePicker } = {}) {
  const suggested = suggestArchiveName(paths);
  // Chrome only opens the save dialog while the click that started the download
  // still counts as a user gesture, so the handle is requested before the fetch.
  const writable = typeof picker === 'function'
    ? await (await picker({
      suggestedName: suggested,
      types: [{ description: 'ZIP 壓縮檔', accept: { [ARCHIVE_TYPE]: ['.zip'] } }],
    })).createWritable()
    : null;
  let response;
  try {
    response = await fetchImpl('/api/files/archive', requestInit({ method: 'POST', body: { paths, name: suggested } }));
  } catch (error) {
    await writable?.abort?.();
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('無法連線至檔案服務，請稍後再試', { status: 0, code: 'NETWORK_ERROR' });
  }
  if (!response.ok) {
    const message = await failureMessage(response);
    await writable?.abort?.();
    throw new ApiError(message, { status: response.status });
  }
  const filename = attachmentFilename(response.headers?.get?.('content-disposition')) || suggested;
  await saveArchive(response, filename, writable);
  return filename;
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
