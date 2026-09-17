import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { breadcrumbTrail, filesRequest, formatSize, formatTime, joinPath } from '../lib/filesApi.mjs';

// The share code lives in the URL fragment, which never reaches HTTP access
// logs; it is removed from history as soon as it has been read.
function initialCode(hash) {
  return (hash || '').replace(/^#/, '').trim().toLowerCase();
}

function downloadThroughForm(code, path) {
  // Native form downloads stream straight to disk instead of buffering the file
  // in JavaScript.
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/files/shared/download';
  form.target = 'fileDownload';
  for (const [name, value] of Object.entries({ code, path })) {
    const field = document.createElement('input');
    field.type = 'hidden';
    field.name = name;
    field.value = value;
    form.append(field);
  }
  document.body.append(form);
  form.submit();
  form.remove();
}

export function SharePage({ location = globalThis.location } = {}) {
  const [codeInput, setCodeInput] = useState(() => initialCode(location?.hash));
  const [share, setShare] = useState(null);
  const [current, setCurrent] = useState('');
  const [status, setStatus] = useState({ message: '', tone: '' });
  const code = useRef(initialCode(location?.hash));
  const navigation = useRef(0);

  const report = useCallback((message, tone = '') => setStatus({ message, tone }), []);

  const open = useCallback(async path => {
    const serial = navigation.current + 1;
    navigation.current = serial;
    report('正在開啟分享…');
    const data = await filesRequest('/shared/list', { method: 'POST', body: { code: code.current, path } });
    if (serial !== navigation.current) return;
    setCurrent(data.path);
    setShare({
      name: data.name,
      directory: data.directory,
      expiresAt: data.expiresAt,
      entries: data.entries,
    });
    report('分享已開啟。');
  }, [report]);

  const run = useCallback(async operation => {
    try {
      return await operation();
    } catch (error) {
      report(error.message, 'error');
      return undefined;
    }
  }, [report]);

  useEffect(() => {
    if (!code.current) return;
    globalThis.history?.replaceState?.(null, '', globalThis.location.pathname);
    run(() => open(''));
  }, [open, run]);

  const submitCode = event => {
    event.preventDefault();
    code.current = codeInput.trim().toLowerCase();
    run(() => open(''));
  };

  const download = (path = '') => {
    downloadThroughForm(code.current, path);
    report('已送出下載請求。若分享已撤銷或檔案不可用，請重新開啟分享確認。');
  };

  const breadcrumbs = breadcrumbTrail(current);

  return (
    <main className="main-content file-page" id="main-content">
      <header className="file-hero">
        <div>
          <p className="panel-kicker">LIULIANBOT SHARE</p>
          <h1>有人與你分享了檔案</h1>
          <p>輸入分享碼即可瀏覽與下載，無需登入。</p>
        </div>
        <a className="btn btn-outline" href="/files.html">我的檔案</a>
      </header>

      <section className="file-panel">
        <form id="openShare" onSubmit={submitCode}>
          <label htmlFor="codeInput">分享碼</label>
          <div className="file-toolbar">
            <input
              id="codeInput"
              required
              maxLength="32"
              autoComplete="off"
              spellCheck="false"
              placeholder="貼上 32 字元分享碼"
              value={codeInput}
              onChange={event => setCodeInput(event.target.value)}
            />
            <button className="btn btn-primary" type="submit">開啟分享</button>
          </div>
        </form>
        <StatusMessage id="fileStatus" message={status.message} tone={status.tone} />
      </section>

      {share && (
        <section id="browserPanel" className="file-panel">
          <h2 id="shareName">{share.name}</h2>
          <p id="shareExpiry">{`到期時間：${formatTime(share.expiresAt)}`}</p>
          <nav id="breadcrumbs" aria-label="分享資料夾路徑">
            <button className="btn btn-outline" type="button" onClick={() => run(() => open(''))}>
              {share.name}
            </button>
            {breadcrumbs.map(part => (
              <span key={part.path}>
                <span aria-hidden="true">/</span>
                <button className="btn btn-outline" type="button" onClick={() => run(() => open(part.path))}>
                  {part.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="file-table-scroll">
            <table className="file-table">
              <thead>
                <tr><th>名稱</th><th>大小</th><th>操作</th></tr>
              </thead>
              <tbody id="fileRows">
                {share.entries.map(entry => (
                  <tr key={entry.name}>
                    <td>
                      {entry.directory ? (
                        <button
                          className="file-name"
                          type="button"
                          onClick={() => run(() => open(joinPath(current, entry.name)))}
                        >
                          {`📁 ${entry.name}`}
                        </button>
                      ) : `📄 ${entry.name}`}
                    </td>
                    <td>{entry.directory ? '—' : formatSize(entry.size)}</td>
                    <td>
                      {!entry.directory && (
                        <button
                          className="btn btn-outline"
                          type="button"
                          onClick={() => download(joinPath(current, entry.name))}
                        >
                          下載
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p id="emptyFiles" hidden={!share.directory || share.entries.length > 0}>此資料夾目前沒有檔案。</p>
          <button
            id="downloadSharedFile"
            className="btn btn-primary"
            type="button"
            hidden={share.directory}
            onClick={() => download('')}
          >
            下載檔案
          </button>
        </section>
      )}

      <iframe name="fileDownload" title="檔案下載" hidden />
    </main>
  );
}
