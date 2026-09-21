import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { htmlHeadPlugin } from './vite-plugins/html-head.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, 'frontend');
const pageNames = [
  'index',
  'login',
  'account',
  'roller',
  'events',
  'guild-manager',
  'admin',
  'remote',
  'chromium',
  'vless-tunnel',
  'files',
  'share',
  'terms',
  '404',
];

// The website is a multi page React app: every HTML entry keeps the URL the
// Express routes already guard (`/login.html`, `/admin.html`, ...), while all
// of them mount the same React bundle through `src/main.jsx`.
export default defineConfig({
  root: frontend,
  publicDir: resolve(frontend, 'static'),
  plugins: [react(), htmlHeadPlugin()],
  build: {
    outDir: resolve(here, 'public'),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        pageNames.map(name => [name, resolve(frontend, `${name}.html`)]),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.WEBSITE_DEV_PROXY || 'http://127.0.0.1:3000',
        changeOrigin: false,
        ws: true,
      },
      '/connect': {
        target: process.env.WEBSITE_DEV_PROXY || 'http://127.0.0.1:3000',
        changeOrigin: false,
        ws: true,
      },
    },
  },
});
