import { t, useLocale } from '../lib/i18n.mjs';
export function StatusMessage({
  message = '',
  tone = '',
  className = 'status-msg',
  role = 'status',
  live = 'polite',
  ...rest
}) {
  useLocale();
  return (
    <div
      className={`${className}${tone ? ` status-${tone}` : ''}`}
      role={role}
      aria-live={live}
      {...rest}
    >
      {t(message)}
    </div>
  );
}
