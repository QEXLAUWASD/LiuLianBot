function setAccountStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status-msg${type ? ` status-${type}` : ''}`;
}

function setFormBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

async function sendAccountUpdate(url, body) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Unable to save changes');
    error.status = response.status;
    throw error;
  }

  return data;
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  const usernameForm = document.getElementById('usernameForm');
  const usernameInput = document.getElementById('newUsername');
  const usernameStatus = document.getElementById('usernameStatus');
  const passwordForm = document.getElementById('passwordForm');
  const passwordStatus = document.getElementById('passwordStatus');
  usernameInput.value = user.username;

  usernameForm.addEventListener('submit', async event => {
    event.preventDefault();
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
      if (error.status === 401 && error.message === 'Login required') {
        window.location.href = '/login.html';
        return;
      }
      setAccountStatus(usernameStatus, error.message, 'error');
    } finally {
      setFormBusy(usernameForm, false);
    }
  });

  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
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
      if (error.status === 401 && error.message === 'Login required') {
        window.location.href = '/login.html';
        return;
      }
      setAccountStatus(passwordStatus, error.message, 'error');
    } finally {
      setFormBusy(passwordForm, false);
    }
  });
});
