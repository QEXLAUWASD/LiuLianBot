// Common app functions shared across pages

// Check if user is logged in — returns user object or null without redirect
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

// Set up logout button
function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }
}

// Set up user display in navbar — handles both logged-in and guest states
async function setupNavUser() {
  const user = await checkAuth();
  const navUserEl = document.getElementById('navUser');

  if (!navUserEl) return;

  if (user) {
    // Logged in: show username + logout
    navUserEl.innerHTML = `
      <span id="navUsername">👤 ${escapeHTML(user.username)}</span>
      <button id="logoutBtn" class="btn btn-sm btn-outline">Logout</button>
    `;
    setupLogout();

    // Show admin links if user has admin role
    if (user.role === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = '';
      });
    }

    // Fill welcome name if on dashboard
    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) welcomeName.textContent = user.username;
  } else {
    // Guest: show login button
    navUserEl.innerHTML = `
      <a href="/login.html" class="btn btn-sm btn-primary">Login</a>
    `;
  }
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

// Init on page load
document.addEventListener('DOMContentLoaded', () => {
  setupNavUser();
});
