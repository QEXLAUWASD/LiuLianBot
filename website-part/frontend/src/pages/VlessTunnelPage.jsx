import { useEffect, useRef, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { TabList, TabPanel, useTabs } from '../components/Tabs.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';

export const VLESS_STORAGE_KEY = 'liulianbot.vless-tunnel.sources';

export function savedSources(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(VLESS_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (_) {
    return {};
  }
}

export function VlessTunnelPage() {
  const tabs = useTabs({
    items: [
      { id: 'vless', label: 'VLESS 位址', tabId: 'vlessSourceTab', panelId: 'vlessSourcePanel' },
      { id: 'clash', label: 'Clash / Mihomo YAML', tabId: 'clashSourceTab', panelId: 'clashSourcePanel' },
    ],
    initialId: 'vless',
  });
  const initial = useRef(savedSources());
  const [sources, setSources] = useState({
    vless: initial.current.vless || '',
    clash: initial.current.clash || '',
  });
  const [storageStatus, setStorageStatus] = useState(
    initial.current.vless || initial.current.clash ? '已載入此瀏覽器的已儲存設定。' : '',
  );
  const [result, setResult] = useState({ config: '', interim: null });
  const [status, setStatus] = useState({ message: '', tone: '' });
  const outputRef = useRef(null);
  const generateAction = useAsyncAction();
  const format = tabs.activeId || 'vless';
  const source = sources[format] || '';

  const writeSources = next => {
    try {
      const stored = savedSources();
      if (next[format]) stored[format] = next[format];
      else delete stored[format];
      globalThis.localStorage.setItem(VLESS_STORAGE_KEY, JSON.stringify(stored));
      return true;
    } catch (_) {
      return false;
    }
  };

  const saveSource = () => {
    setStorageStatus(writeSources(sources)
      ? '已儲存於此瀏覽器（不會上傳）。'
      : '瀏覽器拒絕儲存，請檢查隱私設定。');
  };

  const clearSource = () => {
    const next = { ...sources, [format]: '' };
    setSources(next);
    setStorageStatus(writeSources(next)
      ? '已清除這種格式的已儲存設定。'
      : '無法清除瀏覽器儲存。');
  };

  const generate = () => {
    const trimmed = source.trim();
    if (!trimmed) {
      setStatus({ message: '請先貼上原有設定。', tone: 'error' });
      return;
    }

    generateAction.run(async () => {
      setStatus({ message: '正在產生 interim tunnel…', tone: '' });
      try {
        const data = await requestJSON('/api/vless-tunnel/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format, source: trimmed }),
        });
        setResult({ config: data.config || '', interim: data.interim || null });
        setStatus({ message: '已完成合併。請複製結果並匯入你的用戶端。', tone: '' });
      } catch (error) {
        setResult({ config: '', interim: null });
        setStatus({ message: error.message, tone: 'error' });
      }
    });
  };

  const copyOutput = async () => {
    if (!result.config) return;
    try {
      await navigator.clipboard.writeText(result.config);
      setStatus({ message: '已複製合併結果。', tone: '' });
    } catch (_) {
      outputRef.current?.select();
      setStatus({ message: '無法直接存取剪貼簿，已選取文字，請按 Ctrl+C。', tone: 'error' });
    }
  };

  useEffect(() => {
    // Reset the transient status when switching configuration format.
    setStatus({ message: '', tone: '' });
  }, [tabs.activeId]);

  return (
    <main className="main-content" id="main-content">
      <div className="tunnel-container">
        <header className="tunnel-hero">
          <div>
            <p className="panel-kicker">INTERNAL NETWORK ACCESS</p>
            <h1>Interim VLESS Tunnel</h1>
            <p>產生一條短期 VLESS 連線，並將它加入你現有的 VLESS 位址或 Clash / Mihomo 設定。</p>
          </div>
          <span className="protocol-chip">VLESS</span>
        </header>

        <div className="tunnel-grid">
          <section className="tunnel-panel" aria-labelledby="sourceHeading">
            <div className="tunnel-panel-heading">
              <div>
                <p className="panel-kicker">YOUR CONFIGURATION</p>
                <h2 id="sourceHeading">原有設定</h2>
              </div>
              <span className="tunnel-step">01</span>
            </div>

            <TabList tabs={tabs} label="Configuration format" className="tunnel-tabs" />

            <TabPanel tabs={tabs} id="vless">
              <label className="tunnel-label" htmlFor="vlessSource">VLESS / V2Ray server address</label>
              <textarea
                id="vlessSource"
                rows="8"
                maxLength="32768"
                spellCheck="false"
                placeholder="vless://uuid@example.com:443?type=ws&security=tls&sni=example.com#原有伺服器"
                value={sources.vless}
                onChange={event => setSources({ ...sources, vless: event.target.value })}
              />
              <p className="tunnel-help">
                每行一個 <code>vless://</code> 位址。內容只會用於今次合併，不會寫入伺服器日誌。
              </p>
            </TabPanel>

            <TabPanel tabs={tabs} id="clash">
              <label className="tunnel-label" htmlFor="clashSource">原有 Clash / Mihomo YAML</label>
              <textarea
                id="clashSource"
                rows="15"
                maxLength="32768"
                spellCheck="false"
                placeholder={'proxies:\n  - name: my-server\n    type: vless\n    server: example.com\n    port: 443'}
                value={sources.clash}
                onChange={event => setSources({ ...sources, clash: event.target.value })}
              />
              <p className="tunnel-help">
                會保留原有內容，將 interim proxy 加入 <code>proxies</code>，並加入現有 proxy group。
              </p>
            </TabPanel>

            <div className="tunnel-actions">
              <button className="btn btn-outline" id="saveSource" type="button" onClick={saveSource}>
                儲存到此瀏覽器
              </button>
              <button className="btn btn-outline" id="clearSource" type="button" onClick={clearSource}>
                清除已儲存設定
              </button>
            </div>
            <p className="tunnel-storage-note" id="storageStatus" role="status" aria-live="polite">
              {storageStatus}
            </p>
          </section>

          <aside className="tunnel-panel tunnel-info-panel" aria-labelledby="tunnelInfoHeading">
            <div className="tunnel-panel-heading">
              <div>
                <p className="panel-kicker">TEMPORARY ACCESS</p>
                <h2 id="tunnelInfoHeading">隧道說明</h2>
              </div>
              <span className="tunnel-step">02</span>
            </div>
            <dl className="tunnel-facts">
              <div><dt>用途</dt><dd>連接網站伺服器可到達的內部網絡</dd></div>
              <div><dt>輸出</dt><dd>VLESS 位址或 Clash YAML</dd></div>
              <div><dt>保存</dt><dd>原有設定只保存在你的瀏覽器</dd></div>
            </dl>
            <p className="tunnel-warning">
              請只在可信任的 V2Ray / Clash 用戶端使用輸出內容。產生結果會顯示有效期限。
            </p>
          </aside>
        </div>

        <section className="tunnel-panel tunnel-result-panel" aria-labelledby="resultHeading">
          <div className="tunnel-panel-heading">
            <div>
              <p className="panel-kicker">MERGED OUTPUT</p>
              <h2 id="resultHeading">合併結果</h2>
            </div>
            <span className="tunnel-step">03</span>
          </div>
          <div className="tunnel-result-meta" id="resultMeta" hidden={!result.interim}>
            {result.interim
              ? `${result.interim.name} · 目標：${result.interim.internalTarget} · 有效至 ${new Date(result.interim.expiresAt).toLocaleString()}`
              : ''}
          </div>
          <textarea
            id="mergedOutput"
            className="tunnel-output"
            rows="16"
            readOnly
            spellCheck="false"
            placeholder="完成上面的設定後，合併結果會顯示在這裡。"
            ref={outputRef}
            value={result.config}
          />
          <div className="tunnel-actions">
            <button
              className="btn btn-primary"
              id="generateTunnel"
              type="button"
              disabled={generateAction.busy}
              aria-busy={generateAction.busy}
              onClick={generate}
            >
              產生並合併隧道
            </button>
            <button
              className="btn btn-outline"
              id="copyOutput"
              type="button"
              disabled={!result.config}
              onClick={copyOutput}
            >
              複製合併結果
            </button>
          </div>
          <StatusMessage id="tunnelStatus" message={status.message} tone={status.tone} />
        </section>
      </div>
    </main>
  );
}
