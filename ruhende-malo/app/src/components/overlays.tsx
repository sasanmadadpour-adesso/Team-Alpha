import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button, IconButton } from './primitives';
import type { Tone } from '../lib/domain';

/** Traps focus inside an overlay and restores it on close. */
function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previous.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = node?.querySelector<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter((item) => item.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      previous.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

/* --------------------------------- Drawer --------------------------------- */

export function Drawer({ open, onClose, title, subtitle, footer, children }: {
  open: boolean; onClose: () => void;
  title: ReactNode; subtitle?: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  const ref = useOverlay(open, onClose);
  if (!open) return null;

  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} ref={ref}>
        <header className="drawer__header">
          <div style={{ minWidth: 0 }}>
            <h2 className="drawer__title">{title}</h2>
            {subtitle ? <p className="drawer__subtitle">{subtitle}</p> : null}
          </div>
          <IconButton label="Schließen" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="drawer__body">{children}</div>
        {footer ? <footer className="drawer__footer">{footer}</footer> : null}
      </aside>
    </>,
    document.body,
  );
}

/* ------------------------------ Confirmation ------------------------------ */

export function ConfirmationDialog({
  open, title, confirmLabel, cancelLabel = 'Abbrechen', tone = 'info', busy, onConfirm, onCancel, children,
}: {
  open: boolean; title: string; confirmLabel: string; cancelLabel?: string;
  tone?: Tone; busy?: boolean; onConfirm: () => void; onCancel: () => void; children?: ReactNode;
}) {
  const close = useCallback(() => { if (!busy) onCancel(); }, [busy, onCancel]);
  const ref = useOverlay(open, close);
  if (!open) return null;

  return createPortal(
    <div className="dialog-backdrop" onClick={close}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog__header"><h2 className="dialog__title">{title}</h2></header>
        <div className="dialog__body">{children}</div>
        <footer className="dialog__footer">
          <Button variant="ghost" onClick={close} disabled={busy}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} busy={busy} disabled={busy}>
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------- Toasts --------------------------------- */

export interface Toast { id: number; tone: Tone; title: string; text?: string }

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CheckCircle2
          : toast.tone === 'danger' ? XCircle
            : toast.tone === 'warning' ? AlertTriangle : Info;
        return (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <Icon size={16} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="toast__title">{toast.title}</div>
              {toast.text ? <div className="toast__text">{toast.text}</div> : null}
            </div>
            <IconButton label="Meldung schließen" onClick={() => onDismiss(toast.id)}>
              <X size={13} />
            </IconButton>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
