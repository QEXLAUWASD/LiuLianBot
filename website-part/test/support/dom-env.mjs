import { JSDOM } from 'jsdom';

// React DOM decides at import time whether it can use the DOM. Importing it
// before any jsdom global exists disables input event support (`onChange` never
// fires), so a bootstrap window is installed here and imported first.
const bootstrap = new JSDOM('<!doctype html><html><body><div id="bootstrap-root"></div></body></html>', {
  url: 'https://example.test/',
});

// React DOM probes `'oninput' in document` once at import time. jsdom models
// event handler attributes as `null` properties, which makes React fall back to
// its legacy IE polyfill (that polyfill needs `attachEvent`). Advertising the
// native input event keeps `onChange` working the same way it does in browsers.
Object.defineProperty(bootstrap.window.document, 'oninput', {
  value: () => {},
  configurable: true,
});
Object.defineProperty(bootstrap.window.document, 'onchange', {
  value: () => {},
  configurable: true,
});

const BOOTSTRAP_GLOBALS = {
  window: bootstrap.window,
  document: bootstrap.window.document,
  navigator: bootstrap.window.navigator,
  HTMLElement: bootstrap.window.HTMLElement,
  HTMLCanvasElement: bootstrap.window.HTMLCanvasElement,
  Element: bootstrap.window.Element,
  Node: bootstrap.window.Node,
  Event: bootstrap.window.Event,
  CustomEvent: bootstrap.window.CustomEvent,
  KeyboardEvent: bootstrap.window.KeyboardEvent,
  MouseEvent: bootstrap.window.MouseEvent,
  getComputedStyle: bootstrap.window.getComputedStyle,
};

for (const [key, value] of Object.entries(BOOTSTRAP_GLOBALS)) {
  if (value === undefined) continue;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
