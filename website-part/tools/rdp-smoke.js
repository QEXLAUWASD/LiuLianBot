// Browser smoke test using a local mock RDP transport; never connects to a remote host.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer-core');

async function main() {
  const executablePath = process.env.RDP_BROWSER_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ].find(value => fs.existsSync(value));
  if (!executablePath) throw new Error('Set RDP_BROWSER_PATH to a Chromium browser executable');
  const app = express();
  app.get('/api/auth/me', (req, res) => res.json({ loggedIn: true, user: { username: 'RDP test', role: 'admin' } }));

  // Exercise the real encrypted profile router with an in-memory test repository.
  process.env.REMOTE_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  const profiles = new Map();
  const repo = {
    list: async user => [...profiles.values()].filter(p => p.user === user).map(({id,name}) => ({id,name})),
    get: async (user,id) => profiles.get(id)?.user === user ? profiles.get(id) : null,
    create: async (user,id,name,encrypted_data) => profiles.set(id,{user,id,name,encrypted_data}),
    update: async (user,id,name,encrypted_data) => {
      if (profiles.get(id)?.user !== user) return false;
      profiles.set(id,{user,id,name,encrypted_data}); return true;
    },
    remove: async (user,id) => profiles.get(id)?.user === user && profiles.delete(id),
  };
  app.use(express.json());
  app.use('/api/rdp/profiles', (req,res,next) => { req.session = {user:{id:'smoke-user'}}; next(); },
    require('../src/routes/rdp_profiles').createRouter(repo));

  app.get('/api/remote-profile', (req, res) => res.json({ features: { rdp: true, ssh: false }, profile: null, serverStorageAvailable: false }));
  app.get('/api/page-visibility', (req, res) => res.json({ pages: { remote: true } }));
  app.get('/api/connections', (req, res) => res.json({ connections: [] }));
  app.use(express.static(path.join(__dirname, '../public')));
  const server = app.listen(0, '127.0.0.1');
  const io = new Server(server);
  const inputs = [];
  let active;
  let attempts = 0;
  io.on('connection', socket => {
    active = socket;
    socket.on('infos', infos => {
      attempts++;
      assert.equal(infos.password, 'test-only');
      if (infos.host === 'fail.example') {
        socket.emit('rdp-error', { message: 'Test connection refused' });
        socket.disconnect(true);
        return;
      }
      socket.emit('rdp-connect');
      // A red 24-bit compressed literal pixel, from the real browser RLE decoder.
      socket.emit('rdp-bitmap', {
        width: 1, height: 1, destLeft: 0, destTop: 0, destRight: 0, destBottom: 0,
        bitsPerPixel: 24, isCompress: true, data: Buffer.from([0x81, 0, 0, 255]),
      });
    });
    for (const event of ['mouse', 'scancode', 'wheel']) socket.on(event, (...args) => inputs.push([event, ...args]));
  });
  let browser;
  try {
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto('http://127.0.0.1:' + server.address().port + '/remote.html', { waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#rdpConnect', element => element.disabled), false);
    const fill = async (selector, value) => page.$eval(selector, (element, value) => { element.value = value; }, value);
    const connect = async host => {
      await fill('#rdpHost', host);
      await fill('#rdpUsername', 'test-user');
      await fill('#rdpPassword', 'test-only');
      await page.click('#rdpConnect');
    };

    await page.waitForFunction(() => !document.querySelector('#saveRdp').disabled);
    await fill('#rdpProfileName', 'Home desktop');
    await fill('#rdpHost', 'desktop.example');
    await fill('#rdpUsername', 'test-user');
    await fill('#rdpPassword', 'test-only');
    await page.click('#saveRdp');
    await page.waitForFunction(() => document.querySelector('#rdpProfileList').options.length === 2 && !document.querySelector('#saveRdp').disabled);
    const homeId = await page.$eval('#rdpProfileList', element => element.value);
    await page.click('#newRdp');
    assert.equal(await page.$eval('#rdpPassword', element => element.value), '');
    await fill('#rdpProfileName', 'Office desktop');
    await fill('#rdpHost', 'office.example');
    await fill('#rdpUsername', 'test-user');
    await fill('#rdpPassword', 'office-secret');
    await page.click('#saveRdp');
    await page.waitForFunction(() => document.querySelector('#rdpProfileList').options.length === 3 && !document.querySelector('#saveRdp').disabled);
    const officeId = await page.$eval('#rdpProfileList', element => element.value);
    await page.select('#rdpProfileList', homeId);
    await page.waitForFunction(() => document.querySelector('#rdpPassword').value === 'test-only');
    await fill('#rdpProfileName', 'Home renamed');
    await fill('#rdpPassword', '');
    await page.click('#saveRdp');
    await page.waitForFunction(() => document.querySelector('#rdpProfileList').selectedOptions[0].textContent === 'Home renamed' && !document.querySelector('#loadRdp').disabled);
    await page.click('#loadRdp');
    await page.waitForFunction(() => document.querySelector('#rdpPassword').value === 'test-only');
    await page.select('#rdpProfileList', officeId);
    await page.waitForFunction(() => document.querySelector('#rdpPassword').value === 'office-secret');
    await page.click('#deleteServerProfile');
    await page.waitForFunction(() => document.querySelector('#rdpProfileList').options.length === 2 && !document.querySelector('#rdpProfileList').disabled);
    assert.equal(profiles.size, 1);
    assert.ok(![...profiles.values()][0].encrypted_data.includes('test-only'));
    await page.select('#rdpProfileList', homeId);
    await page.waitForFunction(() => document.querySelector('#rdpPassword').value === 'test-only');
    // Connect using the restored password rather than typing it again.
    await page.click('#rdpConnect');

    await page.waitForFunction(() => document.querySelector('#rdpStatusBadge').dataset.state === 'connected');
    await page.waitForFunction(() => document.querySelector('#rdpCanvas').getContext('2d').getImageData(0, 0, 1, 1).data[0] === 255);
    assert.deepEqual(await page.$eval('#rdpCanvas', canvas => [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data]), [255, 0, 0, 255]);
    assert.equal(await page.$eval('#rdpPassword', element => element.value), '');
    await page.click('#rdpCanvas');
    await page.keyboard.press('ArrowLeft');
    await page.waitForNetworkIdle();
    assert.ok(inputs.some(([event, code, pressed]) => event === 'scancode' && code === 0xe04b && pressed));
    const keyCount = inputs.filter(([name]) => name === 'scancode').length;
    await page.click('#rdpUsername');
    await page.keyboard.type('outside');
    await page.waitForNetworkIdle();
    assert.equal(inputs.filter(([name]) => name === 'scancode').length, keyCount);

    await page.setViewport({ width: 900, height: 800 });
    await page.$eval('#rdpCanvas', element => element.scrollIntoView({ block: 'center' }));
    const box = await page.$eval('#rdpCanvas', canvas => {
      const r = canvas.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, pixels: canvas.width };
    });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForNetworkIdle();
    const click = inputs.filter(([name, , , button, pressed]) => name === 'mouse' && button === 1 && pressed).at(-1);
    assert.ok(Math.abs(click[1] - box.pixels / 2) <= 2);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (process.env.RDP_SCREENSHOT_PATH) await page.screenshot({ path: process.env.RDP_SCREENSHOT_PATH, fullPage: true });

    await page.$eval('#rdpDisconnect', element => element.scrollIntoView({ block: 'center' }));
    await page.click('#rdpDisconnect');
    await page.waitForFunction(() => document.querySelector('#rdpStatusBadge').dataset.state === 'idle');
    assert.equal(await page.$eval('#rdpConnect', element => element.disabled), false);
    await connect('fail.example');
    await page.waitForFunction(() => document.querySelector('#rdpStatusBadge').dataset.state === 'error');
    assert.equal(await page.$eval('#rdpConnect', element => element.disabled), false);
    await connect('desktop.example');
    await page.waitForFunction(() => document.querySelector('#rdpStatusBadge').dataset.state === 'connected');
    active.disconnect(true);
    await page.waitForFunction(() => document.querySelector('#rdpStatusBadge').dataset.state === 'closed');
    assert.equal(await page.$eval('#rdpDisconnect', element => element.disabled), true);
    assert.equal(attempts, 3);
    assert.deepEqual(errors, []);
    console.log('RDP browser smoke passed: named encrypted profile CRUD and restored password login, real RLE render, focused keyboard, scaled mouse, password clearing, cancel/error/reconnect/disconnect.');
  } finally {
    await browser?.close();
    await new Promise(resolve => io.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
