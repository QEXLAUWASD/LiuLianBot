import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { element, replaceChildren } from '../../public/js/dom.mjs';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');

function withDocument(markup, callback) {
  const dom = new JSDOM(markup);
  const originalDocument = globalThis.document;
  globalThis.document = dom.window.document;

  try {
    return callback(dom.window.document);
  } finally {
    globalThis.document = originalDocument;
    dom.window.close();
  }
}

test('dynamic values remain text and never become event handlers', () => {
  withDocument('<div id="root"></div>', document => {
    const hostile = `x');alert(1)//<img src=x onerror=alert(2)>`;
    const button = element('button', {
      text: hostile,
      type: 'button',
      dataset: { action: 'edit-user', id: hostile },
    });

    document.querySelector('#root').append(button);

    assert.equal(button.textContent, hostile);
    assert.equal(button.type, 'button');
    assert.equal(button.dataset.id, hostile);
    assert.equal(button.hasAttribute('onclick'), false);
    assert.equal(document.querySelector('img'), null);
  });
});

test('replaceChildren filters empty entries without parsing markup', () => {
  withDocument('<div id="root"><span>old</span></div>', document => {
    const hostile = '<img src=x onerror=alert(1)>';
    const child = element('span', { text: hostile, className: 'safe' });

    replaceChildren(document.querySelector('#root'), [null, child, false, undefined]);

    assert.equal(document.querySelector('#root').children.length, 1);
    assert.equal(document.querySelector('.safe').textContent, hostile);
    assert.equal(document.querySelector('img'), null);
  });
});

test('admin and roller entries use delegated actions and safe DOM rendering', async () => {
  const [adminHtml, adminSource, rollerSource] = await Promise.all([
    readFile(resolve(publicDir, 'admin.html'), 'utf8'),
    readFile(resolve(publicDir, 'js/admin.mjs'), 'utf8'),
    readFile(resolve(publicDir, 'js/roller.mjs'), 'utf8'),
  ]);

  assert.match(adminHtml, /type="module" src="\/js\/admin\.mjs/);
  assert.doesNotMatch(adminHtml, /\/js\/admin\.js/);
  assert.match(adminSource, /closest\(['"]\[data-action\]['"]\)/);
  assert.match(adminSource, /import\s*\{[^}]*element[^}]*replaceChildren[^}]*\}\s*from\s*['"]\.\/dom\.mjs['"]/);
  assert.match(rollerSource, /addEventListener\(['"]error['"]/);
  assert.doesNotMatch(`${adminHtml}\n${adminSource}\n${rollerSource}`, /\bon(?:click|error|change)\s*=/i);
  assert.doesNotMatch(`${adminSource}\n${rollerSource}`, /\.innerHTML\s*=/);
  assert.doesNotMatch(`${adminSource}\n${rollerSource}`, /function\s+escapeHTML/);
});
