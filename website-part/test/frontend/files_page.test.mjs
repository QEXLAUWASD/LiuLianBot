import assert from 'node:assert/strict';
import test from 'node:test';

import { FilesPage } from '../../frontend/src/pages/FilesPage.jsx';
import { click, flush, mockFetch, render, setupDom, stubLocation, typeInto } from '../support/react.mjs';

const OWNER = { owner: true, userId: 'owner', read: true, write: true, share: true, requested: false };
const VOLUMES = {
  path: '',
  entries: [
    { name: 'vol1', directory: true, size: 0, modified: null },
    { name: 'vol2', directory: true, size: 0, modified: null },
  ],
};
const VOLUME_1 = {
  path: 'vol1',
  entries: [
    { name: '相片', directory: true, size: 0, modified: '2026-01-02T03:04:05.000Z' },
    { name: 'a.txt', directory: false, size: 2048, modified: '2026-01-02T03:04:05.000Z' },
  ],
};

function mount({ access = OWNER, routes = {} } = {}) {
  const dom = setupDom('<div id="root"></div>', {
    location: stubLocation({ pathname: '/files.html' }),
  });
  const fetchMock = mockFetch({
    'GET /api/files/access': { payload: access },
    'GET /api/files/list?path=': { payload: VOLUMES },
    'GET /api/files/shares': { payload: { shares: [] } },
    'GET /api/files/permissions': { payload: { users: [] } },
    ...routes,
  });
  render(<FilesPage />);
  return { dom, document: dom.document, fetchMock };
}

test('the owner browses volumes from the FnOS root', async () => {
  const { dom, document, fetchMock } = mount({
    routes: {
      'GET /api/files/permissions': {
        payload: {
          users: [{ user_id: 'reader', username: 'bob', can_read: 1, can_write: 0, can_share: 1, requested_at: null }],
        },
      },
    },
  });
  try {
    await flush();

    assert.equal(document.getElementById('fileStatus').textContent, '2 個項目');
    const rows = [...document.querySelectorAll('#fileRows tr')];
    assert.deepEqual(rows.map(row => row.querySelector('td').textContent), ['vol1', 'vol2']);
    assert.equal(document.querySelector('#fileRows a'), null, 'directories are not downloadable');

    // Write tools need a current directory; the root only lists volumes.
    assert.equal(document.getElementById('newFolderForm'), null);
    assert.equal(document.getElementById('shareFolder').disabled, true);

    assert.ok(document.getElementById('permissionsPanel'));
    assert.match(document.getElementById('permissionRows').textContent, /bob · 讀取、分享/);
    assert.equal(document.getElementById('accessPanel'), null);
    assert.equal(fetchMock.callsTo('GET', '/api/files/list?path=').length, 1);
  } finally {
    dom.cleanup();
  }
});

test('entering a volume lists files with download, rename and delete controls', async () => {
  const { dom, document } = mount({
    routes: { 'GET /api/files/list?path=vol1': { payload: VOLUME_1 } },
  });
  try {
    await flush();

    click([...document.querySelectorAll('#fileRows tr')][0].querySelector('button'));
    await flush();

    const rows = [...document.querySelectorAll('#fileRows tr')];
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].cells[1].textContent, '—', 'folder modification times are shown');
    assert.equal(rows[0].cells[2].textContent, '儲存空間1');
    assert.equal(rows[0].cells[3].textContent, '資料夾');
    assert.equal(rows[0].cells[5].textContent, '—', 'missing creation time is not fabricated');
    click(rows[1].querySelector('summary'));
    assert.match(rows[1].textContent, /2\.0 KiB/);
    assert.match(rows[1].textContent, /重新命名/);
    assert.match(rows[1].textContent, /刪除/);
    assert.equal(
      rows[1].querySelector('a').getAttribute('href'),
      '/api/files/download?path=vol1%2Fa.txt',
    );
    assert.equal(rows[1].querySelector('a').hasAttribute('download'), true);
    assert.equal(document.getElementById('shareFolder').disabled, false);
    assert.ok(document.getElementById('breadcrumbs').textContent.includes('vol1'));
    assert.ok(document.getElementById('newFolderForm'));
    assert.equal(document.getElementById('fileStatus').textContent, '2 個項目');
  } finally {
    dom.cleanup();
  }
});

