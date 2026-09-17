import { useEffect, useState } from 'react';
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
      <h1>服務條款與資料儲存說明</h1>
      <p>最後更新：2026-07-31</p>
      <h2>帳戶資料</h2>
      <p>為提供網站帳戶服務，我們會保存使用者名稱、密碼雜湊、帳戶群組、登入 session，以及您明確同意後的條款版本與時間。</p>
      <h2>遠端連線設定</h2>
      <p>您可選擇不保存、只保存於目前瀏覽器，或保存於伺服器。伺服器保存的 SSH 主機資訊、SSH 私密金鑰與 RDP 連線資訊會使用 AES-256-GCM 加密後才寫入資料庫。SSH 密碼不會被保存。</p>
      <p>瀏覽器保存使用 localStorage，可能被同一瀏覽器設定檔中能存取此網站資料的人讀取。伺服器加密保存仍應僅用於您信任的服務環境。</p>
      <h2>您的選擇</h2>
      <p>您可在遠端連線頁面更新或刪除伺服器保存的遠端設定。停止使用帳戶或要求刪除資料時，請聯絡服務管理員。</p>
      <h2>使用責任</h2>
      <p>您僅可使用獲授權的 SSH 與 RDP 主機。請勿利用本服務從事未授權存取、破壞或違反適用法律的活動。</p>

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
