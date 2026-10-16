import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

/** App-level patterns shared by every page: one place defines how a page header, banner, stat, field and empty state look. */

export function PageHeader({ title, description, actions, badge }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-primary">{title}{badge}</h1>
        {description && <p className="mt-1.5 max-w-[680px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

type Tone = 'ok' | 'wait' | 'act' | 'err' | 'info';
const BANNER: Record<Tone, string> = {
  ok: 'border-ok-line bg-ok-soft text-ok',
  wait: 'border-wait-line bg-wait-soft text-wait',
  act: 'border-act-line bg-act-soft text-act',
  err: 'border-err-line bg-err-soft text-err',
  info: 'border-primary-line bg-primary-soft text-accent-foreground',
};
export function Banner({ tone = 'info', icon, children, action, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'err' ? 'alert' : 'status'} className={cn('mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 animate-rise', BANNER[tone], className)}>
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function StatCard({ value, total, label, tone, onClick, className }: { value: ReactNode; total?: ReactNode; label: ReactNode; tone?: 'ok' | 'act'; onClick?: () => void; className?: string }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('grid gap-0.5 rounded-xl border bg-card p-4 text-left shadow-card', onClick && 'transition hover:border-act-line hover:shadow-lift', className)}>
      <b className={cn('text-[28px] leading-[1.1] font-semibold tracking-tight', tone === 'ok' && 'text-ok', tone === 'act' && 'text-act')}>
        {value}{total !== undefined && <small className="ml-1 text-base font-medium text-muted-foreground">/ {total}</small>}
      </b>
      <span className="text-[13.5px] text-muted-foreground">{label}</span>
    </Comp>
  );
}

export function Field({ label, error, hint, children, className }: { label: ReactNode; error?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label className="text-[13px] text-muted-foreground">{label}</Label>
      {children}
      {error ? <span className="text-xs text-err">{error}</span> : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-7 text-center text-muted-foreground', className)}>{children}</div>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[15px] font-semibold text-muted-foreground">{children}</h2>{aside}</div>;
}

export const initials = (name: string) => name.split(/[\s.]+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return <span className={cn('grid shrink-0 place-items-center rounded-full bg-accent font-bold text-primary', size === 'lg' ? 'size-[38px] text-[13.5px]' : 'size-[30px] text-[11.5px]')}>{initials(name)}</span>;
}
