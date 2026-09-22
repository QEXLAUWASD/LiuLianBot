import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { breadcrumbTrail, filesRequest, formatSize, formatTime, joinPath } from '../lib/filesApi.mjs';

// The share code lives in the URL fragment, which never reaches HTTP access
// logs; it is removed from history as soon as it has been read.
function initialCode(hash) {
  return (hash || '').replace(/^#/, '').trim().toLowerCase();
}

// Native form downloads stream straight to disk instead of buffering the file
// (or a whole archive) in JavaScript. Repeated field names become an array.
function downloadThroughForm(action, fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.target = 'fileDownload';
  for (const [name, values] of Object.entries(fields)) {
    for (const value of [].concat(values)) {
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = name;
      field.value = value;
      form.append(field);
    }
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
  const [selected, setSelected] = useState([]);
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
    setSelected([]);
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
    downloadThroughForm('/api/files/shared/download', { code: code.current, path });
    report('已送出下載請求。若分享已撤銷或檔案不可用，請重新開啟分享確認。');
  };

  const breadcrumbs = breadcrumbTrail(current);
  const rowPaths = (share?.entries || []).map(entry => joinPath(current, entry.name));
  const allSelected = rowPaths.length > 0 && rowPaths.every(path => selected.includes(path));
  const toggleSelected = path => setSelected(list => list.includes(path)
    ? list.filter(item => item !== path)
    : [...list, path]);
  const toggleAll = () => setSelected(allSelected ? [] : [...new Set([...selected, ...rowPaths])]);

  // Shares have no session, so the selection travels as repeated form fields
  // and the browser streams the ZIP straight to disk.
  const archiveSelection = () => {
    if (!selected.length) return;
    downloadThroughForm('/api/files/shared/archive', { code: code.current, paths: selected });
    report(`已送出打包請求（${selected.length} 個項目），瀏覽器會開始下載 ZIP。`);
  };

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
          {share.directory && selected.length > 0 && (
            <div id="selectionTools" className="file-toolbar">
              <span id="selectionCount">{`已選 ${selected.length} 個項目`}</span>
              <button id="archiveShared" className="btn btn-primary" type="button" onClick={archiveSelection}>
                打包成 ZIP 下載
              </button>
              <button id="clearSelection" className="btn btn-outline" type="button" onClick={() => setSelected([])}>
                清除選取
              </button>
            </div>
          )}
          <div className="file-table-scroll">
            <table className="file-table">
              <thead>
                <tr>
                  {share.directory && (
                    <th className="file-select-cell">
                      <input
                        id="selectAllShared"
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="選取全部項目"
                      />
                    </th>
                  )}
                  <th>名稱</th><th>大小</th><th>操作</th>
                </tr>
              </thead>
              <tbody id="fileRows">
                {share.entries.map(entry => (
                  <tr key={entry.name}>
                    {share.directory && (
                      <td className="file-select-cell">
                        <input
                          type="checkbox"
                          checked={selected.includes(joinPath(current, entry.name))}
                          onChange={() => toggleSelected(joinPath(current, entry.name))}
                          aria-label={`選取 ${entry.name}`}
                        />
                      </td>
                    )}
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
