import { KEY_CODES } from './rdp_keys.mjs';

export function pointerPosition(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return [
    Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * canvas.width / rect.width))),
    Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * canvas.height / rect.height))),
  ];
}

export function installInput(canvas, send) {
  const view = canvas.ownerDocument.defaultView;
  const bindings = [];
  const keys = new Set();
  const buttons = new Set();
  let point = [0, 0];
  const on = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    bindings.push(() => target.removeEventListener(name, handler, options));
  };
  const releaseButtons = () => {
    for (const button of buttons) send('mouse', ...point, button, false);
    buttons.clear();
  };
  const release = () => {
    for (const key of keys) send('scancode', key, false);
    keys.clear();
    releaseButtons();
  };
  for (const name of ['pointerdown', 'pointermove', 'pointerup']) {
    on(canvas, name, event => {
      const position = pointerPosition(canvas, event);
      if (!position) return;
      point = position;
      const button = [1, 3, 2][event.button];
      if (name === 'pointerdown') {
        canvas.focus({ preventScroll: true });
        if (!button) return;
        canvas.setPointerCapture?.(event.pointerId);
        buttons.add(button);
      }
      if (name === 'pointerup') {
        if (!buttons.delete(button)) return;
      }
      send('mouse', ...point, name === 'pointermove' ? 0 : button, name === 'pointerdown');
      event.preventDefault();
    });
  }
  on(canvas, 'pointercancel', release);
  on(canvas, 'lostpointercapture', releaseButtons);
  on(canvas, 'contextmenu', event => event.preventDefault());
  on(canvas, 'wheel', event => {
    const position = pointerPosition(canvas, event);
    if (!position) return;
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontal ? event.deltaX : event.deltaY;
    if (!delta) return;
    send('wheel', ...position, Math.min(255, Math.max(1, Math.round(Math.abs(delta)))), delta > 0, horizontal);
    event.preventDefault();
  }, { passive: false });
  for (const name of ['keydown', 'keyup']) {
    on(canvas, name, event => {
      if (event.isComposing) return;
      const code = KEY_CODES[event.code];
      if (!code) return;
      const pressed = name === 'keydown';
      if (pressed) keys.add(code);
      else if (!keys.delete(code)) return;
      send('scancode', code, pressed);
      event.preventDefault();
    });
  }
  on(canvas, 'blur', release);
  on(view, 'blur', release);
  on(canvas.ownerDocument, 'visibilitychange', () => {
    if (canvas.ownerDocument.hidden) release();
  });
  return () => { release(); bindings.forEach(remove => remove()); };
}
