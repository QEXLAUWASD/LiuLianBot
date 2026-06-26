// Common app functions shared across pages

// Check if user is logged in
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.loggedIn) {
      window.location.href = '/login.html';
      return null;
    }
    return data.user;
  } catch (err) {
    window.location.href = '/login.html';
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

// Set up user display in navbar
async function setupNavUser() {
  const user = await checkAuth();
  if (!user) return;

  const navUsername = document.getElementById('navUsername');
  const welcomeName = document.getElementById('welcomeName');

  if (navUsername) navUsername.textContent = `👤 ${user.username}`;
  if (welcomeName) welcomeName.textContent = user.username;
}

// Init on page load
document.addEventListener('DOMContentLoaded', () => {
  setupNavUser();
  setupLogout();
});
