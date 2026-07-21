// Common app functions shared across pages

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.loggedIn) return null;
    return data.user;
  } catch (err) {
    return null;
  }
}

function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }
}

async function setupNavUser() {
  const user = await checkAuth();
  const navUserEl = document.getElementById('navUser');

  if (!navUserEl) return user;

  if (user) {
    navUserEl.innerHTML = `
      <span id="navUsername">👤 ${escapeHTML(user.username)}</span>
      <button id="logoutBtn" class="btn btn-sm btn-outline">Logout</button>
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
    const res = await fetch('/api/connections');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');

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

document.addEventListener('DOMContentLoaded', async () => {
  const user = await setupNavUser();
  if (user) setupWebsiteDropdown();
});
