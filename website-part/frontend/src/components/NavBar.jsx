import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { logout } from '../lib/authStore.mjs';
import { useAuth } from '../hooks/useAuth.mjs';
import { usePageVisibility } from '../hooks/usePageVisibility.mjs';

export const GUEST_PAGE_FALLBACK = Object.freeze({
  roller: true,
  events: false,
  account: false,
  remote: false,
  chromium: false,
  'vless-tunnel': false,
});

export const USER_PAGE_FALLBACK = Object.freeze({
  roller: true,
  events: true,
  account: true,
  remote: true,
  chromium: true,
  'vless-tunnel': true,
});

export const NAV_LINKS = Object.freeze([
  { href: '/index.html', label: 'Home' },
  { href: '/roller.html', label: 'R6 Roller', pageKey: 'roller' },
  { href: '/events.html', label: 'Events', pageKey: 'events' },
  { href: '/files.html', label: 'Files', signedInOnly: true },
  { href: '/account.html', label: 'Account', pageKey: 'account' },
]);

// Workspace screens live behind one menu so the top bar keeps a comfortable
// width on laptops while every entry stays one click away.
export const WORKSPACE_LINKS = Object.freeze([
  { href: '/remote.html', label: 'Remote desktop & SSH', pageKey: 'remote', signedInOnly: true },
  { href: '/chromium.html', label: 'Chromium browser', pageKey: 'chromium', signedInOnly: true },
  { href: '/vless-tunnel.html', label: 'VLESS tunnel', pageKey: 'vless-tunnel', signedInOnly: true },
]);

export const MANAGE_LINKS = Object.freeze([
  { href: '/guild-manager.html', label: 'Discord servers', signedInOnly: true },
  { href: '/admin.html', label: 'Admin panel', adminOnly: true },
]);

function isActiveLink(pathname, href) {
  return pathname === href || (href === '/index.html' && pathname === '/');
}

