// R6 Roller page logic
document.addEventListener('DOMContentLoaded', () => {
  const opHistory = [];
  const mapHistory = [];

  // Tab switching
  const tabBtns = document.querySelectorAll('.roller-tabs .tab-btn');
  const rollerTabs = document.querySelectorAll('.roller-tab');

  // Check URL for tab parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'map') {
    switchTab('map');
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(tabName) {
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    rollerTabs.forEach(t => t.classList.toggle('active', t.id === tabName + 'Tab'));
  }

  // Operator Roll
  document.getElementById('rollOpBtn').addEventListener('click', async () => {
    const sideRadio = document.querySelector('input[name="opSide"]:checked');
    const side = sideRadio ? sideRadio.value : '';

    const btn = document.getElementById('rollOpBtn');
    btn.textContent = '🎯 Rolling...';
    btn.disabled = true;

    try {
      const params = side ? `?side=${side}` : '';
      const res = await fetch(`/api/roller/operator${params}`);

      const data = await res.json();
      if (res.ok) {
        displayOpResult(data);
        addOpHistory(data);
      } else {
        showOpError(data.error || 'Roll failed');
      }
    } catch (err) {
      showOpError('Network error. Please try again.');
    }

    btn.textContent = '🎯 Roll Operator';
    btn.disabled = false;
  });

  function displayOpResult(op) {
    const sideClass = op.side === 'Attacker' ? 'attacker' : 'defender';
    const resultDiv = document.getElementById('opResult');
    resultDiv.innerHTML = `
      <div class="result-card">
        <img class="op-icon ${sideClass}" src="${escapeHTML(op.icon)}" alt="${escapeHTML(op.name)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text fill=%22%23888%22 x=%2250%22 y=%2255%22 text-anchor=%22middle%22 font-size=%2214%22>No Icon</text></svg>'">
        <div class="op-name">${escapeHTML(op.name)}</div>
        <span class="op-side ${sideClass}">${escapeHTML(op.side)}</span>
        <div class="loadout">
          <div class="loadout-item">
            <span class="label">Primary</span>
            <span class="value">${escapeHTML(op.primary)}</span>
          </div>
          <div class="loadout-item">
            <span class="label">Secondary</span>
            <span class="value">${escapeHTML(op.secondary)}</span>
          </div>
          <div class="loadout-item">
            <span class="label">Gadget</span>
            <span class="value">${escapeHTML(op.gadget)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function showOpError(msg) {
    document.getElementById('opResult').innerHTML = `
      <div class="result-card">
        <p style="color: var(--error);">❌ ${escapeHTML(msg)}</p>
      </div>
    `;
  }

  function addOpHistory(op) {
    opHistory.unshift(op);
    if (opHistory.length > 20) opHistory.pop();

    const list = document.getElementById('opHistoryList');
    list.className = 'history-list';
    list.innerHTML = opHistory.map(h => {
      const sideClass = h.side === 'Attacker' ? 'hi-att' : 'hi-def';
      return `
        <div class="history-item">
          <img src="${escapeHTML(h.icon)}" alt="${escapeHTML(h.name)}" onerror="this.style.display='none'" width="32" height="32">
          <span class="${sideClass}">${escapeHTML(h.name)}</span>
          <span style="font-size:0.8rem;color:var(--text-muted);">/ ${escapeHTML(h.primary)}</span>
        </div>
      `;
    }).join('');
  }

  // Map Roll
  document.getElementById('rollMapBtn').addEventListener('click', async () => {
    const btn = document.getElementById('rollMapBtn');
    btn.textContent = '🗺️ Rolling...';
    btn.disabled = true;

    try {
      const res = await fetch('/api/roller/map');

      const data = await res.json();
      if (res.ok) {
        displayMapResult(data);
        addMapHistory(data);
      } else {
        showMapError(data.error || 'Map roll failed');
      }
    } catch (err) {
      showMapError('Network error. Please try again.');
    }

    btn.textContent = '🗺️ Roll Map';
    btn.disabled = false;
  });

  function displayMapResult(map) {
    document.getElementById('mapResult').innerHTML = `
      <div class="result-card">
        <div style="font-size:3rem;margin-bottom:8px;">🗺️</div>
        <div class="map-name">${escapeHTML(map.name)}</div>
        <div class="map-location">📍 ${escapeHTML(map.location)}</div>
        <div class="map-details">
          <div class="map-detail"><span>Mode:</span> ${escapeHTML(map.gameMode)}</div>
          <div class="map-detail"><span>Playlist:</span> ${escapeHTML(map.playlist)}</div>
        </div>
      </div>
    `;
  }

  function showMapError(msg) {
    document.getElementById('mapResult').innerHTML = `
      <div class="result-card">
        <p style="color: var(--error);">❌ ${escapeHTML(msg)}</p>
      </div>
    `;
  }

  function addMapHistory(map) {
    mapHistory.unshift(map);
    if (mapHistory.length > 20) mapHistory.pop();

    const list = document.getElementById('mapHistoryList');
    list.className = 'history-list';
    list.innerHTML = mapHistory.map(h => `
      <div class="history-item">
        🗺️ ${escapeHTML(h.name)}
        <span style="font-size:0.8rem;color:var(--text-muted);">/ ${escapeHTML(h.gameMode)}</span>
      </div>
    `).join('');
  }
});

// HTML escape utility
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
