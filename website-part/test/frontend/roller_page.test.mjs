import assert from 'node:assert/strict';
import test from 'node:test';

import { RollerPage } from '../../frontend/src/pages/RollerPage.jsx';
import { click, flush, mockFetch, render, setupDom } from '../support/react.mjs';

const OPERATOR = {
  name: 'Ash',
  side: 'Attacker',
  primary: 'R4-C',
  secondary: 'M45 MEUSOC',
  gadget: 'Breach Charge',
};

const MAP = { name: 'Clubhouse', location: 'Germany', gameMode: 'Bomb', playlist: 'Ranked' };

function mount(routes, { search = '' } = {}) {
  const dom = setupDom('<div id="root"></div>', { url: `https://example.test/roller.html${search}` });
  const fetchMock = mockFetch({
    'GET /api/roller/operator': { payload: OPERATOR },
    'GET /api/roller/map': { payload: MAP },
    ...routes,
  });
  render(<RollerPage search={search} />);
  return { dom, document: dom.document, fetchMock };
}

test('rolling an operator shows the loadout and keeps a history list', async () => {
  const { dom, document, fetchMock } = mount();
  try {
    await flush();
    click(document.getElementById('rollOpBtn'));
    await flush();

    assert.equal(fetchMock.callsTo('GET', '/api/roller/operator').length, 1);
    const card = document.querySelector('#opResult .result-card');
    assert.equal(card.querySelector('.op-name').textContent, 'Ash');
    assert.equal(card.querySelector('.op-icon').className, 'op-icon attacker');
    assert.deepEqual(
      [...card.querySelectorAll('.loadout-item .value')].map(node => node.textContent),
      ['R4-C', 'M45 MEUSOC', 'Breach Charge'],
    );

    const history = document.querySelector('#opHistoryList .history-item');
    assert.equal(history.querySelector('.hi-att').textContent, 'Ash');
    assert.equal(history.querySelector('.history-detail').textContent, '/ R4-C');
  } finally {
    dom.cleanup();
  }
});

test('the side filter is sent with the roll request', async () => {
  const { dom, document, fetchMock } = mount();
  try {
    await flush();
    document.querySelector('input[name="opSide"][value="def"]').click();
    click(document.getElementById('rollOpBtn'));
    await flush();

    assert.equal(fetchMock.callsTo('GET', '/api/roller/operator?side=def').length, 1);
  } finally {
    dom.cleanup();
  }
});

test('roll failures render an alert inside the result card', async () => {
  const { dom, document } = mount({
    'GET /api/roller/operator': { status: 500, payload: { error: 'Operator list unavailable' } },
  });
  try {
    await flush();
    click(document.getElementById('rollOpBtn'));
    await flush();

    const alert = document.querySelector('#opResult [role="alert"]');
    assert.equal(alert.textContent, '❌ Operator list unavailable');
    assert.equal(document.querySelector('#opHistoryList .history-item'), null);
  } finally {
    dom.cleanup();
  }
});

test('?tab=map opens the map roller and rolls a map', async () => {
  const { dom, document, fetchMock } = mount({}, { search: '?tab=map' });
  try {
    await flush();
    assert.equal(document.getElementById('mapTab')?.hidden, false);

    click(document.getElementById('rollMapBtn'));
    await flush();

    assert.equal(fetchMock.callsTo('GET', '/api/roller/map').length, 1);
    const card = document.querySelector('#mapResult .result-card');
    assert.equal(card.querySelector('.map-name').textContent, 'Clubhouse');
    assert.equal(card.querySelector('.map-location').textContent, '📍 Germany');
    assert.match(document.querySelector('#mapHistoryList .history-item').textContent, /Clubhouse/);
  } finally {
    dom.cleanup();
  }
});
