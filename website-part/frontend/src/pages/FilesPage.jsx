import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../components/Modal.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';
import {
  SHARE_HOURS,
  UPLOAD_LIMIT,
  ARCHIVE_LIMIT,
  breadcrumbTrail,
  downloadArchive,
  entryName,
  filesRequest,
  formatSize,
  formatTime,
  joinPath,
} from '../lib/filesApi.mjs';

function listTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = number => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function EntryIcon({ directory }) {
  return <span className={directory ? 'file-entry-icon is-folder' : 'file-entry-icon is-document'} aria-hidden="true" />;
}

const DEFAULT_GRANT_FORM = Object.freeze({ username: '', read: true, write: false, share: false });

function permissionLabel(user) {
  const flags = [
    user.can_read && '讀取',
    user.can_write && '寫入',
    user.can_share && '分享',
  ].filter(Boolean);
  return `${flags.join('、') || '未授權'}${user.requested_at ? ' · 等待核准' : ''}`;
}

export function FilesPage() {
  const [grant, setGrant] = useState(null);
  const [current, setCurrent] = useState('');
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState({ message: '正在載入檔案權限…', tone: '' });
  const [shareResult, setShareResult] = useState(null);
  const [shareHours, setShareHours] = useState(24);
  const [shares, setShares] = useState([]);
  const [shareUsers, setShareUsers] = useState([]);
  const [grantForm, setGrantForm] = useState(DEFAULT_GRANT_FORM);
  const [newFolder, setNewFolder] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState([]);
  const navigation = useRef(0);
  const uploadInput = useRef(null);
  const renameAction = useAsyncAction();
  const deleteAction = useAsyncAction();
  const folderAction = useAsyncAction();
  const uploadAction = useAsyncAction();
  const archiveAction = useAsyncAction();

  const report = useCallback((message, tone = '') => setStatus({ message, tone }), []);

  const run = useCallback(async operation => {
    try {
      return await operation();
    } catch (error) {
      report(error.message, 'error');
      return undefined;
    }
  }, [report]);

  // `useAsyncAction.run` resolves to undefined when a second click arrives while
  // the first operation is still in flight, so the failure handler is optional.
  const attempt = promise => promise?.catch(error => report(error.message, 'error'));

  const openFolder = useCallback(async path => {
    const serial = navigation.current + 1;
    navigation.current = serial;
    report('正在讀取 FnOS…');
    const data = await filesRequest(`/list?path=${encodeURIComponent(path)}`);
    if (serial !== navigation.current) return;
    setCurrent(data.path);
    setEntries(data.entries);
    setFilter('');
    setSelected([]);
    report(`${data.entries.length} 個項目`);
  }, [report]);

  const loadShares = useCallback(async () => {
    const data = await filesRequest('/shares');
    setShares(data.shares);
  }, []);

  const loadPermissions = useCallback(async () => {
    const data = await filesRequest('/permissions');
    setShareUsers(data.users);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const access = await filesRequest('/access');
        if (!active) return;
        setGrant(access);
        if (access.share) await loadShares();
        if (access.owner) await loadPermissions();
        if (access.read) await openFolder('');
        else if (access.requested) report('已送出申請，等待 LiuLian 核准。');
      } catch (error) {
        if (active) report(error.message, 'error');
      }
    })();
    return () => { active = false; };
  }, [loadPermissions, loadShares, openFolder, report]);

  const read = Boolean(grant?.read);
  const write = Boolean(grant?.write);
  const canShare = Boolean(grant?.share);
  const filterValue = filter.trim().toLocaleLowerCase();
  const visibleEntries = entries.filter(entry => entry.name.toLocaleLowerCase().includes(filterValue));
  const visiblePaths = visibleEntries.map(entry => joinPath(current, entry.name));
  const allVisibleSelected = visiblePaths.length > 0 && visiblePaths.every(path => selected.includes(path));
  const toggleVisible = () => setSelected(allVisibleSelected ? [] : [...new Set([...selected, ...visiblePaths])]);

  const requestAccess = () => run(async () => {
    await filesRequest('/access/request', { method: 'POST' });
    setGrant(previous => ({ ...previous, requested: true }));
    report('已送出申請，請等待 LiuLian 核准後重新整理頁面。');
  });

  const refresh = () => run(async () => {
    await openFolder(current);
    if (grant?.share) await loadShares();
    if (grant?.owner) await loadPermissions();
  });

  // Checked rows are packed into one ZIP on the server, so a large folder never
  // has to be downloaded file by file.
  const toggleSelected = path => setSelected(list => list.includes(path)
    ? list.filter(item => item !== path)
    : [...list, path]);

  const packSelection = paths => attempt(archiveAction.run(async () => {
    if (!paths.length) return;
    if (paths.length > ARCHIVE_LIMIT) throw new Error(`單次最多打包 ${ARCHIVE_LIMIT} 個項目`);
    report(`正在打包 ${paths.length} 個項目，資料夾較大時需要一些時間…`);
    try {
      const filename = await downloadArchive(paths);
      report(`已開始下載 ${filename}。`);
    } catch (error) {
      if (error?.name !== 'AbortError') throw error;
      report('已取消打包下載。');
    }
  }));

  const createFolder = () => attempt(folderAction.run(async () => {
    const name = entryName(newFolder.trim());
    await filesRequest('/folder', { method: 'POST', body: { path: joinPath(current, name) } });
    setNewFolder('');
    await openFolder(current);
    report('資料夾已建立。');
  }));

  const upload = event => {
    const file = event.target.files?.[0];
    if (!file || uploading) return;
    attempt(uploadAction.run(async () => {
      if (file.size > UPLOAD_LIMIT) throw new Error('單次上傳上限為 1 GiB');
      const destination = current;
      setUploading(true);
      report(`正在上傳 ${file.name}…`);
      try {
        await filesRequest(
          `/upload?path=${encodeURIComponent(joinPath(destination, entryName(file.name)))}`,
          { method: 'PUT', body: file, binary: true },
        );
      } finally {
        setUploading(false);
        if (uploadInput.current) uploadInput.current.value = '';
      }
      await openFolder(current);
      report(`已上傳 ${file.name}。`);
    }));
  };

  const startRename = entry => setRenameTarget({
    path: joinPath(current, entry.name),
    name: entry.name,
    value: entry.name,
  });

  const submitRename = event => {
    event.preventDefault();
    const target = renameTarget;
    if (!target) return;
    attempt(renameAction.run(async () => {
      const value = target.value.trim();
      if (value !== target.name) {
        await filesRequest('/rename', {
          method: 'POST',
          body: { from: target.path, to: joinPath(current, entryName(value)) },
        });
        await openFolder(current);
        report('已重新命名。');
      }
      setRenameTarget(null);
    }));
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    if (!target) return;
    attempt(deleteAction.run(async () => {
      await filesRequest('/entry', { method: 'DELETE', body: { path: target.path } });
      setDeleteTarget(null);
      await openFolder(current);
      report('已刪除。');
    }));
  };

  const share = path => run(async () => {
    const result = await filesRequest('/shares', { method: 'POST', body: { path, hours: Number(shareHours) } });
    setShareResult({
      code: result.code,
      link: `${globalThis.location.origin}/share.html#${result.code}`,
      expiresAt: result.expiresAt,
    });
    report('分享已建立。');
    await loadShares();
  });

  const revokeShare = item => run(async () => {
    await filesRequest(`/shares/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    await loadShares();
    report('分享已撤銷。');
  });

  const copyShareLink = () => run(async () => {
    await navigator.clipboard.writeText(shareResult.link);
    report('已複製分享連結。');
  });

  const savePermissions = event => {
    event.preventDefault();
    run(async () => {
      await filesRequest('/permissions', {
        method: 'PUT',
        body: {
          username: grantForm.username.trim(),
          read: grantForm.read,
          write: grantForm.write,
          share: grantForm.share,
        },
      });
      await loadPermissions();
      report('權限已儲存。');
    });
  };

  const loadGrantForm = user => {
    setGrantForm({
      username: user.username,
      read: Boolean(user.can_read || user.requested_at),
      write: Boolean(user.can_write),
      share: Boolean(user.can_share),
    });
    globalThis.document.getElementById('grantUsername')?.focus();
  };

  const revokePermissions = user => run(async () => {
    await filesRequest('/permissions', {
      method: 'PUT',
      body: { username: user.username, read: false, write: false, share: false },
    });
    await loadPermissions();
    report('帳號權限已撤銷。既有分享碼可在有效分享區另行撤銷。');
  });

  return (
    <main className="main-content file-page" id="main-content">
      <header className="file-hero">
        <div>
          <p className="panel-kicker">FNOS STORAGE</p>
          <h1>檔案與資料夾</h1>
          <p>瀏覽、儲存與分享你的檔案。</p>
        </div>
        <a className="btn btn-outline" href="/share.html">開啟分享碼</a>
      </header>

      <StatusMessage id="fileStatus" message={status.message} tone={status.tone} />

      {grant && !read && (
        <section id="accessPanel" className="file-panel">
          <h2>需要 LiuLian 授權</h2>
          <p>請送出申請，待 LiuLian 核准後即可存取。</p>
          <button
            id="requestAccess"
            className="btn btn-primary"
            type="button"
            disabled={Boolean(grant.requested)}
            onClick={requestAccess}
          >
            申請存取
          </button>
        </section>
      )}

      {read && (
        <section id="browserPanel" className="file-panel">
          <div className="file-toolbar">
            <nav id="breadcrumbs" aria-label="資料夾路徑">
              <button className="btn btn-outline" type="button" onClick={() => run(() => openFolder(''))}>
                FnOS
              </button>
              {breadcrumbTrail(current).map(part => (
                <span key={part.path}>
                  <span aria-hidden="true">/</span>
                  <button className="btn btn-outline" type="button" onClick={() => run(() => openFolder(part.path))}>
                    {part.name}
                  </button>
                </span>
              ))}
            </nav>
            <button id="refreshFiles" className="btn btn-outline" type="button" onClick={refresh}>
              重新整理
            </button>
          </div>

          {selected.length > 0 && (
            <div id="selectionTools" className="file-toolbar">
              <span id="selectionCount">{`已選 ${selected.length} 個項目`}</span>
              <button
                id="archiveSelection"
                className="btn btn-primary"
                type="button"
                disabled={archiveAction.busy}
                onClick={() => packSelection(selected)}
              >
                打包成 ZIP 下載
              </button>
              <button id="clearSelection" className="btn btn-outline" type="button" onClick={() => setSelected([])}>
                清除選取
              </button>
            </div>
          )}

          {write && current && (
            <form id="newFolderForm" className="file-toolbar" onSubmit={event => { event.preventDefault(); createFolder(); }}>
              <label htmlFor="newFolderName">新增資料夾</label>
              <input
                id="newFolderName"
                maxLength="255"
                value={newFolder}
                onChange={event => setNewFolder(event.target.value)}
              />
              <button className="btn btn-outline" type="submit" disabled={!newFolder.trim() || folderAction.busy}>
                建立
              </button>
              <label className="btn btn-primary" htmlFor="uploadFile">上傳檔案</label>
              <input
                id="uploadFile"
                type="file"
                hidden
                ref={uploadInput}
                disabled={uploading}
                onChange={upload}
              />
              <span>最多 1 GiB，同名檔案不會被覆蓋。</span>
            </form>
          )}

          {canShare && (
            <div id="shareTools" className="file-toolbar">
              <label htmlFor="shareHours">分享期限</label>
              <select
                id="shareHours"
                value={shareHours}
                onChange={event => setShareHours(event.target.value)}
              >
                {SHARE_HOURS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                id="shareFolder"
                className="btn btn-outline"
                type="button"
                disabled={!current}
                onClick={() => share(current)}
              >
                分享此資料夾
              </button>
            </div>
          )}

          <label htmlFor="fileSearch">搜尋此資料夾</label>
          <input
            id="fileSearch"
            type="search"
            placeholder="輸入檔案名稱"
            value={filter}
            onChange={event => setFilter(event.target.value)}
          />

          <div className="file-table-scroll">
            <table className="file-table file-detail-table" aria-label="檔案與資料夾">
              <thead>
                <tr>
                  <th scope="col" className="file-select-cell">
                    <input
                      id="selectAllFiles"
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisible}
                      aria-label="選取全部項目"
                    />
                  </th>
                  <th scope="col">名稱</th><th scope="col">修改時間</th><th scope="col">儲存空間</th><th scope="col">類型</th><th scope="col">大小</th><th scope="col">建立時間</th><th scope="col">操作</th>
                </tr>
              </thead>
              <tbody id="fileRows">
                {visibleEntries.map(entry => {
                  const path = joinPath(current, entry.name);
                  const volume = path.split('/')[0].match(/^vol(\d+)$/)?.[1];
                  return (
                    <tr key={entry.name}>
                      <td className="file-select-cell">
                        <input
                          type="checkbox"
                          checked={selected.includes(path)}
                          onChange={() => toggleSelected(path)}
                          aria-label={`選取 ${entry.name}`}
                        />
                      </td>
                      <td>
                        {entry.directory ? (
                          <button className="file-name" type="button" onClick={() => run(() => openFolder(path))}>
                            <span className="file-chevron" aria-hidden="true" /><EntryIcon directory /><span className="file-entry-label" title={entry.name}>{entry.name}</span>
                          </button>
                         ) : <span className="file-name file-name-static"><span className="file-chevron-spacer" aria-hidden="true" /><EntryIcon directory={false} /><span className="file-entry-label" title={entry.name}>{entry.name}</span></span>}
                      </td>
                      <td>{listTime(entry.modified)}</td>
                      <td>{volume ? '儲存空間' + volume : '—'}</td>
                      <td>{entry.directory ? '資料夾' : '檔案'}</td>
                      <td>{entry.directory ? '—' : formatSize(entry.size)}</td>
                      <td>{listTime(entry.created)}</td>
                      <td className="file-actions">
                        {(!entry.directory || read || canShare || (write && current)) && <details>
                          <summary aria-label={entry.name + ' 的操作'}>•••</summary>
                          <div className="file-action-menu">
                        {!entry.directory && (
                          <a
                            className="btn btn-outline"
                            href={`/api/files/download?path=${encodeURIComponent(path)}`}
                            download=""
                          >
                            下載
                          </a>
                        )}
                        {canShare && (
                          <button className="btn btn-outline" type="button" onClick={() => share(path)}>分享</button>
                        )}
                        {entry.directory && (
                          <button className="btn btn-outline" type="button" onClick={() => packSelection([path])}>
                            打包下載
                          </button>
                        )}
                        {write && current && (
                          <>
                            <button className="btn btn-outline" type="button" onClick={() => startRename(entry)}>
                              重新命名
                            </button>
                            <button
                              className="btn btn-outline"
                              type="button"
                              onClick={() => setDeleteTarget({ path, entry })}
                            >
                              刪除
                            </button>
                          </>
                        )}
                          </div>
                        </details>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p id="emptyFiles" hidden={visibleEntries.length !== 0}>此資料夾沒有符合的項目。</p>
        </section>
      )}

      {shareResult && (
        <section id="shareResult" className="file-panel">
          <h2>分享已建立</h2>
          <p>持有此碼的人可讀取分享內容；資料夾分享包含其子目錄。</p>
          <label htmlFor="shareCode">分享碼（僅顯示一次）</label>
          <input id="shareCode" readOnly value={shareResult.code} />
          <label htmlFor="shareLink">分享連結</label>
          <input id="shareLink" readOnly value={shareResult.link} />
          <button id="copyShare" className="btn btn-primary" type="button" onClick={copyShareLink}>
            複製連結
          </button>
          <p id="shareExpiry">{`到期時間：${formatTime(shareResult.expiresAt)}`}</p>
        </section>
      )}

      {canShare && (
        <section id="sharesPanel" className="file-panel">
          <h2>有效分享</h2>
          <p>LiuLian 可查看及撤銷所有分享；其他使用者只能管理自己建立的分享。</p>
          <div id="shareRows">
            {shares.length === 0
              ? '目前沒有有效分享。'
              : shares.map(item => (
                <div className="file-record" key={item.id}>
                  <span>{`${item.name} · 到期 ${formatTime(item.expires_at)}`}</span>
                  <button className="btn btn-outline" type="button" onClick={() => revokeShare(item)}>
                    撤銷
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}

      {grant?.owner && (
        <section id="permissionsPanel" className="file-panel">
          <h2>帳號授權</h2>
          <p>權限適用於所有 /vol*/1000 目錄。寫入與分享權限均需要讀取權限。</p>
          <form id="permissionForm" onSubmit={savePermissions}>
            <label htmlFor="grantUsername">網站帳號</label>
            <input
              id="grantUsername"
              maxLength="20"
              required
              placeholder="輸入要授權的帳號"
              value={grantForm.username}
              onChange={event => setGrantForm({ ...grantForm, username: event.target.value })}
            />
            <div className="file-toolbar">
              <label>
                <input
                  id="grantRead"
                  type="checkbox"
                  checked={grantForm.read}
                  onChange={event => setGrantForm({ ...grantForm, read: event.target.checked })}
                />
                {' 讀取'}
              </label>
              <label>
                <input
                  id="grantWrite"
                  type="checkbox"
                  checked={grantForm.write}
                  onChange={event => setGrantForm({ ...grantForm, write: event.target.checked })}
                />
                {' 寫入'}
              </label>
              <label>
                <input
                  id="grantShare"
                  type="checkbox"
                  checked={grantForm.share}
                  onChange={event => setGrantForm({ ...grantForm, share: event.target.checked })}
                />
                {' 分享'}
              </label>
              <button className="btn btn-primary" type="submit">儲存權限</button>
            </div>
          </form>
          <div id="permissionRows">
            {shareUsers.map(user => (
              <div className="file-record" key={user.user_id}>
                <span>{`${user.username} · ${permissionLabel(user)}`}</span>
                <button className="btn btn-outline" type="button" onClick={() => loadGrantForm(user)}>
                  編輯／核准
                </button>
                <button className="btn btn-outline" type="button" onClick={() => revokePermissions(user)}>
                  撤銷全部權限
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={Boolean(renameTarget)}
        labelledBy="renameModalTitle"
        onClose={() => setRenameTarget(null)}
      >
        <h3 id="renameModalTitle">重新命名</h3>
        <form id="renameForm" onSubmit={submitRename}>
          <div className="form-group">
            <label htmlFor="renameValue">新名稱</label>
            <input
              id="renameValue"
              maxLength="255"
              value={renameTarget?.value || ''}
              onChange={event => setRenameTarget({ ...renameTarget, value: event.target.value })}
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={renameAction.busy}>儲存</button>
            <button className="btn btn-outline" type="button" onClick={() => setRenameTarget(null)}>取消</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        labelledBy="deleteModalTitle"
        onClose={() => setDeleteTarget(null)}
      >
        <h3 id="deleteModalTitle">刪除項目</h3>
        {deleteTarget && (
          <p>
            {deleteTarget.entry.directory
              ? `確定刪除「${deleteTarget.entry.name}」？僅可刪除空資料夾。`
              : `確定刪除「${deleteTarget.entry.name}」？此操作無法復原。`}
          </p>
        )}
        <div className="form-actions">
          <button className="btn btn-primary" type="button" disabled={deleteAction.busy} onClick={confirmDelete}>
            刪除
          </button>
          <button className="btn btn-outline" type="button" onClick={() => setDeleteTarget(null)}>取消</button>
        </div>
      </Modal>
    </main>
  );
}
