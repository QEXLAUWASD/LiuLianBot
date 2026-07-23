const fs = require('fs');

function defaultReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createRollerData({ readJson = defaultReadJson, operatorPath, mapPath }) {
  let operatorCache;
  let mapCache;

  return {
    operators() {
      return operatorCache ??= readJson(operatorPath);
    },
    maps() {
      return mapCache ??= readJson(mapPath);
    },
    reload() {
      operatorCache = undefined;
      mapCache = undefined;
    },
  };
}

module.exports = { createRollerData };
