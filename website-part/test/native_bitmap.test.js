const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareNativeBitmapEncoder } = require('../src/services/native_bitmap');
const rect = { width: 1, height: 1, destLeft: 0, destTop: 0, destRight: 0, destBottom: 0, bitsPerPixel: 24 };
test('native RDP output converts bottom-up BGR to copied top-down RGBA', async () => {
  const encode = await prepareNativeBitmapEncoder();
  const input = Buffer.from([0, 0, 255]);
  const output = encode({ ...rect, isCompress: false, data: input });
  input.fill(0);
  assert.deepEqual([...output.data], [255, 0, 0, 255]);
  assert.equal(output.format, 'rgba');
  assert.equal(output.clipWidth, 1);
});
test('native RDP output uses the real RLE decoder and copies its heap', async () => {
  const encode = await prepareNativeBitmapEncoder();
  const first = encode({ ...rect, isCompress: true, data: Buffer.from([0x81, 0, 0, 255]) });
  encode({ ...rect, isCompress: true, data: Buffer.from([0x81, 0, 255, 0]) });
  assert.deepEqual([...first.data], [255, 0, 0, 255]);
});
test('native RDP rejects invalid dimensions and truncated bitmap input', async () => {
  const encode = await prepareNativeBitmapEncoder();
  assert.throws(() => encode({ ...rect, width: 999999, data: Buffer.alloc(0) }), /Invalid/);
  assert.throws(() => encode({ ...rect, isCompress: false, data: Buffer.from([0]) }), /Truncated/);
});
