import { requestJSON } from './api_client.mjs';

const section = document.getElementById('termsConsent');
const checkbox = document.getElementById('confirmTerms');
const button = document.getElementById('acceptTerms');
const status = document.getElementById('termsStatus');

async function setupConsent() {
  try {
    const configuration = await requestJSON('/api/auth/terms-status');
    if (!configuration.required) return;
    const account = await requestJSON('/api/auth/me');
    if (!account?.loggedIn || account.user?.termsAccepted) return;
    section.hidden = false;
  } catch (_) {}
}

button.addEventListener('click', async () => {
  if (!checkbox.checked) { status.textContent = '請先勾選同意。'; status.className = 'status-msg status-error'; return; }
  button.disabled = true;
  try {
    await requestJSON('/api/auth/terms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ termsAccepted: true }) });
    location.href = new URLSearchParams(location.search).get('next') || '/index.html';
  } catch (error) {
    status.textContent = error.message;
    status.className = 'status-msg status-error';
    button.disabled = false;
  }
});

setupConsent();
