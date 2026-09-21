import { lazy, Suspense, useCallback, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { NavBar } from './components/NavBar.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { TermsPage } from './pages/TermsPage.jsx';

// Small screens that every visitor may need stay in the main bundle. The heavy
// authenticated screens (admin, remote desktop, Chromium, file browser) are
// code-split so the login and public share pages do not download them.
export const PAGE_LOADERS = Object.freeze({
  dashboard: () => import('./pages/DashboardPage.jsx').then(module => ({ default: module.DashboardPage })),
  account: () => import('./pages/AccountPage.jsx').then(module => ({ default: module.AccountPage })),
  roller: () => import('./pages/RollerPage.jsx').then(module => ({ default: module.RollerPage })),
  events: () => import('./pages/EventsPage.jsx').then(module => ({ default: module.EventsPage })),
  'guild-manager': () => import('./pages/GuildManagerPage.jsx').then(module => ({ default: module.GuildManagerPage })),
  admin: () => import('./pages/AdminPage.jsx').then(module => ({ default: module.AdminPage })),
  remote: () => import('./pages/RemotePage.jsx').then(module => ({ default: module.RemotePage })),
  chromium: () => import('./pages/ChromiumPage.jsx').then(module => ({ default: module.ChromiumPage })),
  'vless-tunnel': () => import('./pages/VlessTunnelPage.jsx').then(module => ({ default: module.VlessTunnelPage })),
  files: () => import('./pages/FilesPage.jsx').then(module => ({ default: module.FilesPage })),
  share: () => import('./pages/SharePage.jsx').then(module => ({ default: module.SharePage })),
});

export const STATIC_PAGE_COMPONENTS = Object.freeze({
  login: LoginPage,
  terms: TermsPage,
});

export const PAGE_COMPONENTS = Object.freeze({
  ...STATIC_PAGE_COMPONENTS,
  ...Object.fromEntries(
    Object.entries(PAGE_LOADERS).map(([page, load]) => [page, lazy(load)]),
  ),
});

// Pages that keep the shared navigation. Login, terms, the public share page and
// the 404 page are standalone screens, matching the previous markup.
export const PAGES_WITH_NAV = new Set([
  'dashboard',
  'account',
  'roller',
  'events',
  'guild-manager',
  'admin',
  'remote',
  'chromium',
  'vless-tunnel',
  'files',
]);

// Shown in the app frame's top bar, mirroring the sidebar entry that is open.
export const PAGE_TITLES = Object.freeze({
  dashboard: 'Workspace',
  account: 'Account settings',
  roller: 'R6 Roller',
  events: 'R6 Events',
  'guild-manager': 'Discord servers',
  admin: 'Admin panel',
  remote: 'Remote workspace',
  chromium: 'Chromium',
  'vless-tunnel': 'VLESS Tunnel',
  files: 'Files & folders',
});

function PageFallback() {
  return (
    <p className="page-loading" role="status">
      Loading…
    </p>
  );
}

export function App({ page = globalThis.document?.body?.dataset.page } = {}) {
  const Page = PAGE_COMPONENTS[page] || NotFoundPage;
  const withNav = PAGES_WITH_NAV.has(page);

  // `navOpen` drives the drawer on narrow screens, `navCollapsed` the icon rail
  // that the sidebar toggle switches to on wide screens.
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const toggleCollapsed = useCallback(() => setNavCollapsed(value => !value), []);

  const content = (
    <Suspense fallback={<PageFallback />}>
      <Page />
    </Suspense>
  );

  if (!withNav) {
    return <ErrorBoundary>{content}</ErrorBoundary>;
  }

  return (
    <ErrorBoundary>
      <div
        className="app-shell"
        data-nav-open={navOpen ? 'true' : 'false'}
        data-nav-collapsed={navCollapsed ? 'true' : 'false'}
      >
        <NavBar
          collapsed={navCollapsed}
          onNavigate={closeNav}
          onToggleCollapse={toggleCollapsed}
        />

        {navOpen && (
          <button
            className="nav-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={closeNav}
          />
        )}

        <div className="app-main">
          <header className="topbar">
            <button
              className="topbar-toggle"
              type="button"
              aria-expanded={navOpen}
              aria-controls="siteNav"
              onClick={() => setNavOpen(open => !open)}
            >
              <span className="topbar-toggle-icon" aria-hidden="true">☰</span>
              <span className="sr-only">Toggle navigation</span>
            </button>
            <p className="topbar-title">{PAGE_TITLES[page] || 'LiuLianBot'}</p>
          </header>

          {content}
        </div>
      </div>
    </ErrorBoundary>
  );
}
