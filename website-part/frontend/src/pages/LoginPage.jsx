import { useEffect, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { TabList, TabPanel, useTabs } from '../components/Tabs.jsx';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';

export function postAuthDestination(search = globalThis.location?.search || '') {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/connect/') ? next : '/index.html';
}

export function LoginPage() {
  const tabs = useTabs({
    items: [
      { id: 'login', label: 'Login', tabId: 'login-tab', panelId: 'loginForm' },
      { id: 'register', label: 'Register', tabId: 'register-tab', panelId: 'registerForm' },
    ],
    initialId: 'login',
  });
  const [login, setLogin] = useState({ username: '', password: '', remember: false });
  const [register, setRegister] = useState({ username: '', password: '', termsAccepted: false });
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [termsRequired, setTermsRequired] = useState(true);
  const loginAction = useAsyncAction();
  const registerAction = useAsyncAction();

  useEffect(() => {
    let active = true;
    fetch('/api/auth/terms-status')
      .then(response => (response.ok ? response.json() : null))
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
  }, [tabs.activeId]);

  const submitLogin = event => {
    event.preventDefault();
    setLoginError('');
    loginAction.run(async () => {
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
          globalThis.location.href = data.termsRequired
            ? '/terms.html?next=/index.html'
            : postAuthDestination();
        } else {
          setLoginError('Login failed');
        }
      } catch (error) {
        setLoginError(error.message || 'Login failed');
      }
    });
  };

  const submitRegister = event => {
    event.preventDefault();
    setRegisterError('');

    const username = register.username.trim();
    if (username.length < 3) {
      setRegisterError('Username must be at least 3 characters');
      return;
    }
    if (register.password.length < 6) {
      setRegisterError('Password must be at least 6 characters');
      return;
    }
    if (termsRequired && !register.termsAccepted) {
      setRegisterError('You must accept the Terms of Service and Privacy Policy');
      return;
    }

    registerAction.run(async () => {
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
          setRegisterError('Registration failed');
        }
      } catch (error) {
        setRegisterError(error.message || 'Registration failed');
      }
    });
  };

  return (
    <div className="auth-container">
      <div className="auth-card tabs">
        <h1>🎮 LiuLianBot</h1>
        <p className="subtitle">R6 Roller System</p>

        <TabList tabs={tabs} label="Account access" />

        <TabPanel as="form" tabs={tabs} id="login" className="auth-form" onSubmit={submitLogin}>
          <div className="form-group">
            <label htmlFor="loginUsername">Username</label>
            <input
              type="text"
              id="loginUsername"
              placeholder="Enter username"
              required
              minLength="3"
              autoComplete="username"
              value={login.username}
              onChange={event => setLogin({ ...login, username: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="loginPassword">Password</label>
            <input
              type="password"
              id="loginPassword"
              placeholder="Enter password"
              required
              minLength="6"
              autoComplete="current-password"
              value={login.password}
              onChange={event => setLogin({ ...login, password: event.target.value })}
            />
          </div>
          <label className="remember-row" htmlFor="rememberLogin">
            <input
              type="checkbox"
              id="rememberLogin"
              checked={login.remember}
              onChange={event => setLogin({ ...login, remember: event.target.checked })}
            />
            <span>Remember me for 30 days</span>
          </label>
          <StatusMessage
            className="error-msg"
            id="loginError"
            message={loginError}
            role="alert"
            live="assertive"
          />
          <button type="submit" className="btn btn-primary" disabled={loginAction.busy} aria-busy={loginAction.busy}>
            Login
          </button>
        </TabPanel>

        <TabPanel as="form" tabs={tabs} id="register" className="auth-form" onSubmit={submitRegister}>
          <div className="form-group">
            <label htmlFor="regUsername">Username</label>
            <input
              type="text"
              id="regUsername"
              placeholder="3-20 characters"
              required
              minLength="3"
              maxLength="20"
              autoComplete="username"
              value={register.username}
              onChange={event => setRegister({ ...register, username: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="regPassword">Password</label>
            <input
              type="password"
              id="regPassword"
              placeholder="6-128 characters"
              required
              minLength="6"
              maxLength="128"
              autoComplete="new-password"
              value={register.password}
              onChange={event => setRegister({ ...register, password: event.target.value })}
            />
          </div>
          <label className="remember-row" id="termsAcceptanceRow" htmlFor="termsAccepted" hidden={!termsRequired}>
            <input
              type="checkbox"
              id="termsAccepted"
              required={termsRequired}
              checked={register.termsAccepted}
              onChange={event => setRegister({ ...register, termsAccepted: event.target.checked })}
            />
            <span>
              I agree to the{' '}
              <a href="/terms.html" target="_blank" rel="noopener">
                Terms of Service and Privacy Policy
              </a>
              .
            </span>
          </label>
          <StatusMessage
            className="error-msg"
            id="regError"
            message={registerError}
            role="alert"
            live="assertive"
          />
          <button type="submit" className="btn btn-primary" disabled={registerAction.busy} aria-busy={registerAction.busy}>
            Register
          </button>
        </TabPanel>
      </div>
    </div>
  );
}
