'use strict';

const { Application } = require('@webviewjs/webview');

const DEFAULT_URL = 'https://www.google.com/';
const WINDOW_TITLE = 'LiuLianBot Chromium';

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('請輸入網址。');

  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw new Error('網址格式不正確，請使用 http:// 或 https://。');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('只支援 http:// 或 https:// 網址。');
  }
  return url.toString();
}

function parseChromiumArguments(args = process.argv.slice(2), env = process.env) {
  let url = env.CHROMIUM_URL || DEFAULT_URL;
  let enableDevtools = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      return { help: true, url, enableDevtools };
    }
    if (argument === '--devtools') {
      enableDevtools = true;
      continue;
    }
    if (argument === '--url') {
      url = args[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith('--url=')) {
      url = argument.slice('--url='.length);
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`不支援的參數：${argument}`);
    }
    url = argument;
  }

  return { help: false, url: normalizeUrl(url), enableDevtools };
}

function printUsage(output = process.stdout) {
  output.write([
    '用法：npm run chromium -- [網址] [--devtools]',
    '',
    '選項：',
    '  --url <網址>     指定初始網址。',
    '  --devtools       開啟 WebView 開發者工具。',
    '  --help           顯示這段說明。',
    '',
    '也可以使用 CHROMIUM_URL 環境變數指定初始網址。',
    '',
  ].join('\n'));
}

async function launchChromium({ initialUrl = DEFAULT_URL, enableDevtools = false, ApplicationClass = Application } = {}) {
  const url = normalizeUrl(initialUrl);
  const app = new ApplicationClass();
  let mainWindow;
  let mainWebview;

  app.on('application-close-requested', () => {
    app.exit();
  });

  await app.whenReady();
  mainWindow = app.createBrowserWindow({
    title: WINDOW_TITLE,
    width: 1440,
    height: 900,
  });
  mainWebview = mainWindow.createWebview({
    url,
    enableDevtools,
    navigationHandler: target => {
      try {
        return ['http:', 'https:'].includes(new URL(target).protocol);
      } catch (_) {
        return false;
      }
    },
  });

  mainWebview.on('title-changed', ({ title }) => {
    mainWindow.setTitle(title || WINDOW_TITLE);
  });

  return { app, window: mainWindow, webview: mainWebview };
}

if (require.main === module) {
  try {
    const options = parseChromiumArguments();
    if (options.help) {
      printUsage();
    } else {
      launchChromium(options).catch(error => {
        console.error(`無法啟動 Chromium WebView：${error.message}`);
        process.exitCode = 1;
      });
    }
  } catch (error) {
    console.error(error.message);
    printUsage(process.stderr);
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_URL, normalizeUrl, parseChromiumArguments, launchChromium };
