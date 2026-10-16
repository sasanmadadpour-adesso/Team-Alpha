import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Key } from './i18n';

/** In-app confirmation (shadcn AlertDialog). Native window.confirm is not shown in every browser host. */
interface Pending { title: string; body: string; resolve: (ok: boolean) => void; cancel: string; confirm: string }
let open: ((p: Pending) => void) | undefined;

export function confirmDialog(message: string, t?: (k: Key | string) => string): Promise<boolean> {
  const [title, ...rest] = message.split('\n\n');
  return new Promise((resolve) => (open ? open({ title, body: rest.join(' '), resolve, cancel: t?.('common.cancel') ?? 'Cancel', confirm: t?.('common.confirm') ?? 'Confirm' }) : resolve(false)));
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending>();
  useEffect(() => { open = setPending; return () => { open = undefined; }; }, []);
  const close = (ok: boolean) => { pending?.resolve(ok); setPending(undefined); };
  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          {pending?.body && <AlertDialogDescription>{pending.body}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{pending?.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)}>{pending?.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