test('the folder filter narrows the current listing', async () => {
  const { dom, document } = mount({
    routes: { 'GET /api/files/list?path=vol1': { payload: VOLUME_1 } },
  });
  try {
    await flush();
    click([...document.querySelectorAll('#fileRows tr')][0].querySelector('button'));
    await flush();

    typeInto(document.getElementById('fileSearch'), 'a.t');
    await flush();

    const rows = [...document.querySelectorAll('#fileRows tr')];
    assert.equal(rows.length, 1);
    assert.match(rows[0].textContent, /a\.txt/);
    assert.equal(document.getElementById('emptyFiles').hidden, true);
  } finally {
    dom.cleanup();
  }
});

test('creating a folder posts the joined path and reloads the listing', async () => {
  const { dom, document, fetchMock } = mount({
    routes: {
      'GET /api/files/list?path=vol1': { payload: VOLUME_1 },
      'POST /api/files/folder': { status: 201, payload: {} },
    },
  });
  try {
    await flush();
    click([...document.querySelectorAll('#fileRows tr')][0].querySelector('button'));
    await flush();

    typeInto(document.getElementById('newFolderName'), '新資料夾');
    click(document.querySelector('#newFolderForm button[type="submit"]'));
    await flush();

    const calls = fetchMock.callsTo('POST', '/api/files/folder');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { path: 'vol1/新資料夾' });
    assert.equal(fetchMock.callsTo('GET', '/api/files/list?path=vol1').length, 2);
    assert.equal(document.getElementById('newFolderName').value, '');
  } finally {
    dom.cleanup();
  }
});

test('sharing shows the one-time code and link', async () => {
  const code = 'a'.repeat(32);
  const { dom, document, fetchMock } = mount({
    routes: {
      'GET /api/files/list?path=vol1': { payload: VOLUME_1 },
      'POST /api/files/shares': {
        status: 201,
        payload: { id: 'share-1', code, name: 'a.txt', expiresAt: '2026-01-02T03:04:05.000Z' },
      },
    },
  });
  try {
    await flush();
    click([...document.querySelectorAll('#fileRows tr')][0].querySelector('button'));
    await flush();

    const shareButton = [...document.querySelectorAll('#fileRows tr')][1]
      .querySelectorAll('button')[0];
    assert.equal(shareButton.textContent, '分享');
    click(shareButton);
    await flush();

    assert.deepEqual(fetchMock.callsTo('POST', '/api/files/shares')[0].body, { path: 'vol1/a.txt', hours: 24 });
    assert.equal(document.getElementById('shareCode').value, code);
    assert.ok(document.getElementById('shareLink').value.endsWith(`/share.html#${code}`));
    assert.match(document.getElementById('shareExpiry').textContent, /^到期時間：/);
  } finally {
    dom.cleanup();
  }
});

test('accounts without a grant request access instead of listing files', async () => {
  const { dom, document, fetchMock } = mount({
    access: { owner: false, userId: 'bob', read: false, write: false, share: false, requested: false },
    // The router answers 204 with no body, which `Response` only accepts empty.
    routes: { 'POST /api/files/access/request': new Response(null, { status: 204 }) },
  });
  try {
    await flush();

    assert.ok(document.getElementById('accessPanel'));
    assert.equal(document.getElementById('browserPanel'), null);
    assert.equal(fetchMock.callsTo('GET', '/api/files/list?path=').length, 0);

    click(document.getElementById('requestAccess'));
    await flush();

    assert.equal(fetchMock.callsTo('POST', '/api/files/access/request').length, 1);
    assert.equal(document.getElementById('requestAccess').disabled, true);
    assert.match(document.getElementById('fileStatus').textContent, /已送出申請/);
  } finally {
    dom.cleanup();
  }
});

test('a failed listing surfaces the server message', async () => {
  const { dom, document } = mount({
    routes: {
      'GET /api/files/list?path=': { status: 502, payload: { error: '無法存取 FnOS，請稍後再試' } },
    },
  });
  try {
    await flush();

    const status = document.getElementById('fileStatus');
    assert.equal(status.textContent, '無法存取 FnOS，請稍後再試');
    assert.equal(status.classList.contains('status-error'), true);
  } finally {
    dom.cleanup();
  }
});
