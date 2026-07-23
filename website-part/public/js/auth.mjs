import { requestJSON } from './api_client.mjs';
import { withBusyControl } from './form_state.mjs';
import { setupTabs } from './tabs.mjs';

// Login / Register page logic
function postAuthDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/connect/') ? next : '/index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tabs]').forEach(root => setupTabs(root));
  document.addEventListener('tabs:change', () => {
    document.getElementById('loginError').textContent = '';
    document.getElementById('regError').textContent = '';
  });

  // Login
  document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const remember = document.getElementById('rememberLogin').checked;

    errorEl.textContent = '';

    await withBusyControl(submitButton, async () => {
      try {
        const data = await requestJSON('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, remember }),
        });

        if (data?.success) {
          window.location.href = postAuthDestination();
        } else {
          errorEl.textContent = 'Login failed';
        }
      } catch (error) {
        errorEl.textContent = error.message || 'Login failed';
      }
    });
  });

  // Register
  document.getElementById('registerForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
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

    await withBusyControl(submitButton, async () => {
      try {
        const data = await requestJSON('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        if (data?.success) {
          window.location.href = postAuthDestination();
        } else {
          errorEl.textContent = 'Registration failed';
        }
      } catch (error) {
        errorEl.textContent = error.message || 'Registration failed';
      }
    });
  });
});
