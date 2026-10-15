import { useEffect, useState } from 'react';

/**
 * In-app confirmation dialog. Native window.confirm is not shown in every browser host
 * (e.g. embedded preview panes return false immediately), so confirmations render in the page.
 */
interface Pending { message: string; resolve: (ok: boolean) => void }
let open: ((p: Pending) => void) | undefined;

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => (open ? open({ message, resolve }) : resolve(false)));
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending>();
  useEffect(() => { open = setPending; return () => { open = undefined; }; }, []);
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!pending) return null;
  const close = (ok: boolean) => { pending.resolve(ok); setPending(undefined); };
  const [title, ...rest] = pending.message.split('\n\n');
  return (
    <div className="modal-backdrop" onClick={() => close(false)}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {rest.length > 0 && <p>{rest.join(' ')}</p>}
        <div className="buttons">
          <button className="secondary" onClick={() => close(false)}>Cancel</button>
          <button className="primary" autoFocus onClick={() => close(true)}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
