// Native clients consume copied, top-down RGBA bytes. Reuse the same validated
// decoder as the browser so channel order and RLE behavior stay consistent.
let decoderPromise;
function prepareNativeBitmapEncoder() {
  decoderPromise ||= import('../../frontend/src/lib/rdp/rdpBitmap.mjs').then(({ decodeBitmap }) => {
    const rle = require('@electerm/rdpjs/rdp/core').rle;
    return bitmap => {
      const output = decodeBitmap(bitmap, rle);
      return { ...output, format: 'rgba', data: Buffer.from(output.data) };
    };
  });
  return decoderPromise;
}
module.exports = { prepareNativeBitmapEncoder };
