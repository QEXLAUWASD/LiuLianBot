import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';

import { decodeBitmap } from '../../frontend/src/lib/rdp/rdpBitmap.mjs';

const decoder = new Script(
  readFileSync(new URL('../../frontend/static/vendor/webrdp/rle.js', import.meta.url), 'utf8'),
  { filename: 'vendor/webrdp/rle.js' },
);

function loadBrowserDecoder(module) {
  // Do not provide Node's process, require or module: the real browser branch
  // must initialize without the string compilation blocked by script-src self.
  const browser = { console: { log() {}, error() {}, warn() {} } };
  if (module !== undefined) browser.Module = module;
  browser.window = browser;
  const context = createContext(browser, {
    codeGeneration: { strings: false, wasm: false },
  });
  decoder.runInContext(context, { timeout: 2000 });
  assert.equal(context.ENVIRONMENT_IS_WEB, true);
  assert.equal(context.ENVIRONMENT_IS_NODE, false);
  return context.Module;
}

const literalRuns = [
  [16, [0x82, 0x1f, 0, 0, 0xf8]],
  [24, [0x82, 255, 0, 0, 0, 0, 255]],
];

function assertDecoderReady(module) {
  assert.equal(module.calledRun, true, 'runtime initializes before the decoder is used');
  assert.equal(typeof module._malloc, 'function');
  assert.equal(typeof module._free, 'function');
  assert.equal(typeof module.ccall, 'function');
  assert.ok(ArrayBuffer.isView(module.HEAPU8));
  assert.ok(module.HEAPU8.byteLength > 0);

  for (const [bitsPerPixel, bytes] of literalRuns) {
    const result = decodeBitmap({
      width: 1,
      height: 2,
      destLeft: 0,
      destTop: 0,
      destRight: 0,
      destBottom: 1,
      bitsPerPixel,
      isCompress: true,
      data: Uint8Array.from(bytes),
    }, module);
    assert.deepEqual(
      [...result.data],
      [255, 0, 0, 255, 0, 0, 255, 255],
      `${bitsPerPixel}-bit compressed pixels keep their colors and top-down row order`,
    );
  }
}

test('browser RLE decoder initializes and decodes under strict CSP without a preexisting Module', () => {
  assertDecoderReady(loadBrowserDecoder());
});

test('browser RLE decoder preserves an existing Module and its overrides under strict CSP', () => {
  let postRuns = 0;
  const print = () => {};
  const printErr = () => {};
  const configured = {
    applicationSetting: 'retained',
    print,
    printErr,
    postRun: [() => { postRuns += 1; }],
  };
  const module = loadBrowserDecoder(configured);

  assert.strictEqual(module, configured);
  assert.equal(module.applicationSetting, 'retained');
  assert.strictEqual(module.print, print);
  assert.strictEqual(module.printErr, printErr);
  assert.equal(postRuns, 1);
  assertDecoderReady(module);
});
