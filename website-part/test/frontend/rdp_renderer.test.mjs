import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBitmap, clearRdpCanvas } from '../../frontend/src/lib/rdp/rdpRenderer.mjs';

test('2D fallback preserves dirty rectangle and shares context with clearing', () => {
  const calls = [];
  const ctx = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (...args) => calls.push(args),
    clearRect: (...args) => calls.push(args),
  };
  const requested = [];
  const canvas = { width: 100, height: 80, dataset: {}, getContext(type) {
    requested.push(type); return type === '2d' ? ctx : null;
  } };
  clearRdpCanvas(canvas);
  renderBitmap(canvas, { width: 2, height: 1, x: 4, y: 5, clipWidth: 1, clipHeight: 1,
    data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) });
  assert.deepEqual(requested, ['webgl', '2d']);
  assert.equal(canvas.dataset.renderer, '2d');
  assert.deepEqual(calls[0], [0, 0, 100, 80]);
  assert.deepEqual(calls[1].slice(1), [4, 5, 0, 0, 1, 1]);
  assert.deepEqual([...calls[1][0].data], [255, 0, 0, 255, 0, 255, 0, 255]);
});

test('GPU tiles use bottom-left viewport, clipping and recover after context loss', () => {
  const calls = [];
  let lost = false;
  const gl = new Proxy({
    isContextLost: () => lost,
    getShaderParameter: () => true, getProgramParameter: () => true,
  }, { get(target, key) {
    if (key in target) return target[key];
    if (key === key.toUpperCase()) return key;
    return (...args) => { calls.push([key, ...args]); return {}; };
  } });
  const events = {};
  const canvas = { width: 100, height: 80, dataset: {},
    getContext: () => gl, addEventListener: (name, fn) => { events[name] = fn; } };
  const output = { width: 2, height: 3, x: 4, y: 5, clipWidth: 1, clipHeight: 2,
    data: new Uint8ClampedArray(24) };
  clearRdpCanvas(canvas);
  renderBitmap(canvas, output);
  assert.equal(canvas.dataset.renderer, 'webgl');
  assert.deepEqual(calls.find(c => c[0] === 'viewport'), ['viewport', 4, 72, 2, 3]);
  assert.deepEqual(calls.find(c => c[0] === 'scissor'), ['scissor', 4, 73, 1, 2]);
  renderBitmap(canvas, output);
  assert.equal(calls.filter(c => c[0] === 'createProgram').length, 1);
  lost = true;
  events.webglcontextlost({ preventDefault() {} });
  assert.throws(() => renderBitmap(canvas, output), /context lost/);
  lost = false;
  events.webglcontextrestored();
  renderBitmap(canvas, output);
  assert.equal(calls.filter(c => c[0] === 'createProgram').length, 2);
});
