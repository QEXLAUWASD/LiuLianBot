import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');

test('remote page includes a WebRDP canvas and local client assets', async () => {
  const html = await readFile(resolve(publicDir, 'remote.html'), 'utf8');
  const document = new JSDOM(html).window.document;

  assert.ok(document.querySelector('#rdpCanvas'));
  assert.ok(document.querySelector('#rdpForm'));
  assert.equal(document.querySelector('script[src="/vendor/socket.io.min.js"]') !== null, true);
  assert.equal(document.querySelector('script[src="/vendor/webrdp/webrdp.js"]') !== null, true);
  assert.equal(document.querySelector('script[src="/vendor/webrdp/rle.js"]') !== null, true);
  assert.equal(document.querySelector('#rdpPassword').getAttribute('autocomplete'), 'current-password');
});
