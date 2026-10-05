import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { act } from 'react';
import { App, PAGE_LOADERS } from '../../frontend/src/App.jsx';
import { StatusMessage } from '../../frontend/src/components/StatusMessage.jsx';
import { authState } from '../../frontend/src/lib/authStore.mjs';
import { detectLocale, getLocale, LOCALE_KEY, message, normalizeLocale, setLocale, t } from '../../frontend/src/lib/i18n.mjs';
import zhHK from '../../frontend/src/locales/zh-HK.mjs';
import { formatUtc8 } from '../../frontend/src/lib/timeZone.mjs';
import { click, flush, mockFetch, render, selectOption, setupDom, typeInto } from '../support/react.mjs';

before(async () => { await PAGE_LOADERS.dashboard(); });

test('locale preference accepts zh_hk and follows saved choice before browser language', () => {
  assert.equal(normalizeLocale('zh_hk'), 'zh-HK');
  assert.equal(normalizeLocale('ZH-hant-HK'), 'zh-HK');
  assert.equal(normalizeLocale('en-GB'), 'en');
  assert.equal(normalizeLocale('fr'), null);
  assert.equal(detectLocale({ getItem: () => 'en' }, ['zh-HK']), 'en');
  assert.equal(detectLocale({ getItem: () => 'zh_hk' }, ['en-US']), 'zh-HK');
  assert.equal(detectLocale(null, ['fr', 'zh-HK', 'en']), 'zh-HK');
  assert.equal(detectLocale({ getItem() { throw Error('blocked'); } }, ['zh-HK']), 'zh-HK');
  assert.equal(detectLocale(null, ['fr']), 'en');
});

test('translations preserve unknown text, whitespace and interpolation values', () => {
  assert.equal(t('  Login ', {}, 'zh-HK'), '  登入 ');
  assert.equal(t('Unknown server diagnostic', {}, 'zh-HK'), 'Unknown server diagnostic');
  assert.equal(t('User "{0}" deleted', { 0: 'Home <script>' }, 'zh-HK'), '已刪除用戶「Home <script>」');
  assert.equal(t('Login', {}, 'en'), 'Login');
  for (const [key, value] of Object.entries(zhHK)) {
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(value), placeholders(key), `translation must preserve placeholders: ${key}`);
    assert.ok(value.trim(), key);
  }
});

function mount(t, page, routes = {}) {
  const dom = setupDom();
  setLocale('en');
  authState.reset();
  const fetchMock = mockFetch({
    'GET /api/auth/me': { payload: { loggedIn: true, user: { id: 1, username: 'Home', role: 'user' } } },
    'GET /api/page-visibility': { payload: { pages: { roller: true, events: true, account: true, remote: true } } },
    'GET /api/auth/terms-status': { payload: { required: true } },
    'GET /api/events': { payload: { events: [{ id: 1, title: 'Login', guild_name: 'Home', start_at: '2030-10-11T12:00:00Z', participant_count: 2, max_players: 5 }] } },
    'GET /api/connections': { payload: { connections: [] } },
    ...routes,
  });
  const view = render(<App page={page} />);
  t.after(() => { view.unmount(); fetchMock.restore(); setLocale('en'); dom.cleanup(); });
  return { ...dom, fetchMock };
}

test('language switching persists, updates accessibility metadata and preserves login inputs', async t => {
  const { document } = mount(t, 'login');
  await flush();
  typeInto(document.getElementById('loginUsername'), 'Home');
  typeInto(document.getElementById('loginPassword'), 'unchanged-secret');
  selectOption(document.querySelector('.language-select select'), 'zh-HK');
  await flush();
  assert.equal(document.documentElement.lang, 'zh-HK');
  assert.equal(document.title, 'LiuLianBot - 登入');
  assert.equal(localStorage.getItem(LOCALE_KEY), 'zh-HK');
  assert.equal(document.querySelector('h1').textContent, '歡迎返嚟。');
  assert.equal(document.getElementById('loginUsername').value, 'Home');
  assert.equal(document.getElementById('loginPassword').value, 'unchanged-secret');
  assert.equal(document.getElementById('loginUsername').placeholder, '輸入用戶名稱');
  assert.equal(document.querySelector('[aria-controls="loginPassword"]').getAttribute('aria-label'), '顯示登入密碼');
  click(document.getElementById('register-tab'));
  typeInto(document.getElementById('regUsername'), 'Register');
  selectOption(document.querySelector('.language-select select'), 'en');
  await flush();
  assert.equal(document.getElementById('register-tab').getAttribute('aria-selected'), 'true');
  assert.equal(document.getElementById('regUsername').value, 'Register');
  assert.equal(document.title, 'LiuLianBot - Login');
});

test('dashboard localizes labels and dates without changing event data, filters or refetching', async t => {
  const { document, fetchMock } = mount(t, 'dashboard');
  await flush();
  typeInto(document.getElementById('eventSearch'), 'Login');
  const requests = fetchMock.calls.length;
  selectOption(document.querySelector('.language-select select'), 'zh-HK');
  await flush();
  assert.equal(document.getElementById('welcomeName').textContent, 'Home');
  assert.equal(document.querySelector('.table-title').textContent, 'Login');
  assert.equal(document.querySelector('.table-sub').textContent, 'Home');
  assert.equal(document.getElementById('eventSearch').value, 'Login');
  assert.equal(document.getElementById('eventTableCount').textContent, '1 個活動');
  assert.equal(document.querySelector('.tool-name').textContent, 'R6 幹員抽選');
  assert.equal(document.querySelector('#siteNav a[href="/index.html"] .nav-label').textContent, '首頁');
  assert.match(formatUtc8('2030-10-11T12:00:00Z'), /20:00/);
  assert.equal(fetchMock.calls.length, requests, 'language changes must not refetch or reconnect');
  selectOption(document.querySelector('.language-select select'), 'en');
  await flush();
  assert.equal(document.getElementById('eventTableCount').textContent, '1 event');
});

test('a stored notification translates reactively while keeping user values literal', async t => {
  const dom = setupDom();
  setLocale('en');
  const view = render(<StatusMessage message={message('User "{0}" deleted', { 0: '<b>Home</b>' })} />);
  t.after(() => { view.unmount(); setLocale('en'); dom.cleanup(); });
  act(() => setLocale('zh_hk'));
  await flush();
  assert.equal(dom.document.querySelector('[role="status"]').textContent, '已刪除用戶「<b>Home</b>」');
  assert.equal(dom.document.querySelector('b'), null);
  act(() => setLocale('en'));
  assert.equal(dom.document.querySelector('[role="status"]').textContent, 'User "<b>Home</b>" deleted');
});

test('language selection remains usable when localStorage access is denied', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('blocked'); } });
  try {
    setLocale('zh_hk');
    assert.equal(getLocale(), 'zh-HK');
    setLocale('unsupported');
    assert.equal(getLocale(), 'zh-HK');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
    setLocale('en');
  }
});
