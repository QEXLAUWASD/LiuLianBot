import { t, useLocale } from '../lib/i18n.mjs';
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

// `icon` is rendered through CSS (`content: attr(data-icon)`) so the link text
// stays exactly the visible label for tests and assistive technology.
export const NAV_LINKS = Object.freeze([
  { href: '/index.html', label: 'Home', icon: '🏠' },
  { href: '/roller.html', label: 'R6 Roller', pageKey: 'roller', icon: '🎲' },
  { href: '/events.html', label: 'Events', pageKey: 'events', icon: '📅' },
  { href: '/files.html', label: 'Files', signedInOnly: true, icon: '🗂️' },
  { href: '/account.html', label: 'Account', pageKey: 'account', icon: '👤' },
]);

// The workspace and management screens live in collapsible sidebar sections so
// the frame stays short while every entry remains one click away.
export const WORKSPACE_LINKS = Object.freeze([
  { href: '/remote.html', label: 'Remote desktop & SSH', pageKey: 'remote', signedInOnly: true, icon: '🖥️' },
  { href: '/chromium.html', label: 'Chromium browser', pageKey: 'chromium', signedInOnly: true, icon: '🌐' },
  { href: '/vless-tunnel.html', label: 'VLESS tunnel', pageKey: 'vless-tunnel', signedInOnly: true, icon: '🔐' },
]);

export const MANAGE_LINKS = Object.freeze([
  { href: '/guild-manager.html', label: 'Discord servers', signedInOnly: true, icon: '💬' },
  { href: '/admin.html', label: 'Admin panel', adminOnly: true, icon: '⚙️' },
]);

function isActiveLink(pathname, href) {
  return pathname === href || (href === '/index.html' && pathname === '/');
}

