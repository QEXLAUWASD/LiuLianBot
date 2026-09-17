import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createDialog } from '../lib/dialog.mjs';

// React wrapper around the focus-trapping dialog controller in `lib/dialog.mjs`.
// Modals are portalled to <body> so the navigation and <main> stay inert
// siblings, exactly like the previous markup.
export function Modal({
  open,
  labelledBy,
  className = '',
  overlayClassName = 'modal-overlay',
  onClose,
  children,
}) {
  const overlayRef = useRef(null);
  const controllerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const reactDriven = useRef(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    const element = overlayRef.current;
    const controller = createDialog(element, {
      background: element.ownerDocument.querySelectorAll('nav, main'),
    });
    controllerRef.current = controller;

    const handleDialogClose = event => {
      if (reactDriven.current) return;
      onCloseRef.current?.(event.detail?.reason || 'dismissed');
    };
    const handleBackdrop = event => {
      if (event.target === element) onCloseRef.current?.('backdrop');
    };
    element.addEventListener('dialog:close', handleDialogClose);
    element.addEventListener('click', handleBackdrop);

    return () => {
      element.removeEventListener('dialog:close', handleDialogClose);
      element.removeEventListener('click', handleBackdrop);
      controller.close('unmount');
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;

    if (open && !controller.isOpen) {
      controller.open(document.activeElement);
    } else if (!open && controller.isOpen) {
      reactDriven.current = true;
      try {
        controller.close('programmatic');
      } finally {
        reactDriven.current = false;
      }
    }
  }, [open]);

  return createPortal(
    <div
      ref={overlayRef}
      className={overlayClassName}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      hidden={!open}
      data-modal=""
    >
      <div className={className ? `modal ${className}` : 'modal'}>{children}</div>
    </div>,
    document.body,
  );
}
