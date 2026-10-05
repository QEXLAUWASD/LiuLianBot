import { t, useLocale } from '../lib/i18n.mjs';
export function NotFoundPage() {
  useLocale();
  return (
    <main className="error-page" id="main-content">
      <h1>404</h1>
      <p>{t("Page not found")}</p>
      <a href="/" className="btn btn-primary">{t("Go Home")}</a>
    </main>
  );
}
