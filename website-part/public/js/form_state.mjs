export async function withBusyControl(control, operation) {
  if (control.disabled) return undefined;

  const previousAriaBusy = control.getAttribute('aria-busy');
  control.disabled = true;
  control.setAttribute('aria-busy', 'true');

  try {
    return await operation();
  } finally {
    control.disabled = false;
    if (previousAriaBusy === null) {
      control.removeAttribute('aria-busy');
    } else {
      control.setAttribute('aria-busy', previousAriaBusy);
    }
  }
}
