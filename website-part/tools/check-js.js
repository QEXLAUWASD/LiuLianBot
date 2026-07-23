const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return /\.(?:js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

for (const file of ['src', 'public/js', 'test'].flatMap(filesUnder)) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
