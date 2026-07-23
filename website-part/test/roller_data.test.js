const test = require('node:test');
const assert = require('node:assert/strict');
const { createRollerData } = require('../src/services/roller_data');

test('roller data reads each JSON file once until reload', () => {
  let reads = 0;
  const data = createRollerData({
    readJson() {
      reads += 1;
      return { value: reads };
    },
    operatorPath: 'operators',
    mapPath: 'maps',
  });

  assert.equal(data.operators().value, 1);
  assert.equal(data.operators().value, 1);
  assert.equal(data.maps().value, 2);
  data.reload();
  assert.equal(data.operators().value, 3);
});
