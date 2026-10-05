import { t, useLocale } from '../lib/i18n.mjs';
export function Toasts({ toasts, onDismiss }) {
  useLocale();
  return (
    <div className="toast-stack">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          <span>{t(toast.message)}</span>
          {onDismiss && (
            <button
              className="toast-dismiss"
              type="button"
              aria-label={t("Dismiss notification")}
              onClick={() => onDismiss(toast.id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
