// Login / Register page logic
function postAuthDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/connect/') ? next : '/index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  const tabBtns = document.querySelectorAll('.auth-tabs .tab-btn');
  const forms = document.querySelectorAll('.auth-form');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      forms.forEach(f => f.classList.remove('active'));
      document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm').classList.add('active');

      // Clear errors
      document.getElementById('loginError').textContent = '';
      document.getElementById('regError').textContent = '';
    });
  });

  // Login
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const remember = document.getElementById('rememberLogin').checked;

    errorEl.textContent = '';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        window.location.href = postAuthDestination();
      } else {
        errorEl.textContent = data.error || 'Login failed';
      }
    } catch (err) {
      errorEl.textContent = 'Network error. Please try again.';
    }
  });

  // Register
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const errorEl = document.getElementById('regError');

    errorEl.textContent = '';

    if (username.length < 3) {
      errorEl.textContent = 'Username must be at least 3 characters';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'Password must be at least 6 characters';
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        window.location.href = postAuthDestination();
      } else {
        errorEl.textContent = data.error || 'Registration failed';
      }
    } catch (err) {
      errorEl.textContent = 'Network error. Please try again.';
    }
  });
});
