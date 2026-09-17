const path = require('node:path').posix;
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { Client } = require('ssh2');
const { AppError, InputError } = require('../errors');

function relativePath(value = '') {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\x00-\x1f\x7f]/.test(value) || path.isAbsolute(value)) {
    throw new InputError('無效的檔案路徑');
  }
  const parts = value.split('/').filter(Boolean);
  if (parts.some(part => part === '..' || part === '.')) throw new InputError('無效的檔案路徑');
  return parts.join('/');
}
function inside(root, target) { return target === root || target.startsWith(root + '/'); }
function config(env = process.env) {
  const fingerprint = env.FILES_SFTP_HOST_SHA256;
  if (!env.FILES_SFTP_HOST || !env.FILES_SFTP_USER || !env.FILES_SFTP_PASSWORD || !/^[a-f0-9]{64}$/i.test(fingerprint || '')) {
    throw new AppError('檔案服務尚未設定，請聯絡 LiuLian', 503, 'FILES_NOT_CONFIGURED');
  }
  const port = Number(env.FILES_SFTP_PORT || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError('檔案服務連接埠設定有誤', 503);
  return {
    host: env.FILES_SFTP_HOST, port, username: env.FILES_SFTP_USER,
    password: env.FILES_SFTP_PASSWORD, hostHash: 'sha256',
    hostVerifier: hash => hash === fingerprint.toLowerCase(), readyTimeout: 15000,
    keepaliveInterval: 10000, keepaliveCountMax: 3,
  };
}
const call = (sftp, method, ...args) => new Promise((resolve, reject) => {
  sftp[method](...args, (err, result) => err ? reject(err) : resolve(result));
});
function sourcePath(relative) {
  const normalized = relativePath(relative);
  const [volume, ...parts] = normalized.split('/');
  if (!/^vol[a-zA-Z0-9_-]*$/.test(volume)) throw new InputError('請選擇儲存磁碟');
  return { root: `/${volume}/1000`, relative: parts.join('/'), normalized };
}
async function resolveTarget(sftp, root, relative = '') {
  const normalized = relativePath(relative);
  const canonicalRoot = await call(sftp, 'realpath', root);
  // Volume roots must be real directories, not aliases into other system paths.
  if (canonicalRoot !== root) throw new AppError('不允許以符號連結作為儲存目錄', 403);
  let target = canonicalRoot;
  for (const part of normalized.split('/').filter(Boolean)) {
    target = path.join(target, part);
    const stat = await call(sftp, 'lstat', target);
    if (stat.isSymbolicLink()) throw new AppError('不允許存取符號連結', 403, 'FILES_LINK_DENIED');
  }
  const canonical = await call(sftp, 'realpath', target);
  if (!inside(canonicalRoot, canonical)) throw new AppError('無法存取此路徑', 403);
  const stat = await call(sftp, 'stat', canonical);
  if (!stat.isDirectory() && !stat.isFile()) throw new AppError('不支援此檔案類型', 403);
  return { target: canonical, stat, relative: normalized };
}
async function resolve(sftp, relative) {
  const source = sourcePath(relative);
  return resolveTarget(sftp, source.root, source.relative);
}
async function destination(sftp, relative) {
  const source = sourcePath(relative);
  if (!source.relative) throw new InputError('不能修改儲存磁碟根目錄');
  const parent = await resolveTarget(sftp, source.root, path.dirname(source.relative) === '.' ? '' : path.dirname(source.relative));
  if (!parent.stat.isDirectory()) throw new InputError('上層路徑不是資料夾');
  return path.join(parent.target, path.basename(source.relative));
}
function createStorage(env = process.env) {
  let active = 0;
  async function run(operation) {
    const options = config(env);
    if (active >= 8) throw new AppError('檔案服務忙碌，請稍後重試', 503);
    active++;
    const client = new Client();
    client.on('error', () => {});
    try {
      const sftp = await new Promise((resolve, reject) => {
        client.once('error', reject);
        client.once('close', () => reject(new Error('SFTP connection closed')));
        client.once('ready', () => client.sftp((err, channel) => err ? reject(err) : resolve(channel)));
        client.connect(options);
      });
      return await operation(sftp);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err.code === 2) throw new AppError('找不到檔案或資料夾', 404, 'FILE_NOT_FOUND');
      if (err.code === 3) throw new AppError('沒有權限讀取此檔案', 403);
      if (err.code === 4 || err.code === 11) throw new AppError('操作失敗：項目可能已存在、資料夾非空或磁碟空間不足', 409);
      throw new AppError('無法存取 FnOS，請稍後再試', 502, 'FILES_UNAVAILABLE');
    } finally { client.end(); active--; }
  }
  return {
    async inspect(relative) {
      return run(async sftp => {
        const item = await resolve(sftp, relative);
        return { path: relativePath(relative), name: path.basename(relative), directory: item.stat.isDirectory() };
      });
    },
    async list(relative) {
      return run(async sftp => {
        if (!relativePath(relative)) {
          const volumes = (await call(sftp, 'readdir', '/')).filter(entry => /^vol[a-zA-Z0-9_-]*$/.test(entry.filename) && entry.attrs.isDirectory());
          const entries = [];
          for (const entry of volumes) {
            try {
              const item = await resolve(sftp, entry.filename);
              if (item.stat.isDirectory()) entries.push({ name: entry.filename, directory: true, size: 0, modified: null });
            } catch (err) { if (![2, 3].includes(err.code) && !(err instanceof AppError)) throw err; }
          }
          return entries.sort((a, b) => a.name.localeCompare(b.name));
        }
        const item = await resolve(sftp, relative);
        if (!item.stat.isDirectory()) throw new InputError('此路徑不是資料夾');
        const entries = await call(sftp, 'readdir', item.target);
        return entries.filter(entry => entry.filename !== '.' && entry.filename !== '..' &&
          !/[\/\\\x00-\x1f\x7f]/.test(entry.filename) && (entry.attrs.isDirectory() || entry.attrs.isFile()))
          .map(entry => ({ name: entry.filename, directory: entry.attrs.isDirectory(), size: entry.attrs.size,
            modified: new Date(entry.attrs.mtime * 1000).toISOString() }))
          .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
      });
    },
    async download(relative, res) {
      return run(async sftp => {
        const item = await resolve(sftp, relative);
        if (!item.stat.isFile()) throw new InputError('請選擇檔案下載');
        res.attachment(path.basename(relative));
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Length', String(item.stat.size));
        res.set('X-Content-Type-Options', 'nosniff');
        await pipeline(sftp.createReadStream(item.target), res);
      });
    },
    async mkdir(relative) { return run(async sftp => call(sftp, 'mkdir', await destination(sftp, relative))); },
    async rename(from, to) {
      return run(async sftp => {
        if (!sourcePath(from).relative || sourcePath(from).root !== sourcePath(to).root) throw new InputError('只能在同一磁碟內移動項目');
        const item = await resolve(sftp, from);
        const dest = await destination(sftp, to);
        try { await call(sftp, 'lstat', dest); throw new AppError('目標名稱已存在', 409); }
        catch (err) { if (err.code !== 2) throw err; }
        // Standard SFTP rename fails if destination exists (no overwrite extension).
        await call(sftp, 'rename', item.target, dest);
      });
    },
    async remove(relative) {
      return run(async sftp => {
        if (!sourcePath(relative).relative) throw new InputError('不能刪除儲存磁碟根目錄');
        const item = await resolve(sftp, relative);
        await call(sftp, item.stat.isDirectory() ? 'rmdir' : 'unlink', item.target);
      });
    },
    async upload(relative, input) {
      return run(async sftp => {
        const dest = await destination(sftp, relative);
        // Exclusive create prevents accidentally truncating existing files or following a leaf symlink.
        const output = sftp.createWriteStream(dest, { flags: 'wx', mode: 0o600 });
        let opened = false;
        output.once('open', () => { opened = true; });
        let bytes = 0;
        const limit = new Transform({ transform(chunk, encoding, done) {
          bytes += chunk.length;
          if (bytes > 1024 ** 3) return done(new AppError('單次上傳上限為 1 GiB', 413));
          done(null, chunk);
        } });
        try { await pipeline(input, limit, output); }
        catch (err) { if (opened) await call(sftp, 'unlink', dest).catch(() => {}); throw err; }
      });
    },
  };
}
module.exports = { createStorage, relativePath, inside, resolveTarget, sourcePath, config };
