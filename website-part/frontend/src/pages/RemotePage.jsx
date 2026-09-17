import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { RdpClient } from '../lib/rdp/rdpClient.mjs';
import {
  deleteRdpProfile,
  listRdpProfiles,
  loadRdpProfile,
  saveRdpProfile,
} from '../lib/rdpProfiles.mjs';
import { StatusMessage } from '../components/StatusMessage.jsx';

export const BROWSER_PROFILE_KEY = 'liulianbot.remote-profile.v1';

export function browserProfile(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(BROWSER_PROFILE_KEY)) || { ssh: null, rdp: null };
  } catch (_) {
    return { ssh: null, rdp: null };
  }
}

export function saveBrowserProfile(profile, storage = globalThis.localStorage) {
  storage?.setItem(BROWSER_PROFILE_KEY, JSON.stringify(profile));
}

export function sshEndpoint(locationRef = globalThis.location) {
  return `${locationRef.protocol === 'https:' ? 'wss:' : 'ws:'}//${locationRef.host}/api/ssh`;
}

const EMPTY_RDP = { host: '', port: '3389', username: '', domain: '', password: '' };
const EMPTY_SSH = {
  host: '',
  port: '22',
  username: '',
  authType: 'password',
  password: '',
  privateKey: '',
  storage: 'browser',
};