export function NavBar({ pathname = globalThis.location?.pathname || '' }) {
  const { status, user, error } = useAuth();
  const pages = usePageVisibility();
  const signedIn = status === 'signed-in';
  const visibility = pages || (signedIn ? USER_PAGE_FALLBACK : GUEST_PAGE_FALLBACK);
  const isAdmin = signedIn && user?.role === 'admin';

  const [logoutState, setLogoutState] = useState({ busy: false, message: '', error: false });
  // Only one menu is open at a time; the mobile drawer is tracked separately.
  const [openMenu, setOpenMenu] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [connections, setConnections] = useState({ status: 'idle', items: [] });
  const navRef = useRef(null);
  const toggleRef = useRef(null);
  const dropdownOpen = openMenu === 'websites';

  const onLogout = useCallback(async () => {
    setLogoutState({ busy: true, message: '', error: false });
    try {
      await logout();
    } catch (error) {
      setLogoutState({ busy: false, message: error.message || 'Logout failed', error: true });
    }
  }, []);

  useEffect(() => {
    if (!openMenu && !menuOpen) return undefined;
    const onDocumentClick = event => {
      if (!navRef.current?.contains(event.target)) setOpenMenu('');
    };
    const onKeyDown = event => {
      if (event.key !== 'Escape') return;
      setOpenMenu('');
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu, menuOpen]);

  const toggleMenuSection = key => setOpenMenu(current => (current === key ? '' : key));

  const toggleWebsites = () => {
    const next = dropdownOpen ? '' : 'websites';
    setOpenMenu(next);
    if (next !== 'websites' || connections.status !== 'idle') return;
    setConnections({ status: 'loading', items: [] });
    requestJSON('/api/connections')
      .then(data => setConnections({ status: 'ready', items: data?.connections || [] }))
      .catch(() => setConnections({ status: 'error', items: [] }));
  };

  const linkVisible = link => {
    if (link.pageKey && visibility[link.pageKey] !== true) return false;
    if (link.signedInOnly && !signedIn) return false;
    return true;
  };

  const isHiddenLink = link => link.pageKey === 'remote' && user?.remoteAvailable === false;

  const renderLink = (link, { role } = {}) => {
    const active = isActiveLink(pathname, link.href);
    return (
      <a
        key={link.href}
        className={`nav-link${role ? ' nav-menu-link' : ''}${active ? ' active' : ''}`}
        href={link.href}
        hidden={isHiddenLink(link)}
        role={role}
        {...(link.pageKey ? { 'data-page-key': link.pageKey } : {})}
        {...(active ? { 'aria-current': 'page' } : {})}
      >
        <span>{link.label}</span>
        {role === 'menuitem' && <span className="nav-dropdown-open" aria-hidden="true">↗</span>}
      </a>
    );
  };

  const workspaceLinks = WORKSPACE_LINKS.filter(linkVisible);
  const manageLinks = MANAGE_LINKS.filter(link => {
    if (link.adminOnly) return isAdmin;
    return linkVisible(link);
  });

  return (
    <nav id="siteNav" className="navbar" aria-label="Primary">
      <a className="skip-link" href="#main-content">Skip to content</a>

      <div className="navbar-inner">
        <a className="nav-brand" href="/index.html">
          <span className="nav-brand-mark" aria-hidden="true">🎮</span>
          <span className="nav-brand-text">
            <strong>LiuLianBot</strong>
            <span className="nav-brand-sub">Home server console</span>
          </span>
        </a>

        <button
          className="nav-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="siteNavLinks"
          onClick={() => setMenuOpen(open => !open)}
        >
          <span className="nav-toggle-icon" aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          <span>Menu</span>
        </button>

        <div className="nav-links" id="siteNavLinks" data-open={menuOpen ? 'true' : 'false'} ref={navRef}>
          {NAV_LINKS.filter(linkVisible).map(link => renderLink(link))}

          {workspaceLinks.length > 0 && (
            <div className="nav-dropdown">
              <button
                className="nav-link nav-menu-toggle"
                type="button"
                aria-expanded={openMenu === 'workspaces'}
                aria-controls="workspaceMenu"
                onClick={() => toggleMenuSection('workspaces')}
              >
                <span>Workspaces</span>
                <span className="dropdown-chevron" aria-hidden="true">▾</span>
              </button>
              <div className="nav-dropdown-menu" id="workspaceMenu" role="menu" hidden={openMenu !== 'workspaces'}>
                {workspaceLinks.map(link => renderLink(link, { role: 'menuitem' }))}
              </div>
            </div>
          )}

          {signedIn && (
            <div className="nav-dropdown" id="websiteDropdown">
              <button
                ref={toggleRef}
                className="nav-link nav-dropdown-toggle"
                type="button"
                aria-expanded={dropdownOpen}
                aria-controls="websiteDropdownMenu"
                onClick={toggleWebsites}
              >
                <span>Websites</span>
                <span className="dropdown-chevron" aria-hidden="true">▾</span>
              </button>
              <div
                className="nav-dropdown-menu"
                id="websiteDropdownMenu"
                role="menu"
                hidden={!dropdownOpen}
              >
                {connections.status === 'ready' && connections.items.length === 0 && (
                  <div className="nav-dropdown-status">No websites available</div>
                )}
                {connections.status === 'error' && (
                  <div className="nav-dropdown-status nav-dropdown-error">Unable to load websites</div>
                )}
                {connections.status !== 'ready' && connections.status !== 'error' && (
                  <div className="nav-dropdown-status">Loading...</div>
                )}
                {connections.status === 'ready' && connections.items.map(connection => (
                  <a
                    key={connection.slug}
                    href={`/connect/${encodeURIComponent(connection.slug)}/`}
                    role="menuitem"
                    target="_blank"
                    rel="noopener"
                  >
                    <span>{connection.name}</span>
                    <span className="nav-dropdown-open" aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {manageLinks.length > 0 && (
            <div className="nav-dropdown">
              <button
                className="nav-link nav-menu-toggle"
                type="button"
                aria-expanded={openMenu === 'manage'}
                aria-controls="manageMenu"
                onClick={() => toggleMenuSection('manage')}
              >
                <span>Manage</span>
                <span className="dropdown-chevron" aria-hidden="true">▾</span>
              </button>
              <div className="nav-dropdown-menu" id="manageMenu" role="menu" hidden={openMenu !== 'manage'}>
                {manageLinks.map(link => renderLink(link, { role: 'menuitem' }))}
              </div>
            </div>
          )}
        </div>

        <div className="nav-user" id="navUser">
          {signedIn && (
            <a
              className="nav-username"
              id="navUsername"
              href="/account.html"
              title="Account settings"
            >
              {`👤 ${user.username}`}
            </a>
          )}
          {status === 'signed-out' && (
            <a className="btn btn-sm btn-primary" href="/login.html">Login</a>
          )}
          {signedIn && (
            <button
              className="btn btn-sm btn-outline"
              id="logoutBtn"
              type="button"
              data-logout=""
              disabled={logoutState.busy}
              aria-busy={logoutState.busy}
              onClick={onLogout}
            >
              Logout
            </button>
          )}
          <span
            className={`nav-auth-status${logoutState.error || status === 'error' ? ' status-error' : ''}`}
            id="logoutStatus"
            role="status"
            aria-live="polite"
            title={status === 'error' ? error?.message : undefined}
          >
            {status === 'loading' ? 'Loading account...' : ''}
            {status === 'error' ? 'Unable to load account' : ''}
            {logoutState.message}
          </span>
        </div>
      </div>
    </nav>
  );
}
