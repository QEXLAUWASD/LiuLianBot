import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

// Node cannot parse JSX, so `.jsx` sources and the JSX test files are
// transformed with the esbuild build that already ships with Vite.
function needsTransform(url) {
  if (url.endsWith('.jsx')) return true;
  return url.includes('/test/frontend/') && url.endsWith('.test.mjs');
}

export async function load(url, context, nextLoad) {
  if (!needsTransform(url)) return nextLoad(url, context);

  // `transformSync` keeps the esbuild service call on the loader thread; the
  // async API would wait on the main thread's event loop and deadlock here.
  const source = readFileSync(new URL(url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'esm',
    sourcefile: url,
  });

  return { format: 'module', source: code, shortCircuit: true };
}
