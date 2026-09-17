import './dom-env.mjs';

import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const activeWindows = new Set();

// Tear down every mounted document. Test files call this from an `after` hook so
// a failing assertion can never leave jsdom timers behind.
export function cleanupAll() {
  for (const cleanup of [...activeWindows]) cleanup();
  activeWindows.clear();
}

const GLOBAL_KEYS = [
  'window',
  'document',
  'navigator',
  'location',
  'HTMLElement',
  'HTMLCanvasElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'WheelEvent',
  'Image',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'ResizeObserver',
  'localStorage',
  'sessionStorage',
  'IS_REACT_ACT_ENVIRONMENT',
];

export function setupDom(markup = '<div id="root"></div>', { url = 'https://example.test/index.html', location } = {}) {
  const dom = new JSDOM(markup, { url });
  const saved = new Map();

  for (const key of GLOBAL_KEYS) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    let value = key === 'location' && location ? location : dom.window[key];
    if (key === 'IS_REACT_ACT_ENVIRONMENT') value = true;
    if (value === undefined) continue;
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }

  const cleanup = () => {
    if (!activeWindows.has(cleanup)) return;
    activeWindows.delete(cleanup);
    try {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    } finally {
      dom.window.close();
    }
  };

  activeWindows.add(cleanup);
  return {
    window: dom.window,
    document: dom.window.document,
    cleanup,
  };
}

export function stubLocation(overrides = {}) {
  return {
    href: 'https://example.test/index.html',
    origin: 'https://example.test',
    protocol: 'https:',
    host: 'example.test',
    pathname: '/index.html',
    search: '',
    ...overrides,
  };
}

export function render(element, container = globalThis.document.getElementById('root')) {
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    root,
    rerender(next) {
      act(() => root.render(next));
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

export async function flush(turns = 3) {
  for (let index = 0; index < turns; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

export function click(node) {
  act(() => {
    node.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

export function press(node, key, options = {}) {
  act(() => {
    node.dispatchEvent(new globalThis.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    }));
  });
}

function nativeValueSetter(node, key = 'value') {
  const descriptor = Object.getOwnPropertyDescriptor(node.constructor.prototype, key);
  return descriptor?.set;
}

export function typeInto(node, value) {
  act(() => {
    nativeValueSetter(node).call(node, value);
    node.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  });
}

export function selectOption(node, value) {
  act(() => {
    nativeValueSetter(node).call(node, value);
    node.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  });
}

export function toggle(node) {
  act(() => {
    node.click();
  });
}

export function mockFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    const target = String(url);
    calls.push({ url: target, method, body, options });

    const route = routes[`${method} ${target}`] ?? routes[`${method} ${target.split('?')[0]}`];
    if (!route) {
      throw new Error(`Unhandled fetch ${method} ${target}`);
    }

    const resolved = typeof route === 'function' ? await route({ url: target, method, body, options }) : route;
    if (resolved instanceof Response) return resolved;
    const { status = 200, payload = resolved } = resolved ?? {};
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };

  return {
    calls,
    callsTo(method, url) {
      return calls.filter(call => call.method === method && call.url === url);
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

export function jsonBody(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
