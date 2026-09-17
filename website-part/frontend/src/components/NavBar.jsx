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
  { href: '/remote.html', label: 'Remote', pageKey: 'remote', signedInOnly: true },
  { href: '/chromium.html', label: 'Chromium', pageKey: 'chromium', signedInOnly: true },
  { href: '/vless-tunnel.html', label: 'VLESS Tunnel', pageKey: 'vless-tunnel', signedInOnly: true },
  { href: '/account.html', label: 'Account', pageKey: 'account' },
  { href: '/guild-manager.html', label: 'Discord Manager', signedInOnly: true },
]);

function isActiveLink(pathname, href) {
  return pathname === href || (href === '/index.html' && pathname === '/');
}

export function NavBar({ pathname = globalThis.location?.pathname || '' }) {
  const { status, user, error } = useAuth();
  const pages = usePageVisibility();
  const signedIn = status === 'signed-in';
  const visibility = pages || (signedIn ? USER_PAGE_FALLBACK : GUEST_PAGE_FALLBACK);

  const [logoutState, setLogoutState] = useState({ busy: false, message: '', error: false });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [connections, setConnections] = useState({ status: 'idle', items: [] });
  const dropdownRef = useRef(null);
  const toggleRef = useRef(null);

  const onLogout = useCallback(async () => {
    setLogoutState({ busy: true, message: '', error: false });
    try {
      await logout();
    } catch (error) {
      setLogoutState({ busy: false, message: error.message || 'Logout failed', error: true });
    }
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const onDocumentClick = event => {
      if (!dropdownRef.current?.contains(event.target)) setDropdownOpen(false);
    };
    const onKeyDown = event => {
      if (event.key !== 'Escape') return;
      setDropdownOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dropdownOpen]);

  const toggleDropdown = () => {
    const next = !dropdownOpen;
    setDropdownOpen(next);
    if (!next || connections.status !== 'idle') return;
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

  return (
    <nav id="siteNav" className="navbar" aria-label="Primary">
      <div className="nav-brand">🎮 LiuLianBot</div>
      <div className="nav-links">
        {NAV_LINKS.filter(link => linkVisible(link)).map(link => {
          const active = isActiveLink(pathname, link.href);
          const hidden = link.pageKey === 'remote' && user?.remoteAvailable === false;
          return (
            <a
              key={link.href}
              className={`nav-link${active ? ' active' : ''}`}
              href={link.href}
              hidden={hidden}
              {...(link.pageKey ? { 'data-page-key': link.pageKey } : {})}
              {...(active ? { 'aria-current': 'page' } : {})}
            >
              {link.label}
            </a>
          );
        })}

        {signedIn && (
          <div className="nav-dropdown" id="websiteDropdown" ref={dropdownRef}>
            <button
              ref={toggleRef}
              className="nav-link nav-dropdown-toggle"
              type="button"
              aria-expanded={dropdownOpen}
              aria-controls="websiteDropdownMenu"
              onClick={toggleDropdown}
            >
              <span>Connected websites</span>
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

        {status === 'signed-in' && user?.role === 'admin' && (
          <a className="nav-link admin-only" data-admin-only="" href="/admin.html">Admin</a>
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
    </nav>
  );
}
