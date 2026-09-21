// Streaming ZIP writer used by the file browser's "pack into one file" action.
//
// The Router has to pack FnOS directories that may be much larger than its
// memory, so this writer never buffers file contents: SFTP read streams are
// compressed and pushed straight into the HTTP response while only the CRC,
// the running byte counts and the central directory stay in memory.
//
// Zip32 only: no Zip64 records are emitted, so a finished archive must stay
// below 4 GiB. The caller checks the selected size up front and the writer
// refuses to cross the limit mid-download.
const { createDeflateRaw } = require('node:zlib');
const path = require('node:path').posix;
const { Transform, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { AppError } = require('../errors');

const ZIP_LIMIT = 0xffffffff;
const LOCAL_HEADER = 0x04034b50;
const DATA_DESCRIPTOR = 0x08074b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;
const VERSION_MADE_BY = 0x031e; // UNIX host, ZIP spec 3.0
// `<<` produces a signed 32-bit value; both modes are written as unsigned.
const FILE_MODE = (0o100644 << 16) >>> 0;
const DIRECTORY_MODE = ((0o40755 << 16) | 0x10) >>> 0;
// Bit 3 moves the sizes into a trailing data descriptor (they are unknown while
// streaming) and bit 11 marks the names as UTF-8.
const STREAMED_FLAGS = 0x0008 | 0x0800;
const UTF8_FLAGS = 0x0800;
// Deflating already-compressed media and archives wastes the Router's CPU and
// usually grows the file, so those extensions are stored as-is.
const STORED_EXTENSIONS = new Set([
  '.7z', '.aac', '.avi', '.bz2', '.flac', '.gif', '.gz', '.heic', '.jpeg',
  '.jpg', '.m4a', '.mkv', '.mov', '.mp3', '.mp4', '.ogg', '.png', '.rar',
  '.webp', '.xz', '.zip',
]);

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function startCrc() { return 0xffffffff; }

function updateCrc(crc, chunk) {
  let value = crc;
  for (let index = 0; index < chunk.length; index += 1) {
    value = CRC_TABLE[(value ^ chunk[index]) & 0x0ff] ^ (value >>> 8);
  }
  return value >>> 0;
}

function finishCrc(crc) { return (crc ^ 0xffffffff) >>> 0; }

// MS-DOS timestamps: the ZIP format has no timezone, so entries keep the local
// time the file page shows.
function dosStamp(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function resolvedStamp(modified, fallback) {
  const date = modified instanceof Date ? modified : new Date(modified ?? NaN);
  return Number.isNaN(date.getTime()) ? fallback : dosStamp(date);
}

function localHeader({ nameLength, method, flags, stamp }) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_HEADER, 0);
  header.writeUInt16LE(20, 4); // version needed to extract: 2.0
  header.writeUInt16LE(flags, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(stamp.time, 10);
  header.writeUInt16LE(stamp.date, 12);
  header.writeUInt32LE(0, 14); // crc, sizes and the data descriptor slot
  header.writeUInt32LE(0, 18);
  header.writeUInt32LE(0, 22);
  header.writeUInt16LE(nameLength, 26);
  header.writeUInt16LE(0, 28); // no extra field
  return header;
}

function dataDescriptor({ crc, compressed, uncompressed }) {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(DATA_DESCRIPTOR, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(compressed, 8);
  descriptor.writeUInt32LE(uncompressed, 12);
  return descriptor;
}

function centralHeader({ nameBuffer, method, flags, stamp, crc, compressed, uncompressed, offset, directory }) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_HEADER, 0);
  header.writeUInt16LE(VERSION_MADE_BY, 4);
  header.writeUInt16LE(20, 6); // version needed to extract: 2.0
  header.writeUInt16LE(flags, 8);
  header.writeUInt16LE(method, 10);
  header.writeUInt16LE(stamp.time, 12);
  header.writeUInt16LE(stamp.date, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressed, 20);
  header.writeUInt32LE(uncompressed, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30); // extra field length
  header.writeUInt16LE(0, 32); // comment length
  header.writeUInt16LE(0, 34); // disk number
  header.writeUInt16LE(0, 36); // internal attributes
  header.writeUInt32LE(directory ? DIRECTORY_MODE : FILE_MODE, 38);
  header.writeUInt32LE(offset, 42);
  return header;
}

