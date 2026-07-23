import { createDialog } from './dialog.mjs';

const initializedDocuments = new WeakMap();

export function setupAdminDialogs(root = document) {
  if (initializedDocuments.has(root)) return initializedDocuments.get(root);

  const background = root.querySelectorAll('nav, main');
  const dialogs = new Map();
  for (const element of root.querySelectorAll('[role="dialog"]')) {
    const controller = createDialog(element, { background });
    dialogs.set(element.id, controller);

    for (const button of element.querySelectorAll('[data-dialog-close]')) {
      button.addEventListener('click', () => controller.close('close-button'));
    }
    element.addEventListener('click', event => {
      if (event.target === element) controller.close('backdrop');
    });
  }

  const api = {
    open(id, opener) {
      return dialogs.get(id)?.open(opener) ?? false;
    },
    close(id, reason = 'programmatic') {
      return dialogs.get(id)?.close(reason) ?? false;
    },
  };
  initializedDocuments.set(root, api);
  if (root.defaultView) root.defaultView.adminDialogs = api;
  return api;
}

if (typeof document !== 'undefined') setupAdminDialogs(document);
