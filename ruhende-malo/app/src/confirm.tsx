import { useEffect, useState } from 'react';
import type { Key } from './i18n';

/**
 * In-app confirmation dialog. Native window.confirm is not shown in every browser host
 * (embedded preview panes return false immediately), so confirmations render in the page.
 */
interface Pending { message: string; resolve: (ok: boolean) => void; cancel: string; confirm: string }
let open: ((p: Pending) => void) | undefined;

export function confirmDialog(message: string, t?: (k: Key | string) => string): Promise<boolean> {
  return new Promise((resolve) => (open ? open({ message, resolve, cancel: t?.('common.cancel') ?? 'Cancel', confirm: t?.('common.confirm') ?? 'Confirm' }) : resolve(false)));
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending>();
  useEffect(() => { open = setPending; return () => { open = undefined; }; }, []);
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { pending.resolve(false); setPending(undefined); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);
  if (!pending) return null;
  const close = (ok: boolean) => { pending.resolve(ok); setPending(undefined); };
  const [title, ...rest] = pending.message.split('\n\n');
  return (
    <div className="modal-backdrop" onClick={() => close(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {rest.length > 0 && <p>{rest.join(' ')}</p>}
        <div className="buttons">
          <button className="btn secondary" onClick={() => close(false)}>{pending.cancel}</button>
          <button className="btn primary" autoFocus onClick={() => close(true)}>{pending.confirm}</button>
        </div>
      </div>
    </div>
  );
}
