const backgroundLocks = new WeakMap();
const openStacks = new WeakMap();

const focusableSelector = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

function isFocusable(element) {
  if (!element?.isConnected || !element.matches?.(focusableSelector)) return false;
  if (element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
  if (element.tabIndex < 0 || element.closest('[hidden], [inert]')) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== 'none' && style?.visibility !== 'hidden';
}

function focusableElements(root) {
  const elements = [];
  if (root.matches?.(focusableSelector)) elements.push(root);
  elements.push(...root.querySelectorAll(focusableSelector));
  return elements.filter(isFocusable);
}

function normalizeBackground(background) {
  if (!background) return [];
  if (background.nodeType === 1) return [background];
  if (typeof background[Symbol.iterator] === 'function') return [...background];
  throw new TypeError('createDialog: background must be an element or iterable of elements');
}

function lockBackground(element) {
  const current = backgroundLocks.get(element);
  if (current) {
    current.count += 1;
    return;
  }

  backgroundLocks.set(element, {
    count: 1,
    inert: Boolean(element.inert),
    inertAttribute: element.hasAttribute('inert'),
    ariaHidden: element.getAttribute('aria-hidden'),
  });
  element.inert = true;
  element.setAttribute('inert', '');
  element.setAttribute('aria-hidden', 'true');
}

function unlockBackground(element) {
  const state = backgroundLocks.get(element);
  if (!state) return;
  state.count -= 1;
  if (state.count > 0) return;

  element.inert = state.inert;
  if (state.inertAttribute) element.setAttribute('inert', '');
  else element.removeAttribute('inert');
  if (state.ariaHidden === null) element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden', state.ariaHidden);
  backgroundLocks.delete(element);
}

function validateDialog(element) {
  if (!element?.ownerDocument || element.nodeType !== 1) {
    throw new TypeError('createDialog: element must be a DOM element');
  }
  if (element.getAttribute('role') !== 'dialog') {
    throw new Error('createDialog: element must have role="dialog"');
  }

  const labelIds = element.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean) || [];
  if (labelIds.length === 0) {
    throw new Error('createDialog: dialog needs aria-labelledby');
  }
  for (const id of labelIds) {
    const matches = [...element.ownerDocument.querySelectorAll('[id]')]
      .filter(candidate => candidate.id === id);
    if (matches.length !== 1 || !element.contains(matches[0])) {
      throw new Error(`createDialog: label #${id} must uniquely identify an element inside the dialog`);
    }
  }
}

export function createDialog(element, { background } = {}) {
  validateDialog(element);
  const document = element.ownerDocument;
  const backgrounds = normalizeBackground(background);
  if (backgrounds.some(item => item === element || item.contains?.(element))) {
    throw new Error('createDialog: background cannot contain the dialog');
  }

  let open = false;
  let opener = null;
  let temporaryTabindex = false;
  const controller = { open: openDialog, close: closeDialog, get isOpen() { return open; } };

  function stack() {
    if (!openStacks.has(document)) openStacks.set(document, []);
    return openStacks.get(document);
  }

  function focusInitial() {
    const first = focusableElements(element)[0];
    if (first) {
      first.focus();
      return;
    }
    if (!element.hasAttribute('tabindex')) {
      element.tabIndex = -1;
      temporaryTabindex = true;
    }
    element.focus();
  }

  function openDialog(candidateOpener = document.activeElement) {
    if (open) return false;
    opener = isFocusable(candidateOpener) ? candidateOpener : null;
    for (const item of backgrounds) lockBackground(item);
    element.hidden = false;
    open = true;
    stack().push(controller);
    focusInitial();
    element.dispatchEvent(new document.defaultView.CustomEvent('dialog:open', {
      bubbles: true,
      detail: { opener },
    }));
    return true;
  }

  function restoreFocus() {
    if (isFocusable(opener)) {
      opener.focus();
      return;
    }
    for (const item of backgrounds) {
      const fallback = focusableElements(item)[0];
      if (fallback) {
        fallback.focus();
        return;
      }
    }
  }

  function closeDialog(reason = 'programmatic') {
    if (!open) return false;
    open = false;
    element.hidden = true;
    const activeStack = stack();
    const index = activeStack.lastIndexOf(controller);
    if (index !== -1) activeStack.splice(index, 1);
    for (const item of backgrounds) unlockBackground(item);
    if (temporaryTabindex) {
      element.removeAttribute('tabindex');
      temporaryTabindex = false;
    }
    restoreFocus();
    element.dispatchEvent(new document.defaultView.CustomEvent('dialog:close', {
      bubbles: true,
      detail: { reason },
    }));
    opener = null;
    return true;
  }

  document.addEventListener('keydown', event => {
    const activeStack = stack();
    if (!open || activeStack.at(-1) !== controller) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDialog('escape');
      return;
    }
    if (event.key !== 'Tab') return;

    const controls = focusableElements(element);
    if (controls.length === 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      element.focus();
      return;
    }

    const first = controls[0];
    const last = controls.at(-1);
    const active = document.activeElement;
    const outside = !element.contains(active);
    if (outside || (!event.shiftKey && active === last) || (event.shiftKey && active === first)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      (event.shiftKey ? last : first).focus();
    }
  });

  return controller;
}
