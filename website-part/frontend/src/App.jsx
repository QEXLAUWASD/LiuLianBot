import { useCallback, useState } from 'react';
import { NavBar } from './components/NavBar.jsx';
import { AccountPage } from './pages/AccountPage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { ChromiumPage } from './pages/ChromiumPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { EventsPage } from './pages/EventsPage.jsx';
import { FilesPage } from './pages/FilesPage.jsx';
import { GuildManagerPage } from './pages/GuildManagerPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { RemotePage } from './pages/RemotePage.jsx';
import { RollerPage } from './pages/RollerPage.jsx';
import { SharePage } from './pages/SharePage.jsx';
import { TermsPage } from './pages/TermsPage.jsx';
import { VlessTunnelPage } from './pages/VlessTunnelPage.jsx';

export const PAGE_COMPONENTS = {
  login: LoginPage,
  dashboard: DashboardPage,
  account: AccountPage,
  roller: RollerPage,
  events: EventsPage,
  'guild-manager': GuildManagerPage,
  admin: AdminPage,
  remote: RemotePage,
  chromium: ChromiumPage,
  'vless-tunnel': VlessTunnelPage,
  files: FilesPage,
  share: SharePage,
  terms: TermsPage,
};

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

export function App({ page = globalThis.document?.body?.dataset.page } = {}) {
  const Page = PAGE_COMPONENTS[page] || NotFoundPage;
  const withNav = PAGES_WITH_NAV.has(page);

  // `navOpen` drives the drawer on narrow screens, `navCollapsed` the icon rail
  // that the sidebar toggle switches to on wide screens.
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const toggleCollapsed = useCallback(() => setNavCollapsed(value => !value), []);

  if (!withNav) {
    return <Page />;
  }

  return (
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

        <Page />
      </div>
    </div>
  );
}
