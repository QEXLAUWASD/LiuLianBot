import { requestJSON } from './api_client.mjs';
import { element, replaceChildren } from './dom.mjs';
import { setupTabs } from './tabs.mjs';

const FALLBACK_ICON = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23333" width="100" height="100"/%3E%3Ctext fill="%23888" x="50" y="55" text-anchor="middle" font-size="14"%3ENo Icon%3C/text%3E%3C/svg%3E';

function operatorImage(operator, className, { hideOnError = false, size } = {}) {
  const image = element('img', {
    className,
    attributes: {
      src: operator.icon || FALLBACK_ICON,
      alt: operator.name || 'Operator',
      ...(size ? { width: size, height: size } : {}),
    },
  });
  image.addEventListener('error', () => {
    if (hideOnError) {
      image.hidden = true;
    } else if (image.src !== FALLBACK_ICON) {
      image.src = FALLBACK_ICON;
    }
  }, { once: true });
  return image;
}

function loadoutItem(label, value) {
  return element('div', { className: 'loadout-item' }, [
    element('span', { className: 'label', text: label }),
    element('span', { className: 'value', text: value }),
  ]);
}

function resultError(message) {
  return element('div', { className: 'result-card' }, [
    element('p', { className: 'status-error', text: `❌ ${message}`, attributes: { role: 'alert' } }),
  ]);
}

document.addEventListener('DOMContentLoaded', () => {
  const opHistory = [];
  const mapHistory = [];
  const root = document.querySelector('[data-tabs]');
  const tabs = setupTabs(root);
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('tab') === 'map') {
    tabs?.activate('map-tab', { focus: false });
  }

  document.getElementById('rollOpBtn').addEventListener('click', async () => {
    const side = document.querySelector('input[name="opSide"]:checked')?.value || '';
    const button = document.getElementById('rollOpBtn');
    button.textContent = '🎯 Rolling...';
    button.disabled = true;

    try {
      const data = await requestJSON(`/api/roller/operator${side ? `?side=${side}` : ''}`);
      displayOpResult(data);
      addOpHistory(data);
    } catch (error) {
      showOpError(error.message || 'Roll failed');
    } finally {
      button.textContent = '🎯 Roll Operator';
      button.disabled = false;
    }
  });

  function displayOpResult(operator) {
    const sideClass = operator.side === 'Attacker' ? 'attacker' : 'defender';
    const card = element('div', { className: 'result-card' }, [
      operatorImage(operator, `op-icon ${sideClass}`),
      element('div', { className: 'op-name', text: operator.name }),
      element('span', { className: `op-side ${sideClass}`, text: operator.side }),
      element('div', { className: 'loadout' }, [
        loadoutItem('Primary', operator.primary),
        loadoutItem('Secondary', operator.secondary),
        loadoutItem('Gadget', operator.gadget),
      ]),
    ]);
    replaceChildren(document.getElementById('opResult'), [card]);
  }

  function showOpError(message) {
    replaceChildren(document.getElementById('opResult'), [resultError(message)]);
  }

  function addOpHistory(operator) {
    opHistory.unshift(operator);
    if (opHistory.length > 20) opHistory.pop();

    const items = opHistory.map(item => {
      const sideClass = item.side === 'Attacker' ? 'hi-att' : 'hi-def';
      return element('div', { className: 'history-item' }, [
        operatorImage(item, '', { hideOnError: true, size: 32 }),
        element('span', { className: sideClass, text: item.name }),
        element('span', { className: 'history-detail', text: `/ ${item.primary}` }),
      ]);
    });
    const list = document.getElementById('opHistoryList');
    list.className = 'history-list';
    replaceChildren(list, items);
  }

  document.getElementById('rollMapBtn').addEventListener('click', async () => {
    const button = document.getElementById('rollMapBtn');
    button.textContent = '🗺️ Rolling...';
    button.disabled = true;

    try {
      const data = await requestJSON('/api/roller/map');
      displayMapResult(data);
      addMapHistory(data);
    } catch (error) {
      showMapError(error.message || 'Map roll failed');
    } finally {
      button.textContent = '🗺️ Roll Map';
      button.disabled = false;
    }
  });

  function mapDetail(label, value) {
    return element('div', { className: 'map-detail' }, [
      element('span', { text: `${label}:` }),
      document.createTextNode(` ${value}`),
    ]);
  }

  function displayMapResult(map) {
    const card = element('div', { className: 'result-card' }, [
      element('div', { className: 'map-icon', text: '🗺️', attributes: { 'aria-hidden': 'true' } }),
      element('div', { className: 'map-name', text: map.name }),
      element('div', { className: 'map-location', text: `📍 ${map.location}` }),
      element('div', { className: 'map-details' }, [
        mapDetail('Mode', map.gameMode),
        mapDetail('Playlist', map.playlist),
      ]),
    ]);
    replaceChildren(document.getElementById('mapResult'), [card]);
  }

  function showMapError(message) {
    replaceChildren(document.getElementById('mapResult'), [resultError(message)]);
  }

  function addMapHistory(map) {
    mapHistory.unshift(map);
    if (mapHistory.length > 20) mapHistory.pop();

    const items = mapHistory.map(item => element('div', { className: 'history-item' }, [
      document.createTextNode(`🗺️ ${item.name} `),
      element('span', { className: 'history-detail', text: `/ ${item.gameMode}` }),
    ]));
    const list = document.getElementById('mapHistoryList');
    list.className = 'history-list';
    replaceChildren(list, items);
  }
});
