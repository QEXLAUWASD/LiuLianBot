import { useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { TabList, TabPanel, useTabs } from '../components/Tabs.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';

export const FALLBACK_ICON = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect fill="%23333" width="100" height="100"/%3E%3Ctext fill="%23888" x="50" y="55" text-anchor="middle" font-size="14"%3ENo Icon%3C/text%3E%3C/svg%3E';

const HISTORY_LIMIT = 20;

function ResultError({ message }) {
  return (
    <div className="result-card">
      <p className="status-error" role="alert">{`❌ ${message}`}</p>
    </div>
  );
}

function LoadoutItem({ label, value }) {
  return (
    <div className="loadout-item">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function sideClass(operator) {
  return operator.side === 'Attacker' ? 'attacker' : 'defender';
}

function OperatorResult({ operator }) {
  if (!operator) {
    return (
      <div className="result-placeholder">
        <p>Click &quot;Roll Operator&quot; to get started!</p>
      </div>
    );
  }
  if (operator.error) return <ResultError message={operator.error} />;

  const className = sideClass(operator);
  return (
    <div className="result-card">
      <img
        className={`op-icon ${className}`}
        src={operator.icon || FALLBACK_ICON}
        alt={operator.name || 'Operator'}
        onError={event => {
          if (event.currentTarget.src !== FALLBACK_ICON) event.currentTarget.src = FALLBACK_ICON;
        }}
      />
      <div className="op-name">{operator.name}</div>
      <span className={`op-side ${className}`}>{operator.side}</span>
      <div className="loadout">
        <LoadoutItem label="Primary" value={operator.primary} />
        <LoadoutItem label="Secondary" value={operator.secondary} />
        <LoadoutItem label="Gadget" value={operator.gadget} />
      </div>
    </div>
  );
}

function MapResult({ map }) {
  if (!map) {
    return (
      <div className="result-placeholder">
        <p>Click &quot;Roll Map&quot; to get started!</p>
      </div>
    );
  }
  if (map.error) return <ResultError message={map.error} />;

  return (
    <div className="result-card">
      <div className="map-icon" aria-hidden="true">🗺️</div>
      <div className="map-name">{map.name}</div>
      <div className="map-location">{`📍 ${map.location}`}</div>
      <div className="map-details">
        <div className="map-detail"><span>Mode:</span>{` ${map.gameMode}`}</div>
        <div className="map-detail"><span>Playlist:</span>{` ${map.playlist}`}</div>
      </div>
    </div>
  );
}

function OperatorHistory({ history }) {
  if (history.length === 0) return null;
  return (
    <div className="history-list">
      {history.map((item, index) => (
        <div className="history-item" key={`${item.name}-${index}`}>
          <img
            src={item.icon || FALLBACK_ICON}
            alt=""
            width="32"
            height="32"
            onError={event => {
              event.currentTarget.hidden = true;
            }}
          />
          <span className={item.side === 'Attacker' ? 'hi-att' : 'hi-def'}>{item.name}</span>
          <span className="history-detail">{`/ ${item.primary}`}</span>
        </div>
      ))}
    </div>
  );
}

function MapHistory({ history }) {
  if (history.length === 0) return null;
  return (
    <div className="history-list">
      {history.map((item, index) => (
        <div className="history-item" key={`${item.name}-${index}`}>
          {`🗺️ ${item.name} `}
          <span className="history-detail">{`/ ${item.gameMode}`}</span>
        </div>
      ))}
    </div>
  );
}

export function RollerPage({ search = globalThis.location?.search || '' }) {
  const initialTab = new URLSearchParams(search).get('tab') === 'map' ? 'map' : 'operator';
  const tabs = useTabs({
    items: [
      { id: 'operator', label: 'Operator Roll', tabId: 'operator-tab', panelId: 'operatorTab' },
      { id: 'map', label: 'Map Roll', tabId: 'map-tab', panelId: 'mapTab' },
    ],
    initialId: initialTab,
  });
  const [side, setSide] = useState('');
  const [operator, setOperator] = useState(null);
  const [map, setMap] = useState(null);
  const [operatorHistory, setOperatorHistory] = useState([]);
  const [mapHistory, setMapHistory] = useState([]);
  const operatorAction = useAsyncAction();
  const mapAction = useAsyncAction();

  const rollOperator = () => {
    operatorAction.run(async () => {
      try {
        const data = await requestJSON(`/api/roller/operator${side ? `?side=${side}` : ''}`);
        setOperator(data);
        setOperatorHistory(current => [data, ...current].slice(0, HISTORY_LIMIT));
      } catch (error) {
        setOperator({ error: error.message || 'Roll failed' });
      }
    });
  };

  const rollMap = () => {
    mapAction.run(async () => {
      try {
        const data = await requestJSON('/api/roller/map');
        setMap(data);
        setMapHistory(current => [data, ...current].slice(0, HISTORY_LIMIT));
      } catch (error) {
        setMap({ error: error.message || 'Map roll failed' });
      }
    });
  };

  return (
    <main className="main-content" id="main-content">
      <div className="roller-container tabs">
        <h2>🎲 R6 Roller</h2>

        <TabList tabs={tabs} label="Roll type" />

        <TabPanel tabs={tabs} id="operator">
          <div className="roller-controls">
            <label>
              <input
                type="radio"
                name="opSide"
                value=""
                checked={side === ''}
                onChange={() => setSide('')}
              />
              {' Both Sides'}
            </label>
            <label>
              <input
                type="radio"
                name="opSide"
                value="att"
                checked={side === 'att'}
                onChange={() => setSide('att')}
              />
              {' Attacker Only'}
            </label>
            <label>
              <input
                type="radio"
                name="opSide"
                value="def"
                checked={side === 'def'}
                onChange={() => setSide('def')}
              />
              {' Defender Only'}
            </label>
            <button
              id="rollOpBtn"
              className="btn btn-primary btn-roll"
              type="button"
              disabled={operatorAction.busy}
              onClick={rollOperator}
            >
              {operatorAction.busy ? '🎯 Rolling...' : '🎯 Roll Operator'}
            </button>
          </div>

          <div id="opResult" className="roll-result" role="status" aria-live="polite">
            <OperatorResult operator={operator} />
          </div>

          <div id="opHistory" className="roll-history">
            <h3>History</h3>
            <div id="opHistoryList">
              <OperatorHistory history={operatorHistory} />
            </div>
          </div>
        </TabPanel>

        <TabPanel tabs={tabs} id="map">
          <div className="roller-controls">
            <button
              id="rollMapBtn"
              className="btn btn-primary btn-roll"
              type="button"
              disabled={mapAction.busy}
              onClick={rollMap}
            >
              {mapAction.busy ? '🗺️ Rolling...' : '🗺️ Roll Map'}
            </button>
          </div>

          <div id="mapResult" className="roll-result" role="status" aria-live="polite">
            <MapResult map={map} />
          </div>

          <div id="mapHistory" className="roll-history">
            <h3>History</h3>
            <div id="mapHistoryList">
              <MapHistory history={mapHistory} />
            </div>
          </div>
        </TabPanel>
      </div>
    </main>
  );
}
