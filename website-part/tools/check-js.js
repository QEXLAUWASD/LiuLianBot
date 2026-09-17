const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { transformSync } = require('esbuild');

// `node --check` cannot parse JSX, so React sources and the JSX test files go
// through the esbuild parser that also powers the production build.
const JSX_ROOTS = [path.join('frontend', 'src'), path.join('test', 'frontend')];
const NODE_ROOTS = ['src', 'test', 'tools'];

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return [full];
  });
}

function isJSXFile(file) {
  if (file.endsWith('.jsx')) return true;
  return file.endsWith('.test.mjs') && JSX_ROOTS.some(root => file.startsWith(root));
}

const candidates = new Set([...JSX_ROOTS.flatMap(filesUnder), ...NODE_ROOTS.flatMap(filesUnder)]);
const jsxFiles = [...candidates].filter(isJSXFile);
const nodeFiles = [...candidates].filter(
  file => !isJSXFile(file) && /\.(?:js|mjs|cjs)$/.test(file),
);

for (const file of jsxFiles) {
  try {
    transformSync(fs.readFileSync(file, 'utf8'), {
      loader: 'jsx',
      jsx: 'automatic',
      format: 'esm',
      sourcefile: file,
    });
  } catch (error) {
    console.error(`Syntax error in ${file}:`);
    console.error(error.message);
    process.exit(1);
  }
}

for (const file of nodeFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Checked ${jsxFiles.length} JSX and ${nodeFiles.length} Node.js files.`);