export function RemotePage({ socketFactory = globalThis.io } = {}) {
  const [features, setFeatures] = useState({ ssh: true, rdp: true });
  const [serverProfile, setServerProfile] = useState({ ssh: null, rdp: null });
  const [serverStorageAvailable, setServerStorageAvailable] = useState(false);

  const [rdpForm, setRdpForm] = useState(EMPTY_RDP);
  const [rdpState, setRdpState] = useState({ state: 'idle', message: '未連線' });
  const [rdpHostLabel, setRdpHostLabel] = useState('尚未選擇主機');
  const [rdpProfileName, setRdpProfileName] = useState('');
  const [rdpProfiles, setRdpProfiles] = useState({ available: false, items: [], selectedId: '' });
  const [rdpProfileStatus, setRdpProfileStatus] = useState('正在載入連線設定…');
  const [fit, setFit] = useState(true);

  const [sshForm, setSshForm] = useState(EMPTY_SSH);
  const [sshStatus, setSshStatus] = useState({ message: '', tone: '' });
  const [sshConnected, setSshConnected] = useState(false);
  const [terminal, setTerminal] = useState('尚未連線。');
  const [sshCommand, setSshCommand] = useState('');

  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const terminalRef = useRef(null);
  const rdpClientRef = useRef(null);
  const socketRef = useRef(null);
  const busyRef = useRef(false);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const scale = fit
      ? Math.min(viewport.clientWidth / canvas.width, viewport.clientHeight / canvas.height) || 1
      : 1;
    canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
    canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
  }, [fit]);

  const applyRdpState = useCallback(({ state, message }) => {
    setRdpState({ state, message });
    const busy = state === 'connecting' || state === 'connected';
    if (!busy) {
      clearCanvas();
      setRdpForm(current => ({ ...current, password: '' }));
    }
  }, [clearCanvas]);

  const refreshProfiles = useCallback(async selected => {
    const data = await listRdpProfiles();
    setRdpProfiles({
      available: data.available,
      items: data.profiles,
      selectedId: selected || '',
    });
    return data;
  }, []);

  const fillRdpProfile = useCallback(profile => {
    setRdpForm({
      host: profile?.host ?? '',
      port: String(profile?.port ?? '3389'),
      username: profile?.username ?? '',
      domain: profile?.domain ?? '',
      password: profile?.password ?? '',
    });
    setRdpProfileName(profile?.name || '');
  }, []);

  const withProfileBusy = useCallback(async action => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await action();
    } catch (error) {
      setRdpProfileStatus(error.message || '設定操作失敗，請重試。');
    } finally {
      busyRef.current = false;
    }
  }, []);

  // Initial load: remote features, encrypted server profile and the per-account
  // RDP profile list.
  useEffect(() => {
    let active = true;
    const saved = browserProfile();
    if (saved.ssh) setSshForm({ ...EMPTY_SSH, ...saved.ssh, password: '', storage: 'browser' });

    (async () => {
      let remote = null;
      try {
        remote = await requestJSON('/api/remote-profile');
      } catch (_) {
        if (active) {
          setFeatures({ ssh: false, rdp: false });
          setServerStorageAvailable(false);
          setRdpProfileStatus('無法載入遠端設定。');
        }
        return;
      }
      if (!active) return;
      const profile = remote.profile || { ssh: null, rdp: null };
      setServerProfile(profile);
      setServerStorageAvailable(Boolean(remote.serverStorageAvailable));
      setFeatures(remote.features || { ssh: true, rdp: true });

      await withProfileBusy(async () => {
        const data = await refreshProfiles();
        if (!data.available) {
          setRdpProfileStatus('請管理員設定 REMOTE_CREDENTIAL_ENCRYPTION_KEY，以啟用加密資料庫儲存。');
          return;
        }
        const legacy = profile.rdp || saved.rdp;
        if (legacy) {
          fillRdpProfile({ ...legacy, name: '舊版 RDP 設定' });
          setRdpProfileStatus('已載入舊設定，按儲存可轉存為命名設定。');
        } else {
          fillRdpProfile(null);
          setRdpProfileStatus('選取或新增連線設定；每組密碼都會加密儲存。');
        }
      });
    })();

    return () => {
      active = false;
    };
  }, [fillRdpProfile, refreshProfiles, withProfileBusy]);

  useEffect(() => {
    fitCanvas();
    const onResize = () => fitCanvas();
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
    const observer = globalThis.ResizeObserver
      ? new ResizeObserver(() => fitCanvas())
      : null;
    if (observer && viewportRef.current) observer.observe(viewportRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
      observer?.disconnect();
    };
  }, [fitCanvas]);

  useEffect(() => () => {
    rdpClientRef.current?.destroy();
    socketRef.current?.close();
  }, []);

  useEffect(() => {
    const terminalElement = terminalRef.current;
    if (terminalElement) terminalElement.scrollTop = terminalElement.scrollHeight;
  }, [terminal]);

  const resizeRdpCanvas = () => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas) return;
    const width = Math.min(4096, Math.max(800, viewport?.clientWidth || 1280));
    const height = Math.min(2160, Math.max(480, viewport?.clientHeight || 720));
    canvas.width = Math.floor(width);
    canvas.height = Math.floor(height);
  };

  const connectRdp = event => {
    event.preventDefault();
    if (!globalThis.Module?._malloc || !globalThis.Module?.ccall) {
      applyRdpState({ state: 'error', message: '畫面解碼器尚未就緒，請重新整理頁面。' });
      return;
    }
    rdpClientRef.current?.destroy();
    resizeRdpCanvas();
    fitCanvas();
    setRdpHostLabel(`${rdpForm.host.trim()}:${rdpForm.port}`);
    const client = new RdpClient(canvasRef.current, { onState: applyRdpState, socketFactory });
    rdpClientRef.current = client;
    client.connect({
      host: rdpForm.host.trim(),
      port: rdpForm.port,
      username: rdpForm.username.trim(),
      domain: rdpForm.domain.trim(),
      password: rdpForm.password,
    });
    setRdpForm(current => ({ ...current, password: '' }));
  };

  const disconnectRdp = () => rdpClientRef.current?.disconnect();

  const selectRdpProfile = id => {
    setRdpProfiles(current => ({ ...current, selectedId: id }));
    withProfileBusy(async () => {
      if (!id) {
        fillRdpProfile(null);
        return;
      }
      fillRdpProfile(null);
      const profile = await loadRdpProfile(id);
      fillRdpProfile(profile);
      setRdpProfileStatus('已載入設定與密碼。');
    });
  };

  const newRdpProfile = () => {
    if (busyRef.current) return;
    setRdpProfiles(current => ({ ...current, selectedId: '' }));
    fillRdpProfile(null);
  };

  const saveRdpProfileDetails = () => withProfileBusy(async () => {
    const id = rdpProfiles.selectedId || null;
    const savedId = await saveRdpProfile({
      name: rdpProfileName,
      host: rdpForm.host,
      port: rdpForm.port,
      username: rdpForm.username,
      domain: rdpForm.domain,
      password: rdpForm.password,
    }, { id });
    await refreshProfiles(savedId || id);
    setRdpProfileStatus('已加密儲存至你的帳號資料庫。');
  });

  const removeRdpProfile = () => {
    if (!rdpProfiles.selectedId) return;
    withProfileBusy(async () => {
      await deleteRdpProfile(rdpProfiles.selectedId);
      await refreshProfiles();
      fillRdpProfile(null);
      setRdpProfileStatus('已刪除此組連線設定。');
    });
  };

  const downloadRdpFile = async event => {
    event.preventDefault();
    try {
      const response = await fetch('/api/rdp/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: rdpForm.host,
          port: rdpForm.port,
          username: rdpForm.username,
          domain: rdpForm.domain,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || '無法建立 RDP 檔案');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await response.blob());
      link.download = 'liulianbot-remote.rdp';
      link.click();
      URL.revokeObjectURL(link.href);
      applyRdpState({ state: rdpState.state, message: 'RDP 檔案已下載。' });
    } catch (error) {
      applyRdpState({ state: 'error', message: error.message || '無法建立 RDP 檔案。' });
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewportRef.current?.requestFullscreen();
    } catch (_) {
      applyRdpState({ state: rdpState.state, message: '瀏覽器無法進入全螢幕模式。' });
    }
  };

  const saveSshProfile = () => {
    const profile = {
      host: sshForm.host.trim(),
      port: sshForm.port,
      username: sshForm.username.trim(),
      privateKey: sshForm.privateKey,
    };
    try {
      if (sshForm.storage === 'browser') {
        const saved = browserProfile();
        saved.ssh = profile;
        saveBrowserProfile(saved);
      } else {
        if (!serverStorageAvailable) throw new Error('伺服器加密儲存尚未設定');
        const next = { ...serverProfile, ssh: profile };
        setServerProfile(next);
        requestJSON('/api/remote-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(error => setSshStatus({ message: error.message || '無法儲存設定。', tone: 'error' }));
      }
      setSshStatus({ message: '設定已儲存。', tone: 'success' });
    } catch (error) {
      setSshStatus({ message: error.message || '無法儲存設定。', tone: 'error' });
    }
  };

  const connectSsh = event => {
    event.preventDefault();
    socketRef.current?.close();
    setTerminal('');
    setSshStatus({ message: '正在連線...', tone: '' });

    const socket = new WebSocket(sshEndpoint());
    socketRef.current = socket;
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        type: 'connect',
        host: sshForm.host,
        port: sshForm.port,
        username: sshForm.username,
        password: sshForm.password,
        privateKey: sshForm.privateKey,
      }));
    });
    socket.addEventListener('message', messageEvent => {
      const message = JSON.parse(messageEvent.data);
      if (message.type === 'data') {
        setTerminal(current => `${current}${String(message.data).replace(/\r(?!\n)/g, '')}`);
      }
      if (message.type === 'connected') {
        setSshConnected(true);
        setSshStatus({ message: '已連線', tone: 'success' });
      }
      if (message.type === 'error') setSshStatus({ message: message.message, tone: 'error' });
      if (message.type === 'closed') disconnectSsh();
    });
    socket.addEventListener('error', () => setSshStatus({ message: '無法建立 SSH 連線', tone: 'error' }));
    socket.addEventListener('close', () => {
      if (socketRef.current) disconnectSsh();
    });
  };

  const disconnectSsh = (message = '已中斷連線。') => {
    socketRef.current?.close();
    socketRef.current = null;
    setSshConnected(false);
    setSshStatus({ message, tone: 'success' });
  };

  const sendSshCommand = event => {
    if (event.key !== 'Enter' || !socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'input', data: `${sshCommand}\n` }));
    setSshCommand('');
  };

  const rdpBusy = rdpState.state === 'connecting' || rdpState.state === 'connected';
  const sshUsesKey = sshForm.authType === 'key';

  return (
    <main className="main-content remote-page">
      <header className="remote-hero">
        <div>
          <p className="remote-eyebrow">REMOTE WORKSPACE / WEBRDP</p>
          <h1>遠端工作區</h1>
          <p className="remote-desc">
            在瀏覽器內連線至 Windows 桌面。畫面與輸入會透過受保護的 Socket.IO 工作階段傳送。
          </p>
        </div>
        <div id="rdpStatusBadge" className="remote-status-badge" data-state={rdpState.state}>
          <span className="remote-status-dot" aria-hidden="true" />
          <span id="rdpStatusBadgeText">{rdpState.message}</span>
        </div>
      </header>

      <section id="rdpPanel" className="webrdp-shell" aria-labelledby="rdpHeading" hidden={!features.rdp}>
        <div className="webrdp-toolbar">
          <div className="remote-panel-heading">
            <div>
              <p className="panel-kicker">BROWSER RDP</p>
              <h2 id="rdpHeading">WebRDP 桌面</h2>
            </div>
            <span id="rdpHostLabel" className="rdp-host-label">{rdpHostLabel}</span>
          </div>
          <div className="webrdp-toolbar-actions">
            <button
              className="btn btn-sm btn-outline"
              id="rdpFit"
              type="button"
              aria-pressed={fit}
              title="將桌面縮放至工作區"
              onClick={() => setFit(current => !current)}
            >
              {fit ? '適合畫面' : '原始大小'}
            </button>
            <button className="btn btn-sm btn-outline" id="rdpFullscreen" type="button" title="切換全螢幕" onClick={toggleFullscreen}>
              全螢幕
            </button>
            <button
              className="btn btn-sm btn-danger"
              id="rdpDisconnect"
              type="button"
              disabled={!rdpBusy}
              onClick={disconnectRdp}
            >
              結束連線
            </button>
          </div>
        </div>
        <div id="rdpViewport" className="rdp-viewport" tabIndex={0} aria-label="RDP 遠端桌面" ref={viewportRef}>
          <canvas id="rdpCanvas" className="rdp-canvas" tabIndex={0} aria-label="Windows 遠端桌面畫面" ref={canvasRef} />
          <div id="rdpEmptyState" className="rdp-empty-state" hidden={rdpBusy}>
            <div className="rdp-empty-icon" aria-hidden="true">▣</div>
            <h3>準備好連線</h3>
            <p>在右側輸入主機與登入資訊，然後按下「連線至桌面」。</p>
          </div>
          <div id="rdpLoadingState" className="rdp-loading-state" hidden={rdpState.state !== 'connecting'}>
            <span className="rdp-spinner" aria-hidden="true" />
            <span id="rdpLoadingText">正在建立安全連線...</span>
          </div>
        </div>
        <StatusMessage
          id="rdpStatus"
          className="status-msg remote-inline-status"
          message={rdpState.message}
          tone={rdpState.state === 'error' ? 'error' : rdpState.state === 'connected' ? 'success' : ''}
        />
      </section>

      <div className="remote-grid remote-grid-lower">
        <section id="rdpConnectPanel" className="remote-panel rdp-connect-panel" aria-labelledby="rdpConnectHeading" hidden={!features.rdp}>
          <div className="remote-panel-heading">
            <div>
              <p className="panel-kicker">CONNECTION</p>
              <h2 id="rdpConnectHeading">連線設定</h2>
            </div>
            <span className="protocol-chip">RDP</span>
          </div>
          <p className="remote-note">
            每位使用者可保存多組連線，密碼會加密儲存於帳號資料庫。更新時密碼留空會保留原密碼。
          </p>
          <form id="rdpForm" className="remote-form" onSubmit={connectRdp}>
            <label className="field-span-2" htmlFor="rdpProfileList">
              {'我的連線設定'}
              <select
                id="rdpProfileList"
                value={rdpProfiles.selectedId}
                disabled={!rdpProfiles.available}
                onChange={event => selectRdpProfile(event.target.value)}
              >
                <option value="">新增連線設定</option>
                {rdpProfiles.items.map(profile => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </label>
            <label className="field-span-2" htmlFor="rdpProfileName">
              {'設定名稱'}
              <input
                id="rdpProfileName"
                maxLength="100"
                placeholder="例如：家中電腦"
                disabled={!rdpProfiles.available}
                value={rdpProfileName}
                onChange={event => setRdpProfileName(event.target.value)}
              />
            </label>
            <label className="field-span-2" htmlFor="rdpHost">
              {'主機'}
              <input
                id="rdpHost"
                required
                maxLength="253"
                autoComplete="off"
                placeholder="windows.example.com"
                value={rdpForm.host}
                onChange={event => setRdpForm({ ...rdpForm, host: event.target.value })}
              />
            </label>
            <label htmlFor="rdpPort">
              {'連接埠'}
              <input
                id="rdpPort"
                type="number"
                min="1"
                max="65535"
                value={rdpForm.port}
                onChange={event => setRdpForm({ ...rdpForm, port: event.target.value })}
              />
            </label>
            <label htmlFor="rdpUsername">
              {'使用者名稱'}
              <input
                id="rdpUsername"
                required
                maxLength="256"
                autoComplete="username"
                value={rdpForm.username}
                onChange={event => setRdpForm({ ...rdpForm, username: event.target.value })}
              />
            </label>
            <label htmlFor="rdpDomain">
              {'網域（選填）'}
              <input
                id="rdpDomain"
                maxLength="256"
                autoComplete="off"
                placeholder="CONTOSO"
                value={rdpForm.domain}
                onChange={event => setRdpForm({ ...rdpForm, domain: event.target.value })}
              />
            </label>
            <label htmlFor="rdpPassword">
              {'密碼'}
              <input
                id="rdpPassword"
                type="password"
                required
                maxLength="512"
                autoComplete="current-password"
                value={rdpForm.password}
                onChange={event => setRdpForm({ ...rdpForm, password: event.target.value })}
              />
            </label>

            <div className="remote-actions">
              <button className="btn btn-primary" id="rdpConnect" type="submit" disabled={rdpBusy}>
                連線至桌面
              </button>
              <button className="btn btn-outline" id="newRdp" type="button" disabled={!rdpProfiles.available} onClick={newRdpProfile}>
                新增
              </button>
              <button className="btn btn-outline" id="saveRdp" type="button" disabled={!rdpProfiles.available} onClick={saveRdpProfileDetails}>
                儲存設定
              </button>
              <button
                className="btn btn-outline"
                id="loadRdp"
                type="button"
                disabled={!rdpProfiles.available || !rdpProfiles.selectedId}
                onClick={() => selectRdpProfile(rdpProfiles.selectedId)}
              >
                載入設定與密碼
              </button>
              <button
                className="btn btn-outline"
                id="deleteServerProfile"
                type="button"
                disabled={!rdpProfiles.available || !rdpProfiles.selectedId}
                onClick={removeRdpProfile}
              >
                刪除此組設定
              </button>
            </div>
          </form>
          <StatusMessage id="rdpProfileStatus" message={rdpProfileStatus} />
        </section>

        <aside className="remote-side-stack">
          <section className="remote-panel remote-info-panel" aria-labelledby="rdpInfoHeading">
            <div className="remote-panel-heading">
              <div>
                <p className="panel-kicker">SESSION</p>
                <h2 id="rdpInfoHeading">工作階段資訊</h2>
              </div>
            </div>
            <dl className="remote-facts">
              <div><dt>引擎</dt><dd>LiuLianBot RDP</dd></div>
              <div><dt>畫面</dt><dd>HTML5 Canvas / RLE</dd></div>
              <div><dt>輸入</dt><dd>鍵盤、滑鼠、滾輪</dd></div>
            </dl>
            <p className="remote-security-note">
              <span aria-hidden="true">●</span> 連線需要已授權的 Remote Access 群組。
            </p>
          </section>

          <section className="remote-panel" aria-labelledby="rdpDownloadHeading">
            <div className="remote-panel-heading">
              <div>
                <p className="panel-kicker">ALTERNATIVE</p>
                <h2 id="rdpDownloadHeading">下載連線檔</h2>
              </div>
            </div>
            <p className="remote-note">使用 Microsoft Remote Desktop 或相容用戶端開啟 `.rdp` 檔案。</p>
            <form id="rdpDownloadForm" className="remote-form remote-download-form" onSubmit={downloadRdpFile}>
              <div className="remote-actions">
                <button className="btn btn-outline" type="submit">下載 `.rdp` 檔案</button>
              </div>
            </form>
          </section>
        </aside>
      </div>

      <section id="sshPanel" className="remote-panel ssh-section" aria-labelledby="sshHeading" hidden={!features.ssh}>
        <div className="remote-panel-heading">
          <div>
            <p className="panel-kicker">SECURE SHELL</p>
            <h2 id="sshHeading">SSH 終端機</h2>
          </div>
          <StatusMessage
            id="sshStatus"
            className="status-msg"
            message={sshStatus.message}
            tone={sshStatus.tone}
          />
        </div>
        <form id="sshForm" className="remote-form" onSubmit={connectSsh}>
          <label htmlFor="sshHost">
            {'主機'}
            <input
              id="sshHost"
              required
              maxLength="253"
              autoComplete="off"
              placeholder="server.example.com"
              value={sshForm.host}
              onChange={event => setSshForm({ ...sshForm, host: event.target.value })}
            />
          </label>
          <label htmlFor="sshPort">
            {'連接埠'}
            <input
              id="sshPort"
              type="number"
              min="1"
              max="65535"
              value={sshForm.port}
              onChange={event => setSshForm({ ...sshForm, port: event.target.value })}
            />
          </label>
          <label htmlFor="sshUsername">
            {'使用者名稱'}
            <input
              id="sshUsername"
              required
              maxLength="256"
              autoComplete="username"
              value={sshForm.username}
              onChange={event => setSshForm({ ...sshForm, username: event.target.value })}
            />
          </label>
          <label htmlFor="sshAuthType">
            {'驗證方式'}
            <select
              id="sshAuthType"
              value={sshForm.authType}
              onChange={event => setSshForm({ ...sshForm, authType: event.target.value })}
            >
              <option value="password">密碼</option>
              <option value="key">私密金鑰</option>
            </select>
          </label>
          <label id="sshPasswordLabel" htmlFor="sshPassword" hidden={sshUsesKey}>
            {'密碼'}
            <input
              id="sshPassword"
              type="password"
              maxLength="512"
              autoComplete="current-password"
              required={!sshUsesKey}
              value={sshForm.password}
              onChange={event => setSshForm({ ...sshForm, password: event.target.value })}
            />
          </label>
          <label id="sshKeyLabel" htmlFor="sshKey" hidden={!sshUsesKey}>
            {'私密金鑰'}
            <textarea
              id="sshKey"
              rows="4"
              maxLength="16384"
              spellCheck="false"
              required={sshUsesKey}
              value={sshForm.privateKey}
              onChange={event => setSshForm({ ...sshForm, privateKey: event.target.value })}
            />
          </label>
          <label htmlFor="sshStorage">
            {'設定儲存位置'}
            <select
              id="sshStorage"
              value={sshForm.storage}
              onChange={event => setSshForm({ ...sshForm, storage: event.target.value })}
            >
              <option value="browser">此瀏覽器</option>
              <option value="server" disabled={!serverStorageAvailable}>伺服器（加密）</option>
            </select>
          </label>
          <div className="remote-actions">
            <button className="btn btn-outline" id="saveSsh" type="button" onClick={saveSshProfile}>儲存 SSH 設定</button>
            <button className="btn btn-primary" id="sshConnect" type="submit" disabled={sshConnected}>連線</button>
            <button className="btn btn-outline" id="sshDisconnect" type="button" disabled={!sshConnected} onClick={() => {
              socketRef.current?.send(JSON.stringify({ type: 'disconnect' }));
              disconnectSsh();
            }}>
              中斷
            </button>
          </div>
        </form>
        <pre id="sshTerminal" className="ssh-terminal" tabIndex={0} aria-label="SSH 終端機" ref={terminalRef}>
          {terminal}
        </pre>
        <label className="terminal-input-label" htmlFor="sshInput">
          {'輸入指令'}
          <input
            id="sshInput"
            autoComplete="off"
            spellCheck="false"
            disabled={!sshConnected}
            value={sshCommand}
            onChange={event => setSshCommand(event.target.value)}
            onKeyDown={sendSshCommand}
          />
        </label>
      </section>
    </main>
  );
}
