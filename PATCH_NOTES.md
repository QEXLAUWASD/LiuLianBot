# Patch notes

## Since `d921fe3ab06e76f7940726d55994ace22afe53aa`

- Rewrote the website frontend as a React application built with Vite.
- Kept every guarded page URL (`/login.html`, `/roller.html`, `/admin.html`, ...)
  and the Express authorization, session, and page-visibility behaviour unchanged.
- Replaced the vanilla browser modules with React pages, shared components
  (navigation, tabs, modal, toasts), and hooks (auth, page visibility, busy state).
- Retained the framework-independent browser libraries: API client, auth store,
  focus-trapping dialog controller, Chromium screencast session, and the RDP
  client/input/bitmap modules.
- Moved CSS, icons, manifest, and vendored Socket.IO/RDP decoder assets to the Vite
  public directory; the build output is committed under `website-part/public`.
- Ported the frontend test suite to React component tests running on `node:test`
  with jsdom, plus an esbuild JSX loader for `.jsx` sources and JSX test files.
- Added a CI guard that rebuilds the bundle and fails when `website-part/public` is
  stale.

## Since `396b4947a6c58ed6f4f069ec7771af6c4c9525ae`

- Hardened session signing by removing the predictable fallback secret.
- Added fail-closed SSH/RDP host allowlists and DNS/IP destination checks.
- Restricted server-side Chromium navigation, restored Chromium sandboxing, and enforced Chromium page visibility authorization.
- Prevented Terms open redirects and preserved upstream CSP headers.
- Restricted updater repository input and required verified Git commits.
- Added deployment documentation for security-sensitive environment settings.

## Follow-up compatibility fix

- Restored the documented empty allowlist behavior for public SSH/RDP hosts while retaining DNS-resolved private-network blocking.
