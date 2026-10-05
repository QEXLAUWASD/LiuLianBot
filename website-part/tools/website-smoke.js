// Exercise the built UI under production CSP with local, deterministic API fixtures.
// No database, account credentials or remote hosts are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const puppeteer = require('puppeteer-core');
const { securityHeaders, CONTENT_SECURITY_POLICY } = require('../src/middleware/security_headers');

async function main() {
  const executablePath = process.env.WEBSITE_BROWSER_PATH || process.env.RDP_BROWSER_PATH || [
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(value => fs.existsSync(value));
  if (!executablePath) throw new Error('Set WEBSITE_BROWSER_PATH to a Chromium browser executable');

  let signedIn = true;
  let failEvents = false;
  let failConnections = false;
  const app = express();
  app.use(securityHeaders);
  app.get('/api/auth/me', (req, res) => res.json({ loggedIn: signedIn, user: signedIn ? { id: 'smoke-user', username: 'Alex', role: 'admin', remoteAvailable: true } : null }));
  app.get('/api/auth/terms-status', (req, res) => res.json({ required: false }));
  app.get('/api/page-visibility', (req, res) => res.json({ pages: { roller: true, events: signedIn, account: signedIn, remote: signedIn, chromium: signedIn, 'vless-tunnel': signedIn } }));
  app.get('/api/connections', (req, res) => failConnections
    ? res.status(503).json({ error: 'Websites temporarily unavailable' })
    : res.json({ connections: [{ slug: 'home-server', name: 'Home server' }] }));
  app.get('/api/events', (req, res) => failEvents
    ? res.status(503).json({ error: 'Calendar temporarily unavailable' })
    : res.json({ events: [
      { id: 1, title: 'Friday night ranked', mode: 'Ranked', guild_name: 'LiuLian community', start_at: '2030-10-11T12:00:00Z', participant_count: 4, max_players: 5, joined: 1 },
      { id: 2, title: 'Weekend customs', mode: 'Custom', guild_name: 'The squad', start_at: '2030-10-12T12:00:00Z', participant_count: 6, max_players: 10, joined: 0 },
    ] }));
  app.use(express.static(path.join(__dirname, '../public')));
  const server = app.listen(0, '127.0.0.1');
  let browser;
  try {
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    browser = await puppeteer.launch({
      executablePath, headless: true,
      args: process.env.WEBSITE_BROWSER_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/Content Security Policy|Refused to/.test(message.text())) errors.push(message.text());
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const screenshot = async name => {
      if (!process.env.WEBSITE_SCREENSHOT_DIR) return;
      fs.mkdirSync(process.env.WEBSITE_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.WEBSITE_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
    };
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the page must not overflow horizontally');

    await page.setViewport({ width: 1440, height: 1000 });
    const response = await page.goto(`${base}/index.html`, { waitUntil: 'networkidle0' });
    assert.equal(response.headers()['content-security-policy'], CONTENT_SECURITY_POLICY);
    await page.waitForFunction(() => document.querySelector('#statUpcoming')?.textContent === '2');
    await noOverflow();
    await screenshot('dashboard-desktop');
    await page.type('#eventSearch', 'no such event');
    await page.waitForFunction(() => document.querySelector('#eventTableCount')?.textContent === '0 events');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Clear filters').click());
    await page.waitForFunction(() => document.querySelector('#eventTableCount')?.textContent === '2 events');
    await page.click('.sidebar-collapse');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('.app-shell', node => node.dataset.navCollapsed), 'true');
    await page.click('.sidebar-collapse');

    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0);
    await noOverflow();
    await screenshot('dashboard-mobile');
    await page.click('.topbar-toggle');
    await page.waitForFunction(() => document.querySelector('.nav-brand') === document.activeElement);
    await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().left >= 0);
    await page.click('[aria-controls="workspaceMenu"]');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/remote.html');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('.app-shell', node => node.dataset.navOpen), 'true', 'Escape closes a submenu before the drawer');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement === document.querySelector('.topbar-toggle'));
    await page.click('.topbar-toggle');
    await page.setViewport({ width: 1440, height: 1000 });
    await page.waitForFunction(() => document.querySelector('.app-shell').dataset.navOpen === 'false');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');

    failEvents = true;
    failConnections = true;
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#priorityPanel [role="alert"]');
    assert.equal(await page.$eval('#statUpcoming', node => node.textContent), '–');
    assert.equal(await page.$eval('#statWebsites', node => node.textContent), '–');
    failEvents = false;
    failConnections = false;
    await page.click('#priorityPanel button');
    await page.click('.dashboard-alert button');
    await page.waitForFunction(() => document.querySelector('#statUpcoming')?.textContent === '2' && document.querySelector('#statWebsites')?.textContent === '1');

    signedIn = false;
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$('.stat-grid'), null);
    assert.equal(await page.$('#priorityPanel'), null);
    await noOverflow();
    await screenshot('dashboard-guest');

    await page.goto(`${base}/login.html`, { waitUntil: 'networkidle0' });
    await noOverflow();
    await screenshot('login-desktop');
    await page.type('#loginPassword', 'local-fixture');
    await page.click('[aria-controls="loginPassword"]');
    assert.equal(await page.$eval('#loginPassword', node => node.type), 'text');
    await page.click('[aria-controls="loginPassword"]');
    assert.equal(await page.$eval('#loginPassword', node => node.type), 'password');
    await page.setViewport({ width: 390, height: 844 });
    await noOverflow();
    await screenshot('login-mobile');
    await page.click('#register-tab');
    assert.equal(await page.$eval('#regPassword', node => node.autocomplete), 'new-password');
    await noOverflow();
    for (const width of [320, 820]) {
      await page.setViewport({ width, height: 900 });
      await noOverflow();
    }
    // Locale changes update the mounted page, including an in-progress form.
    await page.type('#regUsername', 'Home');
    await page.select('.language-select select', 'zh-HK');
    await page.waitForFunction(() => document.documentElement.lang === 'zh-HK');
    assert.equal(await page.$eval('#regUsername', node => node.value), 'Home');
    assert.equal(await page.$eval('#register-tab', node => node.textContent), '註冊');
    await noOverflow();
    await page.setViewport({ width: 390, height: 844 });
    await screenshot('login-zh-hk-mobile');
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('.language-select select', node => node.value), 'zh-HK');
    assert.equal(await page.title(), 'LiuLianBot - 登入');
    signedIn = true;
    await page.goto(`${base}/index.html`, { waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#eventTableCount', node => node.textContent), '2 個活動');
    assert.equal(await page.$eval('.table-title', node => node.textContent), 'Friday night ranked');
    await noOverflow();
    await screenshot('dashboard-zh-hk-mobile');
    await page.setViewport({ width: 1440, height: 1000 });
    await screenshot('dashboard-zh-hk-desktop');
    await page.select('.language-select select', 'en');
    await page.waitForFunction(() => document.querySelector('#eventTableCount').textContent === '2 events');
    assert.deepEqual(errors, [], 'browser must have no JavaScript or CSP errors');
    console.log('Website browser smoke passed: desktop/mobile layouts, filters, navigation, API recovery, guest state, login controls, zh-HK persistence/form preservation and production CSP.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
