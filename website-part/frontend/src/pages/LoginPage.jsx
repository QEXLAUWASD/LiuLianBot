import { t, useLocale } from '../lib/i18n.mjs';
import { useEffect, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { authDestination } from '../lib/authDestination.mjs';
import { TabList, TabPanel, useTabs } from '../components/Tabs.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';

export function postAuthDestination(search) {
  return authDestination(search);
}

function authErrorMessage(error, fallback) {
  if (error?.code === 'NETWORK_ERROR') return 'Unable to connect. Check your connection and try again.';
  if (error?.status === 429) return 'Too many attempts. Please wait a few minutes before trying again.';
  if (error?.status >= 500) return 'The server is temporarily unavailable. Please try again shortly.';
  return error?.message || fallback;
}

function PasswordField({ id, label, visible, onToggle, ...inputProps }) {
  useLocale();
  return (
    <div className="auth-password-field">
      <input id={id} type={visible ? 'text' : 'password'} {...inputProps} />
      <button
        className="auth-password-toggle"
        type="button"
        aria-label={t(label)}
        aria-pressed={visible}
        aria-controls={id}
        disabled={inputProps.disabled}
        onClick={onToggle}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  );
}

export function LoginPage() {
  useLocale();
  const action = useAsyncAction();
  const tabs = useTabs({
    items: [
      { id: 'login', label: 'Login', tabId: 'login-tab', panelId: 'loginForm', disabled: action.busy },
      { id: 'register', label: 'Register', tabId: 'register-tab', panelId: 'registerForm', disabled: action.busy },
    ],
    initialId: 'login',
  });
  const [login, setLogin] = useState({ username: '', password: '', remember: false });
  const [register, setRegister] = useState({ username: '', password: '', termsAccepted: false });
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [termsRequired, setTermsRequired] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    let active = true;
    requestJSON('/api/auth/terms-status')
      .then(data => {
        if (active && data?.required === false) setTermsRequired(false);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setLoginError('');
    setRegisterError('');
    setPasswordVisible(false);
  }, [tabs.activeId]);

  const submitLogin = event => {
    event.preventDefault();
    setLoginError('');
    action.run(async () => {
      try {
        const data = await requestJSON('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: login.username.trim(),
            password: login.password,
            remember: login.remember,
          }),
        });

        if (data?.success) {
          const destination = postAuthDestination();
          globalThis.location.href = data.termsRequired
            ? `/terms.html?next=${encodeURIComponent(destination)}`
            : destination;
        } else {
          setLoginError('Unable to sign in. Please try again.');
        }
      } catch (error) {
        setLoginError(authErrorMessage(error, 'Unable to sign in. Please try again.'));
      }
    });
  };

  const submitRegister = event => {
    event.preventDefault();
    setRegisterError('');

    const username = register.username.trim();
    if (username.length < 3 || username.length > 20) {
      setRegisterError('Username must be 3–20 characters.');
      return;
    }
    if (register.password.length < 8 || register.password.length > 128) {
      setRegisterError('Password must be 8–128 characters.');
      return;
    }
    if (termsRequired && !register.termsAccepted) {
      setRegisterError('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }

    action.run(async () => {
      try {
        const data = await requestJSON('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password: register.password,
            termsAccepted: termsRequired && register.termsAccepted,
          }),
        });

        if (data?.success) {
          globalThis.location.href = postAuthDestination();
        } else {
          setRegisterError('Unable to create your account. Please try again.');
        }
      } catch (error) {
        setRegisterError(authErrorMessage(error, 'Unable to create your account. Please try again.'));
      }
    });
  };

  return (
    <main className="auth-container" id="main-content">
      <aside className="auth-aside" aria-label={t("About LiuLianBot")}>
        <a className="auth-brand" href="/index.html">
          <span className="auth-brand-mark" aria-hidden="true">L</span>
          <span>LiuLianBot<span className="auth-brand-caption">{t("YOUR PERSONAL WORKSPACE")}</span></span>
        </a>
        <p className="page-eyebrow auth-eyebrow">{t("Play. Connect. Get things done.")}</p>
        <h2>{t("Your server.")}<br /><span>{t("All together.")}</span></h2>
        <p className="auth-intro">{t("From your next Rainbow Six pick to your home server. A familiar place for everything you do.")}</p>
        <ul className="auth-features">
          <li><span className="auth-feature-number" aria-hidden="true">01</span><div><strong>{t("Make the next pick")}</strong><p>{t("Roll operators and maps. Plan your next game.")}</p></div></li>
          <li><span className="auth-feature-number" aria-hidden="true">02</span><div><strong>{t("Keep your files close")}</strong><p>{t("Browse FnOS and share files with expiring links.")}</p></div></li>
          <li><span className="auth-feature-number" aria-hidden="true">03</span><div><strong>{t("Connect to your machines")}</strong><p>{t("Open SSH, RDP and browser sessions in one place.")}</p></div></li>
        </ul>
      </aside>

      <div className="auth-card tabs">
        <p className="page-eyebrow">{t("YOUR WORKSPACE")}</p>
        <h1>{tabs.activeId === 'login' ? t("Welcome back.") : t("Make yourself at home.")}</h1>
        <p className="subtitle">
          {tabs.activeId === 'login' ? t("Sign in to pick up where you left off.") : t("Create an account to get started.")}
        </p>

        <TabList tabs={tabs} label={t("Account access")} />

        <TabPanel as="form" tabs={tabs} id="login" className="auth-form" onSubmit={submitLogin} aria-busy={action.busy} aria-describedby="loginError">
          <div className="form-group">
            <label htmlFor="loginUsername">{t("Username")}</label>
            <input
              type="text"
              id="loginUsername"
              name="username"
              placeholder={t("Enter your username")}
              required
              minLength={3}
              maxLength={20}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={action.busy}
              value={login.username}
              onChange={event => setLogin({ ...login, username: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="loginPassword">{t("Password")}</label>
            <PasswordField
              id="loginPassword"
              name="password"
              label={t("Show login password")}
              visible={passwordVisible && tabs.activeId === 'login'}
              onToggle={() => setPasswordVisible(value => !value)}
              placeholder={t("Enter your password")}
              required
              autoComplete="current-password"
              disabled={action.busy}
              value={login.password}
              onChange={event => setLogin({ ...login, password: event.target.value })}
            />
          </div>
          <label className="remember-row" htmlFor="rememberLogin">
            <input
              type="checkbox"
              id="rememberLogin"
              disabled={action.busy}
              checked={login.remember}
              onChange={event => setLogin({ ...login, remember: event.target.checked })}
            />
            <span>{t("Remember me for 30 days")}</span>
          </label>
          <StatusMessage className="error-msg" id="loginError" message={loginError} role="alert" live="assertive" />
          <button type="submit" className="btn btn-primary" disabled={action.busy} aria-busy={action.busy}>
            {action.busy ? t("Signing in…") : t("Sign in")}
            {!action.busy && <span aria-hidden="true">→</span>}
          </button>
        </TabPanel>

        <TabPanel as="form" tabs={tabs} id="register" className="auth-form" onSubmit={submitRegister} aria-busy={action.busy} aria-describedby="regError">
          <div className="form-group">
            <label htmlFor="regUsername">{t("Username")}</label>
            <input
              type="text"
              id="regUsername"
              name="username"
              placeholder={t("Choose a username")}
              required
              minLength={3}
              maxLength={20}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="regUsernameHint"
              disabled={action.busy}
              value={register.username}
              onChange={event => setRegister({ ...register, username: event.target.value })}
            />
            <p className="auth-field-hint" id="regUsernameHint">{t("3–20 characters.")}</p>
          </div>
          <div className="form-group">
            <label htmlFor="regPassword">{t("Password")}</label>
            <PasswordField
              id="regPassword"
              name="password"
              label={t("Show new password")}
              visible={passwordVisible && tabs.activeId === 'register'}
              onToggle={() => setPasswordVisible(value => !value)}
              placeholder={t("Create a password")}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              aria-describedby="regPasswordHint"
              disabled={action.busy}
              value={register.password}
              onChange={event => setRegister({ ...register, password: event.target.value })}
            />
            <p className="auth-field-hint" id="regPasswordHint">{t("8–128 characters. Choose a unique password.")}</p>
          </div>
          <label className="remember-row" id="termsAcceptanceRow" htmlFor="termsAccepted" hidden={!termsRequired}>
            <input
              type="checkbox"
              id="termsAccepted"
              required={termsRequired}
              disabled={action.busy}
              checked={register.termsAccepted}
              onChange={event => setRegister({ ...register, termsAccepted: event.target.checked })}
            />
            <span>{t("I agree to the")}{' '}
              <a href="/terms.html" target="_blank" rel="noopener">{t("Terms of Service and Privacy Policy")}<span className="sr-only">{t(" (opens in a new tab)")}</span>
              </a>.
            </span>
          </label>
          <StatusMessage className="error-msg" id="regError" message={registerError} role="alert" live="assertive" />
          <button type="submit" className="btn btn-primary" disabled={action.busy} aria-busy={action.busy}>
            {action.busy ? t("Creating account…") : t("Create account")}
            {!action.busy && <span aria-hidden="true">→</span>}
          </button>
        </TabPanel>
        <p className="auth-footer">{t("Your games, files and connections. One account.")}</p>
      </div>
    </main>
  );
}
