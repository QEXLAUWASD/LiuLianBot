const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path').posix;
const { randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const { inflateRawSync, crc32 } = require('node:zlib');
const { ZipArchive } = require('../src/services/zip_archive');
const {
  collectArchiveEntries, writeArchive, archiveFileName, archiveRequestedName, attachmentHeader,
} = require('../src/services/file_storage');

// Minimal reader for the archives the writer produces: it walks the central
// directory (which carries the real sizes and CRCs after the streamed data
// descriptors) and inflates each entry.
function findEndRecord(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return {
        entries: buffer.readUInt16LE(offset + 10),
        size: buffer.readUInt32LE(offset + 12),
        offset: buffer.readUInt32LE(offset + 16),
      };
    }
  }
  throw new Error('ZIP 結尾記錄不存在');
}

function readArchive(buffer) {
  const end = findEndRecord(buffer);
  const entries = [];
  let pointer = end.offset;
  for (let index = 0; index < end.entries; index += 1) {
    assert.equal(buffer.readUInt32LE(pointer), 0x02014b50, '中央目錄簽章');
    const method = buffer.readUInt16LE(pointer + 10);
    const crc = buffer.readUInt32LE(pointer + 16);
    const compressed = buffer.readUInt32LE(pointer + 20);
    const uncompressed = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8');

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, '本機檔頭簽章');
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + buffer.readUInt16LE(localOffset + 26));
    assert.equal(localName.toString('utf8'), name, '本機檔頭名稱需與中央目錄相同');
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const data = buffer.subarray(dataStart, dataStart + compressed);
    entries.push({
      name,
      method,
      crc,
      compressed,
      uncompressed,
      data,
      content: method === 8 ? inflateRawSync(data) : data,
    });
    pointer = pointer + 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(pointer, end.offset + end.size, '中央目錄長度需與結尾記錄一致');
  return entries;
}

function collector() {
  const chunks = [];
  return {
    ended: false,
    write(chunk) { chunks.push(Buffer.from(chunk)); return true; },
    // `finish()` closes the output, so keep the callback contract of a real
    // HTTP response; a missing close would leave the browser waiting.
    end(callback) { this.ended = true; callback?.(); },
    buffer() { return Buffer.concat(chunks); },
  };
}

function fileAttrs(size, mtime = 1700000000) {
  return { size, mtime, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false };
}

function dirAttrs(mtime = 1700000000) {
  return { size: 0, mtime, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false };
}

// A stand-in for an ssh2 SFTP channel over a plain path tree.
function fakeSftp(tree) {
  const lookup = target => {
    const item = tree[target];
    if (!item) return null;
    return item.content === undefined ? dirAttrs(item.mtime) : fileAttrs(Buffer.byteLength(item.content), item.mtime);
  };
  return {
    realpath: (target, callback) => callback(null, target),
    stat: (target, callback) => {
      const attrs = lookup(target);
      return attrs ? callback(null, attrs) : callback(Object.assign(new Error('no such file'), { code: 2 }));
    },
    lstat: (target, callback) => lookup(target)
      ? callback(null, lookup(target))
      : callback(Object.assign(new Error('no such file'), { code: 2 })),
    readdir: (target, callback) => {
      const item = tree[target];
      if (!item || item.content !== undefined) return callback(Object.assign(new Error('not a directory'), { code: 2 }));
      return callback(null, item.children.map(name => ({
        filename: name,
        attrs: lookup(path.join(target, name)),
      })));
    },
    createReadStream: target => Readable.from([Buffer.from(tree[target].content)]),
  };
}

const TREE = {
  '/vol1/1000': { children: ['相片', 'a.txt', 'empty'] },
  '/vol1/1000/相片': { children: ['b.txt', 'b.txt.jpg'] },
  '/vol1/1000/empty': { children: [] },
  '/vol1/1000/a.txt': { content: 'root file' },
  '/vol1/1000/相片/b.txt': { content: '照片說明' },
  '/vol1/1000/相片/b.txt.jpg': { content: 'JPEGDATA' },
  '/vol2/1000': { children: ['a.txt'] },
  '/vol2/1000/a.txt': { content: 'other disk' },
};

test('the ZIP writer streams entries with correct CRCs, methods and names', async () => {
  const output = collector();
  const archive = new ZipArchive(output, { now: new Date('2026-09-21T10:20:30Z') });
  await archive.addDirectory('相片/');
  await archive.addFile('相片/a.txt', Readable.from([Buffer.from('hello '), Buffer.from('world')]));
  await archive.addFile('empty.bin', Readable.from([]));
  await archive.addFile('movie.mp4', Readable.from([Buffer.from('video bytes')]));
  await archive.finish();

  const entries = readArchive(output.buffer());
  assert.deepEqual(entries.map(entry => entry.name), ['相片/', '相片/a.txt', 'empty.bin', 'movie.mp4']);
  assert.deepEqual(entries.map(entry => entry.method), [0, 8, 8, 0]);
  assert.equal(entries[0].uncompressed, 0, '資料夾項目沒有內容');
  assert.equal(entries[1].content.toString('utf8'), 'hello world');
  assert.equal(entries[1].crc, crc32(Buffer.from('hello world')));
  assert.equal(entries[1].uncompressed, 11);
  assert.equal(entries[2].uncompressed, 0, '空檔案仍會建立項目');
  assert.equal(entries[3].content.toString('utf8'), 'video bytes', '已壓縮的副檔名以原樣存放');
  assert.ok(entries[3].compressed >= entries[3].uncompressed);
});

