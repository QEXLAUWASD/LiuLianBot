import { useEffect, useState } from 'react';
import termsDocument from '../../../../shared/website/terms.json' with { type: 'json' };
import { requestJSON } from '../lib/apiClient.mjs';
import { StatusMessage } from '../components/StatusMessage.jsx';

export function consentDestination(search = globalThis.location?.search || '') {
  const next = new URLSearchParams(search).get('next') || '/index.html';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/index.html';
}

export function TermsPage() {
  const [visible, setVisible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState({ message: '', tone: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const configuration = await requestJSON('/api/auth/terms-status');
        if (!configuration?.required) return;
        const account = await requestJSON('/api/auth/me');
        if (active && account?.loggedIn && !account.user?.termsAccepted) setVisible(true);
      } catch (_) {
        // Consent stays hidden when the status cannot be read.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const accept = async () => {
    if (!accepted) {
      setStatus({ message: '請先勾選同意。', tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      await requestJSON('/api/auth/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termsAccepted: true }),
      });
      globalThis.location.href = consentDestination();
    } catch (error) {
      setStatus({ message: error.message, tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <main className="main-content legal-page" id="main-content">
      <h1>{termsDocument.title}</h1>
      <p>最後更新：{termsDocument.version}</p>
      {termsDocument.sections.map(section => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}

      <section id="termsConsent" hidden={!visible}>
        <label className="remember-row" htmlFor="confirmTerms">
          <input
            id="confirmTerms"
            type="checkbox"
            checked={accepted}
            onChange={event => setAccepted(event.target.checked)}
          />
          我同意上述服務條款與資料儲存說明。
        </label>
        <StatusMessage id="termsStatus" message={status.message} tone={status.tone} />
        <button id="acceptTerms" className="btn btn-primary" type="button" disabled={busy} onClick={accept}>
          同意並繼續
        </button>
      </section>
    </main>
  );
}
