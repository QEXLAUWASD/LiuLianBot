import { authState, logout } from './auth_state.mjs';
import { requestJSON } from './api_client.mjs';

// Common app functions shared across pages

async function checkAuth() {
  const data = await authState.load();
  if (!data?.loggedIn) return null;
  return data.user;
}

function showLogoutError(error) {
  const logoutStatus = document.getElementById('logoutStatus');
  if (!logoutStatus) return;
  logoutStatus.textContent = error.message;
  logoutStatus.className = 'nav-auth-status status-error';
}

export function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const logoutStatus = document.getElementById('logoutStatus');
      if (logoutStatus) {
        logoutStatus.textContent = '';
        logoutStatus.className = 'nav-auth-status';
      }
      logoutBtn.disabled = true;
      logoutBtn.setAttribute('aria-busy', 'true');
      try {
        await logout();
      } catch (error) {
        logoutBtn.disabled = false;
        logoutBtn.setAttribute('aria-busy', 'false');
        showLogoutError(error);
      }
    });
  }
}

export async function setupNavUser() {
  const navUserEl = document.getElementById('navUser');
  let user;

  try {
    user = await checkAuth();
  } catch (error) {
    if (navUserEl) {
      navUserEl.innerHTML = `
        <span id="logoutStatus" class="nav-auth-status status-error" role="status" aria-live="polite" title="${escapeHTML(error.message)}">Unable to load account</span>
      `;
    }
    return null;
  }

  if (!navUserEl) return user;

  if (user) {
    navUserEl.innerHTML = `
      <a href="/account.html" id="navUsername" class="nav-username" title="Account settings">👤 ${escapeHTML(user.username)}</a>
      <button id="logoutBtn" class="btn btn-sm btn-outline">Logout</button>
      <span id="logoutStatus" class="nav-auth-status" role="status" aria-live="polite"></span>
    `;
    setupLogout();

    if (user.role === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = '';
      });
    }

    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) welcomeName.textContent = user.username;
  } else {
    navUserEl.innerHTML = `
      <a href="/login.html" class="btn btn-sm btn-primary">Login</a>
      <span id="logoutStatus" class="nav-auth-status" role="status" aria-live="polite"></span>
    `;
  }

  return user;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function setupWebsiteDropdown() {
  const navLinks = document.querySelector('.nav-links');
  const rollerLink = navLinks?.querySelector('a[href^="/roller.html"]');
  if (!navLinks || !rollerLink || document.getElementById('websiteDropdown')) return;

  const dropdown = document.createElement('div');
  dropdown.className = 'nav-dropdown';
  dropdown.id = 'websiteDropdown';
  dropdown.innerHTML = `
    <button type="button" class="nav-link nav-dropdown-toggle" aria-expanded="false" aria-controls="websiteDropdownMenu">
      <span>Connected websites</span>
      <span class="dropdown-chevron" aria-hidden="true">▾</span>
    </button>
    <div class="nav-dropdown-menu" id="websiteDropdownMenu" role="menu" hidden>
      <div class="nav-dropdown-status">Loading...</div>
    </div>
  `;
  rollerLink.insertAdjacentElement('afterend', dropdown);

  const toggle = dropdown.querySelector('.nav-dropdown-toggle');
  const menu = dropdown.querySelector('.nav-dropdown-menu');

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  }

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('click', event => {
    if (!dropdown.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setOpen(false);
      toggle.focus();
    }
  });

  try {
    const data = await requestJSON('/api/connections');

    const connections = data.connections || [];
    if (connections.length === 0) {
      menu.innerHTML = '<div class="nav-dropdown-status">No websites available</div>';
      return;
    }

    menu.innerHTML = connections.map(connection => `
      <a href="/connect/${encodeURIComponent(connection.slug)}/" role="menuitem" target="_blank" rel="noopener">
        <span>${escapeHTML(connection.name)}</span>
        <span class="nav-dropdown-open" aria-hidden="true">↗</span>
      </a>
    `).join('');
  } catch (err) {
    menu.innerHTML = '<div class="nav-dropdown-status nav-dropdown-error">Unable to load websites</div>';
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    const user = await setupNavUser();
    if (user) setupWebsiteDropdown();
  });
}
