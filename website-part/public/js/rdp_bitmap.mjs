// RLE decoding uses the bundled mstsc.js decoder; see vendor/webrdp/NOTICE.txt.
function bytesOf(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data?.type === 'Buffer' && Array.isArray(data.data)) return Uint8Array.from(data.data);
  throw new Error('Invalid RDP bitmap data');
}

export function decodeBitmap(bitmap, module = globalThis.Module) {
  const { width, height, bitsPerPixel: bpp, destLeft: x, destTop: y, destRight, destBottom } = bitmap;
  const values = [width, height, x, y, destRight, destBottom];
  if (!values.every(Number.isInteger) || width < 1 || height < 1 || width > 4096 || height > 2160
      || x < 0 || y < 0 || destRight < x || destBottom < y
      || destRight - x + 1 > width || destBottom - y + 1 > height
      || ![15, 16, 24, 32].includes(bpp)) throw new Error('Invalid RDP bitmap dimensions or format');
  const input = bytesOf(bitmap.data);
  if (input.length > 4096 * 2160 * 4) throw new Error('RDP bitmap is too large');
  let data;
  if (bitmap.isCompress) {
    if (!module?._malloc || !module?.ccall || !module?.HEAPU8) throw new Error('RDP decoder is not ready');
    let inputPtr = 0;
    let outputPtr = 0;
    try {
      inputPtr = module._malloc(input.length);
      outputPtr = module._malloc(width * height * 4);
      if (!inputPtr || !outputPtr) throw new Error('RDP decoder allocation failed');
      module.HEAPU8.set(input, inputPtr);
      const decoded = module.ccall(`bitmap_decompress_${bpp}`, 'number', Array(7).fill('number'),
        [outputPtr, width, height, width, height, inputPtr, input.length]);
      if (decoded === 0) throw new Error('Invalid compressed RDP bitmap');
      // Copy before freeing decoder memory. The next allocation can overwrite its heap.
      data = new Uint8ClampedArray(module.HEAPU8.subarray(outputPtr, outputPtr + width * height * 4));
      // The legacy 24-bit decoder produces BGRA; other decoder entry points produce RGBA.
      if (bpp === 24) {
        for (let offset = 0; offset < data.length; offset += 4) {
          const blue = data[offset]; data[offset] = data[offset + 2]; data[offset + 2] = blue;
        }
      }
    } finally {
      if (inputPtr) module._free(inputPtr);
      if (outputPtr) module._free(outputPtr);
    }
  } else {
    const pixelBytes = Math.ceil(bpp / 8);
    const rowBytes = width * pixelBytes;
    const paddedStride = Math.ceil(rowBytes / 4) * 4;
    const stride = input.length === rowBytes * height ? rowBytes : paddedStride;
    if (input.length !== stride * height) throw new Error('Truncated RDP bitmap');
    data = new Uint8ClampedArray(width * height * 4);
    // Uncompressed protocol bitmaps contain bottom-up BGR / RGB555 / RGB565 pixels.
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const source = (height - row - 1) * stride + column * pixelBytes;
        const target = (row * width + column) * 4;
        if (bpp <= 16) {
          const pixel = input[source] | (input[source + 1] << 8);
          const greenBits = bpp === 16 ? 6 : 5;
          data[target] = Math.round(((pixel >> (5 + greenBits)) & 31) * 255 / 31);
          data[target + 1] = Math.round(((pixel >> 5) & ((1 << greenBits) - 1)) * 255 / ((1 << greenBits) - 1));
          data[target + 2] = Math.round((pixel & 31) * 255 / 31);
        } else {
          data[target] = input[source + 2];
          data[target + 1] = input[source + 1];
          data[target + 2] = input[source];
        }
        data[target + 3] = 255;
      }
    }
  }
  return { width, height, x, y, clipWidth: destRight - x + 1, clipHeight: destBottom - y + 1, data };
}

export function drawBitmap(canvas, bitmap, module) {
  const output = decodeBitmap(bitmap, module);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(output.width, output.height);
  image.data.set(output.data);
  ctx.putImageData(image, output.x, output.y, 0, 0, output.clipWidth, output.clipHeight);
}