function endRecord({ entries, size, offset }) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(END_RECORD, 0);
  record.writeUInt16LE(0, 4); // this disk
  record.writeUInt16LE(0, 6); // disk holding the central directory
  record.writeUInt16LE(entries, 8);
  record.writeUInt16LE(entries, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  record.writeUInt16LE(0, 20); // no archive comment
  return record;
}

function waitForDrain(output) {
  return new Promise((resolve, reject) => {
    const settle = (callback, value) => {
      output.off('drain', onDrain);
      output.off('error', onError);
      output.off('close', onClose);
      callback(value);
    };
    const onDrain = () => settle(resolve);
    const onError = error => settle(reject, error);
    // A closed response means the recipient stopped the download; stop packing.
    const onClose = () => settle(reject, new AppError('下載連線已中斷', 499, 'FILES_ARCHIVE_ABORTED'));
    output.once('drain', onDrain);
    output.once('error', onError);
    output.once('close', onClose);
  });
}

// Writable adapter so `pipeline` can drive the deflater while the archive
// controls backpressure against the HTTP response.
function responseSink(archive) {
  return new Writable({
    write(chunk, encoding, done) {
      archive.writeChunk(chunk).then(() => done(), done);
    },
  });
}

class ZipArchive {
  constructor(output, { limit = ZIP_LIMIT, maxEntries = 0xffff, now = new Date(), deflateLevel = 6 } = {}) {
    this.output = output;
    this.limit = limit;
    this.maxEntries = maxEntries;
    this.stamp = dosStamp(now);
    this.deflateLevel = deflateLevel;
    this.offset = 0;
    this.entries = [];
    this.finished = false;
  }

  async writeChunk(chunk) {
    if (this.finished) throw new AppError('壓縮檔已結束', 500);
    if (this.offset + chunk.length > this.limit) throw new AppError('打包後的檔案超過 4 GiB 上限', 413, 'FILES_ARCHIVE_TOO_LARGE');
    this.offset += chunk.length;
    if (!this.output.write(chunk)) await waitForDrain(this.output);
  }

  reserveEntry() {
    if (this.entries.length >= this.maxEntries) throw new AppError('壓縮檔項目過多', 413, 'FILES_ARCHIVE_TOO_LARGE');
  }

  async writeEntryHeader({ name, method, flags, stamp }) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const offset = this.offset;
    await this.writeChunk(localHeader({ nameLength: nameBuffer.length, method, flags, stamp }));
    await this.writeChunk(nameBuffer);
    return { nameBuffer, offset };
  }

  // Directories are written with known zero sizes, so they need no descriptor.
  async addDirectory(name, { modified } = {}) {
    this.reserveEntry();
    const stamp = resolvedStamp(modified, this.stamp);
    const { nameBuffer, offset } = await this.writeEntryHeader({ name, method: 0, flags: UTF8_FLAGS, stamp });
    this.entries.push({ nameBuffer, method: 0, flags: UTF8_FLAGS, stamp, crc: 0, compressed: 0, uncompressed: 0, offset, directory: true });
  }

  async addFile(name, source, { modified } = {}) {
    this.reserveEntry();
    const method = STORED_EXTENSIONS.has(path.extname(name).toLowerCase()) ? 0 : 8;
    const stamp = resolvedStamp(modified, this.stamp);
    const { nameBuffer, offset } = await this.writeEntryHeader({ name, method, flags: STREAMED_FLAGS, stamp });

    let crc = startCrc();
    let uncompressed = 0;
    const counter = new Transform({
      transform(chunk, encoding, done) {
        crc = updateCrc(crc, chunk);
        uncompressed += chunk.length;
        done(null, chunk);
      },
    });
    const dataStart = this.offset;
    const streams = [source, counter];
    if (method === 8) streams.push(createDeflateRaw({ level: this.deflateLevel }));
    streams.push(responseSink(this));
    await pipeline(streams);

    const record = {
      nameBuffer, method, flags: STREAMED_FLAGS, stamp,
      crc: finishCrc(crc), uncompressed, compressed: this.offset - dataStart, offset, directory: false,
    };
    await this.writeChunk(dataDescriptor(record));
    this.entries.push(record);
  }

  async finish() {
    const directory = Buffer.concat(this.entries.flatMap(entry => [centralHeader(entry), entry.nameBuffer]));
    const offset = this.offset;
    await this.writeChunk(directory);
    await this.writeChunk(endRecord({ entries: this.entries.length, size: directory.length, offset }));
    this.finished = true;
  }
}

module.exports = { ZipArchive, ZIP_LIMIT, STORED_EXTENSIONS, dosStamp, updateCrc, finishCrc, startCrc };
