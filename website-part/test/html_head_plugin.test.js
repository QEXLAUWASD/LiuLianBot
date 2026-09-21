const test = require('node:test');
const assert = require('node:assert/strict');

async function plugin() {
  return import('../vite-plugins/html-head.mjs');
}

test('page names are derived from the HTML filename', async () => {
  const { pageName } = await plugin();
  assert.equal(pageName('/srv/frontend/login.html'), 'login');
  assert.equal(pageName('C:\\site\\404.html'), '404');
});

test('private pages are marked noindex and skip social preview tags', async () => {
  const { buildTags } = await plugin();
  const tags = buildTags('admin', 'LiuLianBot - Admin Panel');
  const attrs = name => tags.find(tag => tag.tag === 'meta' && tag.attrs.name === name)?.attrs;

  assert.equal(attrs('robots').content, 'noindex, nofollow');
  assert.equal(attrs('theme-color').content, '#1c6ba0');
  assert.equal(attrs('description'), undefined);
  assert.equal(tags.some(tag => tag.attrs.property === 'og:title'), false);
});

test('public pages get a description and social preview metadata', async () => {
  const { buildTags } = await plugin();
  const tags = buildTags('share', 'LiuLianBot - 開啟分享');
  const meta = name => tags.find(tag => tag.tag === 'meta' && tag.attrs.name === name)?.attrs;
  const property = value => tags.find(tag => tag.tag === 'meta' && tag.attrs.property === value)?.attrs;

  assert.match(meta('description').content, /分享碼/);
  assert.equal(property('og:title').content, 'LiuLianBot - 開啟分享');
  assert.equal(property('og:description').content, meta('description').content);
  assert.equal(property('og:image').content, '/img/icon-512.png');
  assert.equal(property('og:locale').content, 'zh_Hant');
  assert.equal(meta('twitter:card').content, 'summary');
  assert.equal(meta('robots'), undefined);
});

test('the transform injects every tag into the document head', async () => {
  const { htmlHeadPlugin } = await plugin();
  const pluginInstance = htmlHeadPlugin();
  const result = pluginInstance.transformIndexHtml.handler(
    '<!DOCTYPE html><html lang="en"><head><title>LiuLianBot - Login</title></head><body data-page="login"></body></html>',
    { filename: '/srv/frontend/login.html' },
  );

  assert.equal(result.html.includes('<title>'), true);
  assert.ok(result.tags.length > 0);
  assert.ok(result.tags.every(tag => tag.injectTo === 'head'));
});

test('the plugin is named and exposes a post-order transform', async () => {
  const { htmlHeadPlugin } = await plugin();
  const pluginInstance = htmlHeadPlugin();
  assert.equal(pluginInstance.name, 'liulianbot-html-head');
  assert.equal(pluginInstance.transformIndexHtml.order, 'post');
});
