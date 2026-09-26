const fs = require('node:fs');
const path = require('node:path');
const { createOpenApi } = require('../src/services/openapi');
fs.writeFileSync(path.join(__dirname, '../../docs/openapi.json'), `${JSON.stringify(createOpenApi(), null, 2)}\n`);
console.log('Updated docs/openapi.json');
