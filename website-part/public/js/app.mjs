import { requestJSON } from './api_client.mjs';
import { authState, logout } from './auth_state.mjs';
import { element, replaceChildren } from './dom.mjs';
import { renderNavbar } from './nav.mjs';

const navbarRefs = new WeakMap();
const logoutControls = new WeakSet();
const dropdowns = new WeakSet();
const GUEST_PAGE_FALLBACK = Object.freeze({
  roller: true,
  events: false,
  account: false,
  remote: false,
  chromium: false,
  'vless-tunnel': false,
});
const USER_PAGE_FALLBACK = Object.freeze({
  roller: true,
  events: true,
  account: true,
  remote: true,
  chromium: true,
  'vless-tunnel': true,
});

function getNavbar() {
  const target = document.getElementById('siteNav');
  if (!target) return null;
  if (!navbarRefs.has(target)) navbarRefs.set(target, renderNavbar(target));
  return navbarRefs.get(target);
}

async function checkAuth() {
  const data = await authState.load();
  return data?.loggedIn ? data.user : null;
}

function showLogoutError(error, refs = getNavbar()) {
  if (!refs) return;
  refs.status.textContent = error.message;
  refs.status.className = 'nav-auth-status status-error';
}

function applyPageVisibility(pages) {
  if (!pages) return;
  document.querySelectorAll('[data-page-key]').forEach(node => {
    node.hidden = pages[node.dataset.pageKey] !== true;
  });
}

async function loadPageVisibility() {
  try {
    const data = await requestJSON('/api/page-visibility');
    return data?.pages || null;
  } catch (_) {
    return null;
  }
}

export function setupLogout(refs = getNavbar()) {
  const logoutButton = refs?.logout;
  if (!logoutButton || logoutControls.has(logoutButton)) return;
  logoutControls.add(logoutButton);

  logoutButton.addEventListener('click', async () => {
    refs.status.textContent = '';
    refs.status.className = 'nav-auth-status';
    logoutButton.disabled = true;
    logoutButton.setAttribute('aria-busy', 'true');
    try {
      await logout();
    } catch (error) {
      logoutButton.disabled = false;
      logoutButton.setAttribute('aria-busy', 'false');
      showLogoutError(error, refs);
    }
  });
}

function setSignedOut(refs, pages = GUEST_PAGE_FALLBACK) {
  refs.username.hidden = true;
  refs.logout.hidden = true;
  refs.dropdown.hidden = true;
  refs.remote.hidden = true;
  refs.chromium.hidden = true;
  refs.guildManager.hidden = true;
  refs.admin.hidden = true;
  refs.login.hidden = false;
  applyPageVisibility(pages);
  refs.status.textContent = '';
  refs.status.className = 'nav-auth-status';
}

function setAuthError(refs, error) {
  refs.username.hidden = true;
  refs.logout.hidden = true;
  refs.dropdown.hidden = true;
  refs.chromium.hidden = true;
  refs.guildManager.hidden = true;
  refs.admin.hidden = true;
  refs.login.hidden = true;
  applyPageVisibility(GUEST_PAGE_FALLBACK);
  refs.status.textContent = 'Unable to load account';
  refs.status.className = 'nav-auth-status status-error';
  refs.status.title = error.message;
}

export async function setupNavUser() {
  const refs = getNavbar();
  if (!refs) return null;

  let user;
  try {
    user = await checkAuth();
  } catch (error) {
    setAuthError(refs, error);
    return null;
  }

  if (!user) {
    setSignedOut(refs, await loadPageVisibility() || GUEST_PAGE_FALLBACK);
    return null;
  }

  refs.username.textContent = `👤 ${user.username}`;
  refs.username.hidden = false;
  refs.login.hidden = true;
  refs.logout.hidden = false;
  refs.dropdown.hidden = false;
  refs.admin.hidden = user.role !== 'admin';
  refs.remote.hidden = user.remoteAvailable === false;
  refs.chromium.hidden = false;
  refs.guildManager.hidden = false;
  refs.status.textContent = '';
  refs.status.className = 'nav-auth-status';
  refs.status.removeAttribute('title');
  applyPageVisibility(await loadPageVisibility() || USER_PAGE_FALLBACK);
  document.querySelectorAll('[data-page-key="remote"]').forEach(node => {
    node.hidden = node.hidden || user.remoteAvailable === false;
  });
  setupLogout(refs);

  const welcomeName = document.getElementById('welcomeName');
  if (welcomeName) welcomeName.textContent = user.username;
  const remoteFeatureCard = document.getElementById('remoteFeatureCard');
  if (remoteFeatureCard) remoteFeatureCard.hidden = user.remoteAvailable === false;
  return user;
}

function dropdownStatus(message, error = false) {
  return element('div', {
    className: `nav-dropdown-status${error ? ' nav-dropdown-error' : ''}`,
    text: message,
  });
}

async function setupWebsiteDropdown(refs = getNavbar()) {
  if (!refs || dropdowns.has(refs.dropdown)) return;
  dropdowns.add(refs.dropdown);

  const setOpen = open => {
    refs.dropdownToggle.setAttribute('aria-expanded', String(open));
    refs.dropdownMenu.hidden = !open;
  };
  refs.dropdownToggle.addEventListener('click', () => {
    setOpen(refs.dropdownToggle.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('click', event => {
    if (!refs.dropdown.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || refs.dropdownMenu.hidden) return;
    setOpen(false);
    refs.dropdownToggle.focus();
  });

  try {
    const data = await requestJSON('/api/connections');
    const connections = data?.connections || [];
    if (connections.length === 0) {
      replaceChildren(refs.dropdownMenu, [dropdownStatus('No websites available')]);
      return;
    }

    replaceChildren(refs.dropdownMenu, connections.map(connection => element('a', {
      attributes: {
        href: `/connect/${encodeURIComponent(connection.slug)}/`,
        role: 'menuitem',
        target: '_blank',
        rel: 'noopener',
      },
    }, [
      element('span', { text: connection.name }),
      element('span', { className: 'nav-dropdown-open', text: '↗', attributes: { 'aria-hidden': 'true' } }),
    ])));
  } catch (_) {
    replaceChildren(refs.dropdownMenu, [dropdownStatus('Unable to load websites', true)]);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    const refs = getNavbar();
    const user = await setupNavUser();
    if (user) await setupWebsiteDropdown(refs);
  });
}
