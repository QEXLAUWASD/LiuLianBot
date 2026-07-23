import { authState } from './auth_state.mjs';
import { ApiError, requestJSON } from './api_client.mjs';
import { withBusyControl } from './form_state.mjs';

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

function setFormState(form, { disabled, busy }) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = disabled;
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
  setFormState(usernameForm, { disabled: true, busy: true });
  setFormState(passwordForm, { disabled: true, busy: true });

  usernameForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready) return;

    setAccountStatus(usernameStatus, '');
    const submitButton = usernameForm.querySelector('button[type="submit"]');
    await withBusyControl(submitButton, async () => {
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
      }
    });
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

    const submitButton = passwordForm.querySelector('button[type="submit"]');
    await withBusyControl(submitButton, async () => {
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
      }
    });
  });

  let auth;
  try {
    auth = await authState.load();
  } catch (error) {
    handleAccountLoadError(error, usernameStatus);
    setFormState(usernameForm, { disabled: true, busy: false });
    setFormState(passwordForm, { disabled: true, busy: false });
    return;
  }

  if (!auth?.loggedIn) {
    window.location.href = '/login.html';
    return;
  }

  usernameInput.value = auth.user.username;
  ready = true;
  setAccountStatus(usernameStatus, '');
  setFormState(usernameForm, { disabled: false, busy: false });
  setFormState(passwordForm, { disabled: false, busy: false });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initializeAccountPage);
}
