import { useEffect, useState } from 'react';
import { ApiError, requestJSON } from '../lib/apiClient.mjs';
import { authState } from '../lib/authStore.mjs';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';

const EMPTY_STATUS = { message: '', tone: '' };

export function AccountPage() {
  const [username, setUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [usernameStatus, setUsernameStatus] = useState({ message: 'Loading account...', tone: '' });
  const [passwordStatus, setPasswordStatus] = useState(EMPTY_STATUS);
  const [discord, setDiscord] = useState({ message: 'Loading...', tone: '', code: '', linked: false });
  const [ready, setReady] = useState(false);
  const usernameAction = useAsyncAction();
  const passwordAction = useAsyncAction();
  const discordAction = useAsyncAction();

  const loadDiscordLink = async () => {
    const data = await requestJSON('/api/auth/discord-link');
    setDiscord({
      message: data.linked ? `Linked Discord user ${data.discordUserId}` : 'Not linked',
      tone: '',
      code: '',
      linked: Boolean(data.linked),
    });
  };

  useEffect(() => {
    let active = true;
    authState
      .load()
      .then(data => {
        if (!active) return;
        if (!data?.loggedIn) {
          globalThis.location.href = '/login.html';
          return;
        }
        setUsername(data.user.username);
        setUsernameStatus(EMPTY_STATUS);
        setReady(true);
        loadDiscordLink().catch(error => {
          if (active) setDiscord({ message: error.message, tone: 'error', code: '', linked: false });
        });
      })
      .catch(error => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          globalThis.location.href = '/login.html';
          return;
        }
        setUsernameStatus({ message: error?.message || 'Unable to load account.', tone: 'error' });
      });

    return () => {
      active = false;
    };
  }, []);

  const submitUsername = event => {
    event.preventDefault();
    if (!ready) return;
    setUsernameStatus(EMPTY_STATUS);

    usernameAction.run(async () => {
      try {
        const data = await requestJSON('/api/auth/username', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), currentPassword: usernamePassword }),
        });
        setUsernamePassword('');
        setUsername(data.user.username);
        authState.patch(current => (current?.user
          ? { ...current, user: { ...current.user, username: data.user.username } }
          : current));
        setUsernameStatus({ message: 'Username updated.', tone: 'success' });
      } catch (error) {
        setUsernameStatus({ message: error.message, tone: 'error' });
      }
    });
  };

  const submitPassword = event => {
    event.preventDefault();
    if (!ready) return;
    setPasswordStatus(EMPTY_STATUS);

    if (passwords.next !== passwords.confirm) {
      setPasswordStatus({ message: 'New passwords do not match.', tone: 'error' });
      return;
    }

    passwordAction.run(async () => {
      try {
        await requestJSON('/api/auth/password', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentPassword: passwords.current,
            newPassword: passwords.next,
            confirmPassword: passwords.confirm,
          }),
        });
        setPasswords({ current: '', next: '', confirm: '' });
        setPasswordStatus({ message: 'Password updated.', tone: 'success' });
      } catch (error) {
        setPasswordStatus({ message: error.message, tone: 'error' });
      }
    });
  };

  const generateDiscordLink = () => {
    discordAction.run(async () => {
      try {
        const data = await requestJSON('/api/auth/discord-link', { method: 'POST' });
        setDiscord({
          message: 'Code generated.',
          tone: 'success',
          code: `Run >link ${data.code} in Discord within 10 minutes.`,
          linked: false,
        });
      } catch (error) {
        setDiscord({ message: error.message, tone: 'error', code: '', linked: false });
      }
    });
  };

  const unlinkDiscord = () => {
    discordAction.run(async () => {
      try {
        await requestJSON('/api/auth/discord-link', { method: 'DELETE' });
        await loadDiscordLink();
      } catch (error) {
        setDiscord({ message: error.message, tone: 'error', code: '', linked: false });
      }
    });
  };

  return (
    <main className="main-content" id="main-content">
      <div className="account-container">
        <h2>Account settings</h2>
        <p className="account-desc">Manage your sign-in details.</p>

        <div className="account-grid">
          <section className="settings-card" aria-labelledby="usernameHeading">
            <h3 id="usernameHeading">Change username</h3>
            <form id="usernameForm" onSubmit={submitUsername}>
              <div className="form-group">
                <label htmlFor="newUsername">Username</label>
                <input
                  type="text"
                  id="newUsername"
                  required
                  minLength="3"
                  maxLength="20"
                  autoComplete="username"
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="usernameCurrentPassword">Current password</label>
                <input
                  type="password"
                  id="usernameCurrentPassword"
                  required
                  autoComplete="current-password"
                  value={usernamePassword}
                  onChange={event => setUsernamePassword(event.target.value)}
                />
              </div>
              <StatusMessage
                id="usernameStatus"
                message={usernameStatus.message}
                tone={usernameStatus.tone}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!ready || usernameAction.busy}
                aria-busy={!ready || usernameAction.busy}
              >
                Save username
              </button>
            </form>
          </section>

          <section className="settings-card" aria-labelledby="passwordHeading">
            <h3 id="passwordHeading">Change password</h3>
            <form id="passwordForm" onSubmit={submitPassword}>
              <div className="form-group">
                <label htmlFor="passwordCurrentPassword">Current password</label>
                <input
                  type="password"
                  id="passwordCurrentPassword"
                  required
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={event => setPasswords({ ...passwords, current: event.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="newPassword">New password</label>
                <input
                  type="password"
                  id="newPassword"
                  required
                  minLength="6"
                  maxLength="128"
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={event => setPasswords({ ...passwords, next: event.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm new password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  required
                  minLength="6"
                  maxLength="128"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={event => setPasswords({ ...passwords, confirm: event.target.value })}
                />
              </div>
              <StatusMessage
                id="passwordStatus"
                message={passwordStatus.message}
                tone={passwordStatus.tone}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!ready || passwordAction.busy}
                aria-busy={!ready || passwordAction.busy}
              >
                Save password
              </button>
            </form>
          </section>

          <section className="settings-card" aria-labelledby="discordHeading">
            <h3 id="discordHeading">Connect Discord</h3>
            <p className="account-desc">
              Link this account so Discord event commands use the same signup.
            </p>
            <StatusMessage
              id="discordLinkState"
              message={discord.message}
              tone={discord.tone}
            />
            <div id="discordLinkCode" className="link-code" hidden={!discord.code}>{discord.code}</div>
            <button
              id="generateDiscordLink"
              className="btn btn-primary"
              type="button"
              hidden={discord.linked}
              disabled={!ready || discordAction.busy}
              onClick={generateDiscordLink}
            >
              Generate link code
            </button>
            <button
              id="unlinkDiscord"
              className="btn btn-outline"
              type="button"
              hidden={!discord.linked}
              disabled={!ready || discordAction.busy}
              onClick={unlinkDiscord}
            >
              Unlink Discord
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
