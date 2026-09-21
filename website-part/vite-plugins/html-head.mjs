// Injects the shared <head> metadata (icons, PWA manifest, social preview,
// robots policy) into every page so the 14 HTML entry points stay minimal and
// cannot drift apart.
const PRIVATE_PAGES = new Set([
  'index',
  'account',
  'events',
  'guild-manager',
  'admin',
  'remote',
  'chromium',
  'vless-tunnel',
  'files',
  '404',
]);

const PUBLIC_PAGES = Object.freeze({
  login: {
    description:
      'Sign in to LiuLianBot to roll Rainbow Six Siege picks, plan events, browse FnOS files and open remote sessions.',
  },
  roller: {
    description:
      'Randomly roll Rainbow Six Siege operators and maps for your next match, shared with the LiuLianBot Discord bot.',
  },
  share: {
    description: 'LiuLianBot 檔案分享：輸入分享碼即可瀏覽與下載，無需登入。',
    locale: 'zh_Hant',
  },
  terms: {
    description: 'LiuLianBot 服務條款與資料儲存說明。',
    locale: 'zh_Hant',
  },
});

const TITLE_PATTERN = /<title>([^<]*)<\/title>/i;

function pageName(filename) {
  return String(filename).split(/[\\/]/).pop().replace(/\.html$/i, '');
}

function buildTags(page, title) {
  const tags = [];
  const add = (tag, attrs) => tags.push({ tag, attrs, injectTo: 'head' });

  add('meta', { name: 'theme-color', content: '#1c6ba0' });
  add('link', { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/img/icon-192.png' });
  add('link', { rel: 'apple-touch-icon', href: '/img/apple-touch-icon.png' });
  add('link', { rel: 'manifest', href: '/manifest.webmanifest' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'LiuLianBot' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });

  if (PRIVATE_PAGES.has(page)) {
    add('meta', { name: 'robots', content: 'noindex, nofollow' });
  }

  const meta = PUBLIC_PAGES[page];
  if (meta) {
    add('meta', { name: 'description', content: meta.description });
    add('meta', { property: 'og:type', content: 'website' });
    add('meta', { property: 'og:site_name', content: 'LiuLianBot' });
    add('meta', { property: 'og:title', content: title });
    add('meta', { property: 'og:description', content: meta.description });
    add('meta', { property: 'og:image', content: '/img/icon-512.png' });
    if (meta.locale) add('meta', { property: 'og:locale', content: meta.locale });
    add('meta', { name: 'twitter:card', content: 'summary' });
    add('meta', { name: 'twitter:title', content: title });
    add('meta', { name: 'twitter:description', content: meta.description });
  }

  return tags;
}

function transformIndexHtml(html, ctx) {
  const page = pageName(ctx.filename);
  const title = (html.match(TITLE_PATTERN) || [])[1] || 'LiuLianBot';
  return { html, tags: buildTags(page, title) };
}

export function htmlHeadPlugin() {
  return {
    name: 'liulianbot-html-head',
    transformIndexHtml: {
      order: 'post',
      handler: transformIndexHtml,
    },
  };
}

export { buildTags, pageName, PRIVATE_PAGES, PUBLIC_PAGES };
