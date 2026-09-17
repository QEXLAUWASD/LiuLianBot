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

export function App({ page = globalThis.document?.body?.dataset.page } = {}) {
  const Page = PAGE_COMPONENTS[page] || NotFoundPage;

  return (
    <>
      {PAGES_WITH_NAV.has(page) && <NavBar />}
      <Page />
    </>
  );
}
