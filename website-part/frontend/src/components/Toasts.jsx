export function Toasts({ toasts, onDismiss }) {
  return toasts.map(toast => (
    <div
      key={toast.id}
      className={`toast toast-${toast.type}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onClick={() => onDismiss?.(toast.id)}
    >
      {toast.message}
    </div>
  ));
}
