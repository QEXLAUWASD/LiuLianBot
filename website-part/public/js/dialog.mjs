const backgroundLocks = new WeakMap();
const documentStates = new WeakMap();

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
  const elements = background.nodeType === 1
    ? [background]
    : typeof background[Symbol.iterator] === 'function' ? [...background] : null;
  if (!elements?.every(element => element?.nodeType === 1)) {
    throw new TypeError('createDialog: background must be an element or iterable of elements');
  }
  return [...new Set(elements)];
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
  const saved = backgroundLocks.get(element);
  if (!saved) return;
  saved.count -= 1;
  if (saved.count > 0) return;

  element.inert = saved.inert;
  if (saved.inertAttribute) element.setAttribute('inert', '');
  else element.removeAttribute('inert');
  if (saved.ariaHidden === null) element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden', saved.ariaHidden);
  backgroundLocks.delete(element);
}

function captureAccessibility(element) {
  return {
    inert: Boolean(element.inert),
    inertAttribute: element.hasAttribute('inert'),
    ariaHidden: element.getAttribute('aria-hidden'),
    ariaModal: element.getAttribute('aria-modal'),
  };
}

function restoreAccessibility(element, saved) {
  element.inert = saved.inert;
  if (saved.inertAttribute) element.setAttribute('inert', '');
  else element.removeAttribute('inert');
  if (saved.ariaHidden === null) element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden', saved.ariaHidden);
  if (saved.ariaModal === null) element.removeAttribute('aria-modal');
  else element.setAttribute('aria-modal', saved.ariaModal);
}

function makeTopAccessible(element) {
  element.inert = false;
  element.removeAttribute('inert');
  element.removeAttribute('aria-hidden');
  element.setAttribute('aria-modal', 'true');
}

function suspendEntry(entry) {
  if (entry.suspension) return;
  entry.suspension = captureAccessibility(entry.element);
  entry.element.inert = true;
  entry.element.setAttribute('inert', '');
  entry.element.setAttribute('aria-hidden', 'true');
  entry.element.setAttribute('aria-modal', 'false');
}

function resumeEntry(entry) {
  if (!entry.suspension) return;
  restoreAccessibility(entry.element, entry.suspension);
  entry.suspension = null;
}

function ensureDocumentState(document) {
  const existing = documentStates.get(document);
  if (existing) return existing;

  const state = { stack: [], session: null, redirectingFocus: false };
  document.addEventListener('focusin', event => {
    const top = state.stack.at(-1);
    if (!top || top.element.contains(event.target) || state.redirectingFocus) return;
    state.redirectingFocus = true;
    try {
      top.focusInitial();
    } finally {
      state.redirectingFocus = false;
    }
  }, true);
  document.addEventListener('keydown', event => {
    const top = state.stack.at(-1);
    if (!top) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      top.close('escape');
      return;
    }
    if (event.key === 'Tab') top.trapTab(event);
  });
  documentStates.set(document, state);
  return state;
}

function validateDialog(element) {
  if (!element?.ownerDocument || element.nodeType !== 1) {
    throw new TypeError('createDialog: element must be a DOM element');
  }
  if (element.getAttribute('role') !== 'dialog') {
    throw new Error('createDialog: element must have role="dialog"');
  }
  if (element.parentElement?.closest('[role="dialog"]') || element.querySelector('[role="dialog"]')) {
    throw new Error('createDialog: nested dialog structures are not supported');
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
  const state = ensureDocumentState(document);
  const backgrounds = normalizeBackground(background);
  if (backgrounds.some(item => item === element || item.contains(element) || element.contains(item))) {
    throw new Error('createDialog: background and dialog must not contain each other');
  }

  let open = false;
  let opener = null;
  let activation = null;
  let temporaryTabindex = false;

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

  function trapTab(event) {
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
  }

  const entry = {
    element,
    suspension: null,
    close: closeDialog,
    focusInitial,
    trapTab,
  };
  const controller = { open: openDialog, close: closeDialog, get isOpen() { return open; } };

  function openDialog(candidateOpener = document.activeElement) {
    if (open) return false;
    opener = isFocusable(candidateOpener) ? candidateOpener : null;
    if (state.stack.length === 0) {
      state.session = { opener, backgrounds: [...backgrounds] };
    }
    activation = captureAccessibility(element);
    const previousTop = state.stack.at(-1);
    if (previousTop) suspendEntry(previousTop);
    for (const item of backgrounds) lockBackground(item);
    element.hidden = false;
    makeTopAccessible(element);
    open = true;
    state.stack.push(entry);
    focusInitial();
    element.dispatchEvent(new document.defaultView.CustomEvent('dialog:open', {
      bubbles: true,
      detail: { opener },
    }));
    return true;
  }

  function focusExternalFallback(preferred, fallbackBackgrounds) {
    if (isFocusable(preferred)) {
      preferred.focus();
      return;
    }
    for (const item of fallbackBackgrounds) {
      const fallback = focusableElements(item)[0];
      if (fallback) {
        fallback.focus();
        return;
      }
    }

    const body = document.body;
    if (!body?.isConnected || body.closest('[hidden], [inert]')) return;
    const tabindex = body.getAttribute('tabindex');
    body.tabIndex = -1;
    body.focus();
    if (tabindex === null) body.removeAttribute('tabindex');
    else body.setAttribute('tabindex', tabindex);
  }

  function closeDialog(reason = 'programmatic') {
    if (!open) return false;
    const index = state.stack.indexOf(entry);
    const wasTop = index === state.stack.length - 1;
    state.stack.splice(index, 1);
    open = false;
    element.hidden = true;
    resumeEntry(entry);
    restoreAccessibility(element, activation);
    activation = null;
    for (const item of backgrounds) unlockBackground(item);
    if (temporaryTabindex) {
      element.removeAttribute('tabindex');
      temporaryTabindex = false;
    }

    const newTop = state.stack.at(-1);
    if (wasTop && newTop) {
      resumeEntry(newTop);
      if (isFocusable(opener) && newTop.element.contains(opener)) opener.focus();
      else newTop.focusInitial();
    } else if (wasTop) {
      const session = state.session;
      state.session = null;
      focusExternalFallback(session?.opener, session?.backgrounds || []);
    }

    element.dispatchEvent(new document.defaultView.CustomEvent('dialog:close', {
      bubbles: true,
      detail: { reason },
    }));
    opener = null;
    return true;
  }

  return controller;
}
