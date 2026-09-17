export function StatusMessage({
  message = '',
  tone = '',
  className = 'status-msg',
  role = 'status',
  live = 'polite',
  ...rest
}) {
  return (
    <div
      className={`${className}${tone ? ` status-${tone}` : ''}`}
      role={role}
      aria-live={live}
      {...rest}
    >
      {message}
    </div>
  );
}