function isVisibleControl(node) {
  if (node.closest('[hidden], [inert]')) return false;
  for (let current = node; current; current = current.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return true;
}

export function NavBar({
  pathname = globalThis.location?.pathname || '',
  collapsed = false,
  mobileOpen = false,
  onNavigate,
  onToggleCollapse,
} = {}) {
  useLocale();
  const { status, user, error } = useAuth();
  const pages = usePageVisibility();
  const signedIn = status === 'signed-in';
  const visibility = pages || (signedIn ? USER_PAGE_FALLBACK : GUEST_PAGE_FALLBACK);
  const isAdmin = signedIn && user?.role === 'admin';

  const [logoutState, setLogoutState] = useState({ busy: false, message: '', error: false });
  // Only one sidebar section is open at a time.
  const [openMenu, setOpenMenu] = useState('');
  const [connections, setConnections] = useState({ status: 'idle', items: [] });
  const navElementRef = useRef(null);
  const menuToggles = useRef({});
  const pendingMenuFocus = useRef(null);
  const [mobileDrawerHidden, setMobileDrawerHidden] = useState(false);
  const dropdownOpen = openMenu === 'websites';

  // A translated-off-canvas drawer must not remain in the keyboard order. The
  // desktop sidebar stays interactive, so the state is driven by the media
  // query instead of blindly mirroring `mobileOpen`.
  useEffect(() => {
    const nav = navElementRef.current;
    const media = globalThis.matchMedia?.('(max-width: 1080px)');
    if (!nav || !media) return undefined;

    const update = () => {
      const hidden = media.matches && !mobileOpen;
      nav.inert = hidden;
      setMobileDrawerHidden(hidden);
    };
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const trapFocus = event => {
      if (!mobileOpen || !media.matches || event.key !== 'Tab') return;
      const focusable = [...nav.querySelectorAll(focusableSelector)].filter(isVisibleControl);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    update();
    let focusFrame;
    nav.addEventListener('keydown', trapFocus);
    if (mobileOpen && media.matches) {
      const focusFirst = () => nav.querySelector('.nav-brand, .nav-link')?.focus();
      if (typeof globalThis.requestAnimationFrame === 'function') focusFrame = globalThis.requestAnimationFrame(focusFirst);
      else focusFirst();
    }
    if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
    else media.addListener?.(update);
    return () => {
      if (focusFrame !== undefined) globalThis.cancelAnimationFrame?.(focusFrame);
      nav.removeEventListener('keydown', trapFocus);
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', update);
      else media.removeListener?.(update);
    };
  }, [mobileOpen]);

  const onLogout = useCallback(async () => {
    setLogoutState({ busy: true, message: '', error: false });
    try {
      await logout();
    } catch (error) {
      setLogoutState({ busy: false, message: error.message || 'Logout failed', error: true });
    }
  }, []);

  useEffect(() => {
    const edge = pendingMenuFocus.current;
    if (!edge || !openMenu) return;
    const toggle = menuToggles.current[openMenu];
    const menu = document.getElementById(toggle?.getAttribute('aria-controls'));
    if (document.activeElement !== toggle && !menu?.contains(document.activeElement)) {
      pendingMenuFocus.current = null;
      return;
    }
    const items = [...(menu?.querySelectorAll('[role="menuitem"]') || [])]
      .filter(isVisibleControl);
    if (!items.length) return;
    pendingMenuFocus.current = null;
    (edge === 'last' ? items.at(-1) : items[0]).focus();
  }, [openMenu, connections]);

  const toggleMenuSection = key => {
    pendingMenuFocus.current = null;
    setOpenMenu(current => (current === key ? '' : key));
  };

  const loadConnections = () => {
    if (!['idle', 'error'].includes(connections.status)) return;
    setConnections({ status: 'loading', items: [] });
    requestJSON('/api/connections')
      .then(data => setConnections({ status: 'ready', items: data?.connections || [] }))
      .catch(() => setConnections({ status: 'error', items: [] }));
  };

  const toggleWebsites = () => {
    toggleMenuSection('websites');
    if (!dropdownOpen) loadConnections();
  };

  const onNavKeyDown = event => {
    if (event.key === 'Escape' && openMenu) {
      event.preventDefault();
      event.stopPropagation();
      pendingMenuFocus.current = null;
      setOpenMenu('');
      menuToggles.current[openMenu]?.focus();
      return;
    }
    const toggleKey = Object.keys(menuToggles.current)
      .find(key => menuToggles.current[key] === event.target);
    if (toggleKey && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const edge = event.key === 'ArrowUp' ? 'last' : 'first';
      const menu = document.getElementById(event.target.getAttribute('aria-controls'));
      const items = [...menu.querySelectorAll('[role="menuitem"]')].filter(isVisibleControl);
      if (openMenu === toggleKey && items.length) {
        (edge === 'last' ? items.at(-1) : items[0]).focus();
      } else {
        pendingMenuFocus.current = edge;
        setOpenMenu(toggleKey);
      }
      if (toggleKey === 'websites') loadConnections();
      return;
    }
    const menu = event.target.closest('[role="menu"]');
    if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...menu.querySelectorAll('[role="menuitem"]')].filter(isVisibleControl);
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
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
        title={t(link.label)}
        {...(link.icon ? { 'data-icon': link.icon } : {})}
        {...(link.pageKey ? { 'data-page-key': link.pageKey } : {})}
        {...(active ? { 'aria-current': 'page' } : {})}
        onClick={onNavigate}
      >
        <span className="nav-label">{t(link.label)}</span>
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
    <nav
      ref={navElementRef}
      id="siteNav"
      className="navbar sidebar"
      aria-label={t("Primary navigation")}
      aria-hidden={mobileDrawerHidden ? 'true' : undefined}
      data-collapsed={collapsed ? 'true' : 'false'}
      onKeyDown={onNavKeyDown}
    >
      <a className="skip-link" href="#main-content">{t("Skip to content")}</a>

      <div className="sidebar-head">
        <a className="nav-brand" href="/index.html" onClick={onNavigate}>
          <span className="nav-brand-mark" aria-hidden="true">🎮</span>
          <span className="nav-brand-text">
            <strong>LiuLianBot</strong>
            <span className="nav-brand-sub">{t("Home server console")}</span>
          </span>
        </a>
      </div>

      <div className="nav-links" id="siteNavLinks">
        <p className="sidebar-section">{t("Main")}</p>
        {NAV_LINKS.filter(linkVisible).map(link => renderLink(link))}

        {workspaceLinks.length > 0 && (
          <div className="nav-dropdown">
            <button
              ref={node => { menuToggles.current.workspaces = node; }}
              className="nav-link nav-menu-toggle"
              type="button"
              data-icon="🖥️"
              title={t("Workspaces")}
              aria-expanded={openMenu === 'workspaces'}
              aria-controls="workspaceMenu"
              aria-haspopup="menu"
              onClick={() => toggleMenuSection('workspaces')}
            >
              <span className="nav-label">{t("Workspaces")}</span>
              <span className="dropdown-chevron" aria-hidden="true">▾</span>
            </button>
            <div className="nav-dropdown-menu" id="workspaceMenu" role="menu" aria-label={t("Workspaces")} hidden={openMenu !== 'workspaces'}>
              {workspaceLinks.map(link => renderLink(link, { role: 'menuitem' }))}
            </div>
          </div>
        )}

        {signedIn && (
          <div className="nav-dropdown" id="websiteDropdown">
            <button
              ref={node => { menuToggles.current.websites = node; }}
              className="nav-link nav-dropdown-toggle"
              type="button"
              data-icon="🔗"
              title={t("Connected websites")}
              aria-expanded={dropdownOpen}
              aria-controls="websiteDropdownMenu"
              aria-haspopup="menu"
              onClick={toggleWebsites}
            >
              <span className="nav-label">{t("Connected websites")}</span>
              <span className="dropdown-chevron" aria-hidden="true">▾</span>
            </button>
            <div
              className="nav-dropdown-menu"
              id="websiteDropdownMenu"
              role="menu"
              aria-label={t("Connected websites")}
              hidden={!dropdownOpen}
            >
              {connections.status === 'ready' && connections.items.length === 0 && (
                <div className="nav-dropdown-status">{t("No websites available")}</div>
              )}
              {connections.status === 'error' && (
                <div className="nav-dropdown-status nav-dropdown-error" role="status">{t("Unable to load websites")}<button className="btn btn-sm btn-outline" type="button" role="menuitem" onClick={loadConnections}>{t("Retry")}</button>
                </div>
              )}
              {connections.status !== 'ready' && connections.status !== 'error' && (
                <div className="nav-dropdown-status">{t("Loading...")}</div>
              )}
              {connections.status === 'ready' && connections.items.map(connection => (
                <a
                  key={connection.slug}
                  className="nav-link nav-menu-link"
                  href={`/connect/${encodeURIComponent(connection.slug)}/`}
                  role="menuitem"
                  target="_blank"
                  rel="noopener"
                >
                  <span className="nav-label">{connection.name}</span>
                  <span className="nav-dropdown-open" aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {manageLinks.length > 0 && (
          <div className="nav-dropdown">
            <button
              ref={node => { menuToggles.current.manage = node; }}
              className="nav-link nav-menu-toggle"
              type="button"
              data-icon="⚙️"
              title={t("Administration")}
              aria-expanded={openMenu === 'manage'}
              aria-controls="manageMenu"
              aria-haspopup="menu"
              onClick={() => toggleMenuSection('manage')}
            >
              <span className="nav-label">{t("Administration")}</span>
              <span className="dropdown-chevron" aria-hidden="true">▾</span>
            </button>
            <div className="nav-dropdown-menu" id="manageMenu" role="menu" aria-label={t("Administration")} hidden={openMenu !== 'manage'}>
              {manageLinks.map(link => renderLink(link, { role: 'menuitem' }))}
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <div className="nav-user" id="navUser">
          {signedIn && (
            <a
              className="nav-username"
              id="navUsername"
              href="/account.html"
              title={t("Account settings")}
            >
              {`👤 ${user.username}`}
            </a>
          )}
          {status === 'signed-out' && (
            <a className="btn btn-sm btn-primary" href="/login.html">{t("Login")}</a>
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
            >{t("Logout")}</button>
          )}
          <span
            className={`nav-auth-status${logoutState.error || status === 'error' ? ' status-error' : ''}`}
            id="logoutStatus"
            role="status"
            aria-live="polite"
            title={status === 'error' ? error?.message : undefined}
          >
            {status === 'loading' ? t("Loading account...") : ''}
            {status === 'error' ? t("Unable to load account") : ''}
            {t(logoutState.message)}
          </span>
        </div>

        <button
          className="sidebar-collapse"
          type="button"
          aria-label={collapsed ? t("Expand navigation") : t("Collapse navigation")}
          title={collapsed ? t("Expand navigation") : t("Collapse navigation")}
          aria-pressed={collapsed}
          onClick={onToggleCollapse}
        >
          <span className="sidebar-collapse-icon" aria-hidden="true">{collapsed ? '»' : '«'}</span>
          <span className="nav-label">{collapsed ? t("Expand") : t("Collapse navigation")}</span>
        </button>
      </div>
    </nav>
  );
}
