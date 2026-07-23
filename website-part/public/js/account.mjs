import { authState } from './auth_state.mjs';
import { ApiError, requestJSON } from './api_client.mjs';

function setAccountStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status-msg${type ? ` status-${type}` : ''}`;
}

export function handleAccountLoadError(error, statusElement, location = globalThis.location) {
  if (error instanceof ApiError && error.status === 401) {
    location.href = '/login.html';
    return;
  }

  setAccountStatus(statusElement, error?.message || 'Unable to load account.', 'error');
}

function setFormBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

async function sendAccountUpdate(url, body) {
  return requestJSON(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function initializeAccountPage() {
  const usernameForm = document.getElementById('usernameForm');
  const usernameInput = document.getElementById('newUsername');
  const usernameStatus = document.getElementById('usernameStatus');
  const passwordForm = document.getElementById('passwordForm');
  const passwordStatus = document.getElementById('passwordStatus');
  let ready = false;

  setAccountStatus(usernameStatus, 'Loading account...');
  setFormBusy(usernameForm, true);
  setFormBusy(passwordForm, true);

  usernameForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready) return;

    setAccountStatus(usernameStatus, '');
    setFormBusy(usernameForm, true);

    try {
      const data = await sendAccountUpdate('/api/auth/username', {
        username: usernameInput.value.trim(),
        currentPassword: document.getElementById('usernameCurrentPassword').value,
      });
      document.getElementById('usernameCurrentPassword').value = '';
      usernameInput.value = data.user.username;
      const navUsername = document.getElementById('navUsername');
      if (navUsername) navUsername.textContent = `👤 ${data.user.username}`;
      setAccountStatus(usernameStatus, 'Username updated.', 'success');
    } catch (error) {
      setAccountStatus(usernameStatus, error.message, 'error');
    } finally {
      setFormBusy(usernameForm, false);
    }
  });

  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready) return;

    setAccountStatus(passwordStatus, '');

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (newPassword !== confirmPassword) {
      setAccountStatus(passwordStatus, 'New passwords do not match.', 'error');
      return;
    }

    setFormBusy(passwordForm, true);
    try {
      await sendAccountUpdate('/api/auth/password', {
        currentPassword: document.getElementById('passwordCurrentPassword').value,
        newPassword,
        confirmPassword,
      });
      passwordForm.reset();
      setAccountStatus(passwordStatus, 'Password updated.', 'success');
    } catch (error) {
      setAccountStatus(passwordStatus, error.message, 'error');
    } finally {
      setFormBusy(passwordForm, false);
    }
  });

  let auth;
  try {
    auth = await authState.load();
  } catch (error) {
    handleAccountLoadError(error, usernameStatus);
    return;
  }

  if (!auth?.loggedIn) {
    window.location.href = '/login.html';
    return;
  }

  usernameInput.value = auth.user.username;
  ready = true;
  setAccountStatus(usernameStatus, '');
  setFormBusy(usernameForm, false);
  setFormBusy(passwordForm, false);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initializeAccountPage);
}
