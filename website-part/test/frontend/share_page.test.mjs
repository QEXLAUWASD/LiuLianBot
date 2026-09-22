import assert from 'node:assert/strict';
import test from 'node:test';

import { SharePage } from '../../frontend/src/pages/SharePage.jsx';
import { click, flush, mockFetch, render, setupDom, toggle, typeInto } from '../support/react.mjs';

const CODE = 'b'.repeat(32);
const FOLDER = {
  name: '相片',
  directory: true,
  path: '',
  expiresAt: '2026-01-02T03:04:05.000Z',
  entries: [
    { name: '子目錄', directory: true, size: 0, modified: null },
    { name: 'a.txt', directory: false, size: 1024, modified: '2026-01-02T03:04:05.000Z' },
  ],
};

function mount({ hash = '', routes = {} } = {}) {
  const url = `https://example.test/share.html${hash}`;
  const dom = setupDom('<div id="root"></div>', { url });
  const fetchMock = mockFetch({
    'POST /api/files/shared/list': { payload: FOLDER },
    ...routes,
  });
  render(<SharePage />);
  return { dom, document: dom.document, fetchMock };
}

test('a share link in the URL fragment opens the folder without signing in', async () => {
  const { dom, document, fetchMock } = mount({ hash: `#${CODE}` });
  try {
    await flush();

    const call = fetchMock.callsTo('POST', '/api/files/shared/list')[0];
    assert.deepEqual(call.body, { code: CODE, path: '' });
    assert.equal(document.getElementById('shareName').textContent, '相片');
    assert.match(document.getElementById('shareExpiry').textContent, /^到期時間：/);
    assert.match(document.getElementById('fileRows').textContent, /1\.0 KiB/);
    assert.equal(document.getElementById('fileStatus').textContent, '分享已開啟。');
    assert.equal(document.getElementById('downloadSharedFile').hidden, true);
  } finally {
    dom.cleanup();
  }
});

test('an entered code loads the share and a file row offers a download', async () => {
  const { dom, document, fetchMock } = mount();
  try {
    await flush();

    assert.equal(document.getElementById('browserPanel'), null);
    typeInto(document.getElementById('codeInput'), CODE.toUpperCase());
    click(document.querySelector('#openShare button[type="submit"]'));
    await flush();

    assert.deepEqual(
      fetchMock.callsTo('POST', '/api/files/shared/list')[0].body,
      { code: CODE, path: '' },
      'codes are lower-cased before they are sent',
    );

    const rows = [...document.querySelectorAll('#fileRows tr')];
    assert.equal(rows.length, 2);
    assert.equal(rows[1].querySelector('button').textContent, '下載');
  } finally {
    dom.cleanup();
  }
});

// Form submissions are captured instead of navigating jsdom away from the page.
function stubFormSubmit() {
  const submissions = [];
  const prototype = Object.getPrototypeOf(globalThis.document.createElement('form'));
  const original = prototype.submit;
  prototype.submit = function capture() {
    submissions.push({
      action: this.getAttribute('action'),
      target: this.target,
      fields: [...this.querySelectorAll('input')].map(input => [input.name, input.value]),
    });
  };
  return {
    submissions,
    restore() { prototype.submit = original; },
  };
}

test('checked entries of a shared folder are packed into one ZIP', async () => {
  const { dom, document } = mount({ hash: `#${CODE}` });
  // The stub patches the jsdom prototype, so it has to follow `mount`.
  const submit = stubFormSubmit();
  try {
    await flush();

    assert.equal(document.getElementById('selectionTools'), null, 'the toolbar needs a selection');
    const rows = [...document.querySelectorAll('#fileRows tr')];
    toggle(rows[1].querySelector('input[type="checkbox"]'));
    await flush();
    assert.equal(document.getElementById('selectionCount').textContent, '已選 1 個項目');

    click(document.getElementById('archiveShared'));
    assert.deepEqual(submit.submissions, [{
      action: '/api/files/shared/archive',
      target: 'fileDownload',
      fields: [['code', CODE], ['paths', 'a.txt']],
    }]);
    assert.match(document.getElementById('fileStatus').textContent, /已送出打包請求/);

    toggle(document.getElementById('selectAllShared'));
    await flush();
    assert.equal(document.getElementById('selectionCount').textContent, '已選 2 個項目');
    click(document.getElementById('clearSelection'));
    await flush();
    assert.equal(document.getElementById('selectionTools'), null);
  } finally {
    submit.restore();
    dom.cleanup();
  }
});

test('a single file share keeps the plain download with no pack controls', async () => {
  const { dom, document } = mount({
    hash: `#${CODE}`,
    routes: {
      'POST /api/files/shared/list': {
        payload: { name: 'a.txt', directory: false, path: '', expiresAt: null, entries: [] },
      },
    },
  });
  try {
    await flush();

    assert.equal(document.getElementById('selectAllShared'), null);
    assert.equal(document.querySelectorAll('#fileRows input[type="checkbox"]').length, 0);
    assert.equal(document.getElementById('downloadSharedFile').hidden, false);
  } finally {
    dom.cleanup();
  }
});

test('an expired share shows the server message', async () => {
  const { dom, document } = mount({
    hash: `#${CODE}`,
    routes: {
      'POST /api/files/shared/list': { status: 404, payload: { error: '分享碼無效或已過期' } },
    },
  });
  try {
    await flush();

    const status = document.getElementById('fileStatus');
    assert.equal(status.textContent, '分享碼無效或已過期');
    assert.equal(status.classList.contains('status-error'), true);
    assert.equal(document.getElementById('browserPanel'), null);
  } finally {
    dom.cleanup();
  }
});
