import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBusyControl } from '../../public/js/form_state.mjs';

const publicJs = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/js');

test('withBusyControl disables and restores a mutation control', async () => {
  const button = {
    disabled: false,
    attributes: new Map(),
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
  };
  let disabledDuringRequest = false;

  const result = await withBusyControl(button, async () => {
    disabledDuringRequest = button.disabled && button.getAttribute('aria-busy') === 'true';
    return 'saved';
  });

  assert.equal(disabledDuringRequest, true);
  assert.equal(result, 'saved');
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), null);
});

test('withBusyControl restores state after rejection and skips disabled controls', async () => {
  const button = {
    disabled: false,
    attributes: new Map([['aria-busy', 'false']]),
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
  };

  await assert.rejects(
    withBusyControl(button, async () => { throw new Error('failed'); }),
    /failed/,
  );
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), 'false');

  button.disabled = true;
  let calls = 0;
  const result = await withBusyControl(button, async () => { calls += 1; });
  assert.equal(result, undefined);
  assert.equal(calls, 0);
  assert.equal(button.disabled, true);
});

test('authentication, account, and admin mutations share the busy-state guard', async () => {
  const entries = await Promise.all([
    readFile(resolve(publicJs, 'auth.mjs'), 'utf8'),
    readFile(resolve(publicJs, 'account.mjs'), 'utf8'),
    readFile(resolve(publicJs, 'admin.mjs'), 'utf8'),
  ]);

  for (const source of entries) {
    assert.match(source, /import\s*\{\s*withBusyControl\s*\}\s*from\s*['"]\.\/form_state\.mjs['"]/);
    assert.match(source, /withBusyControl\(/);
  }
});

test('roller requests use the shared API client', async () => {
  const source = await readFile(resolve(publicJs, 'roller.mjs'), 'utf8');

  assert.match(source, /import\s*\{\s*requestJSON\s*\}\s*from\s*['"]\.\/api_client\.mjs['"]/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