test('finishing the archive closes the output and refuses further entries', async () => {
  const output = collector();
  const archive = new ZipArchive(output);
  await archive.addFile('a.txt', Readable.from([Buffer.from('x')]));
  await archive.finish();
  assert.equal(output.ended, true, 'the response is closed so the download ends');
  await assert.rejects(archive.addFile('b.txt', Readable.from([Buffer.from('y')])), /壓縮檔已結束/);
});

test('the ZIP writer stops packing once the archive would pass 4 GiB', async () => {
  const output = collector();
  const archive = new ZipArchive(output, { limit: 1024 });
  // Random bytes do not shrink, so the guard is reached while streaming.
  await assert.rejects(
    archive.addFile('big.bin', Readable.from([randomBytes(4096)])),
    error => error.statusCode === 413 && /4 GiB/.test(error.message),
  );
  assert.equal(archive.finished, false);
});

test('the archive plan follows folders recursively, keeps empty folders and prefixes clashing names', async () => {
  const sftp = fakeSftp(TREE);
  const entries = await collectArchiveEntries(sftp, ['vol1/相片', 'vol1/empty', 'vol1/a.txt']);
  assert.deepEqual(entries.map(entry => entry.name), ['相片/', '相片/b.txt', '相片/b.txt.jpg', 'empty/', 'a.txt']);
  assert.deepEqual(entries.filter(entry => entry.directory).map(entry => entry.name), ['相片/', 'empty/']);

  const clashing = await collectArchiveEntries(sftp, ['vol1/a.txt', 'vol2/a.txt']);
  assert.deepEqual(clashing.map(entry => entry.name), ['vol1/a.txt', 'vol2/a.txt']);
});

test('the archive plan refuses oversized selections', async () => {
  const sftp = fakeSftp(TREE);
  await assert.rejects(collectArchiveEntries(sftp, ['vol1/相片'], { maxEntries: 1 }),
    error => error.statusCode === 413 && /最多 1 個項目/.test(error.message));
  await assert.rejects(collectArchiveEntries(sftp, ['vol1/相片'], { maxBytes: 4 }),
    error => error.statusCode === 413 && /4 GiB/.test(error.message));
});

test('writing the archive streams every planned entry from SFTP', async () => {
  const sftp = fakeSftp(TREE);
  const entries = await collectArchiveEntries(sftp, ['vol1/相片', 'vol1/a.txt']);
  const output = collector();
  await writeArchive({ sftp, entries, output });

  const archive = readArchive(output.buffer());
  assert.deepEqual(archive.map(entry => entry.name), ['相片/', '相片/b.txt', '相片/b.txt.jpg', 'a.txt']);
  assert.deepEqual(
    Object.fromEntries(archive.filter(entry => entry.name.endsWith('.txt')).map(entry => [entry.name, entry.content.toString('utf8')])),
    { '相片/b.txt': '照片說明', 'a.txt': 'root file' },
  );
});

test('archive names and the attachment header stay usable for non-ASCII entries', () => {
  assert.equal(archiveFileName(['vol1/a.txt']), 'a.txt.zip');
  assert.equal(archiveFileName(['vol1/相片']), '相片.zip');
  assert.match(archiveFileName(['vol1/a.txt', 'vol2/a.txt'], new Date('2026-09-21T10:20:30Z')), /^FnOS-20260921-\d{4}\.zip$/);
  assert.equal(
    attachmentHeader('相片.zip'),
    'attachment; filename="__.zip"; filename*=UTF-8\'\'%E7%9B%B8%E7%89%87.zip',
  );
});

test('archiving relative to a share root stays inside that folder', async () => {
  const sftp = fakeSftp(TREE);
  const entries = await collectArchiveEntries(sftp, ['b.txt', 'b.txt.jpg'], { base: '/vol1/1000/相片' });
  assert.deepEqual(entries.map(entry => entry.name), ['b.txt', 'b.txt.jpg']);
  assert.deepEqual(entries.map(entry => entry.target), ['/vol1/1000/相片/b.txt', '/vol1/1000/相片/b.txt.jpg']);

  // Shares resolve against their own root, so traversal and names outside the
  // share are rejected the same way a volume root rejects them.
  await assert.rejects(collectArchiveEntries(sftp, ['../a.txt'], { base: '/vol1/1000/相片' }), /無效的檔案路徑/);
  // A missing entry surfaces as the raw SFTP code here; `createStorage` maps it
  // to a 404 for the API.
  await assert.rejects(collectArchiveEntries(sftp, ['nope.txt'], { base: '/vol1/1000/相片' }),
    error => error.code === 2);
});

test('a client-suggested archive name is validated before it reaches the header', () => {
  assert.equal(archiveRequestedName('照片備份.zip', ['vol1/相片']), '照片備份.zip');
  assert.equal(archiveRequestedName('report.ZIP', ['vol1/相片']), 'report.ZIP');
  // Paths, control characters, dot files and other suffixes fall back instead.
  assert.equal(archiveRequestedName('../evil.zip', ['vol1/相片']), 'evil.zip');
  assert.equal(archiveRequestedName('..zip', ['vol1/相片']), '相片.zip');
  assert.equal(archiveRequestedName('bad\u0000name.zip', ['vol1/相片']), 'badname.zip');
  assert.equal(archiveRequestedName('notes.txt', ['vol1/相片']), '相片.zip');
  assert.equal(archiveRequestedName('x'.repeat(200), ['vol1/相片']), '相片.zip');
  assert.equal(archiveRequestedName(undefined, ['vol1/a.txt']), 'a.txt.zip');
});
