import {
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, useEffect, useId, useRef, useState,
} from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ChevronRight, Copy, Info, Search, X, XCircle,
} from 'lucide-react';
import type { Tone } from '../lib/domain';

/* --------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary', size, block, busy, icon, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: 'sm' | 'lg'; block?: boolean; busy?: boolean; icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}${size ? ` btn--${size}` : ''}${block ? ' btn--block' : ''} ${className}`.trim()}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label, active, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`icon-btn${active ? ' icon-btn--on' : ''} ${className}`.trim()}
      title={label}
      aria-label={label}
      {...rest}
    >
      {children}
    </button>
  );
}

/* --------------------------------- Badge ---------------------------------- */

export function Badge({ tone = 'neutral', large, title, children }: {
  tone?: Tone; large?: boolean; title?: string; children: ReactNode;
}) {
  return (
    <span className={`badge badge--${tone}${large ? ' badge--lg' : ''}`} title={title}>
      {children}
    </span>
  );
}

/** Status badge that also communicates meaning via an icon, not colour alone. */
export function StatusBadge({ tone, label, title, large }: {
  tone: Tone; label: string; title?: string; large?: boolean;
}) {
  const Icon = tone === 'success' ? CheckCircle2
    : tone === 'danger' ? XCircle
      : tone === 'warning' ? AlertTriangle
        : tone === 'info' ? Info : null;
  return (
    <Badge tone={tone} large={large} title={title}>
      {Icon ? <Icon size={12} aria-hidden /> : null}
      {label}
    </Badge>
  );
}

/* ---------------------------------- Card ---------------------------------- */

export function Card({ title, subtitle, actions, flush, children, id }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode;
  flush?: boolean; children?: ReactNode; id?: string;
}) {
  const headingId = useId();
  return (
    <section className="card" id={id} aria-labelledby={title ? headingId : undefined}>
      {title ? (
        <header className="card__header">
          <div>
            <h2 className="card__title" id={headingId}>{title}</h2>
            {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className={`card__body${flush ? ' card__body--flush' : ''}`}>{children}</div> : null}
    </section>
  );
}

/* -------------------------------- Callout --------------------------------- */

export function Callout({ tone = 'neutral', title, children }: {
  tone?: Tone; title?: ReactNode; children?: ReactNode;
}) {
  const Icon = tone === 'success' ? CheckCircle2
    : tone === 'danger' ? XCircle
      : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`callout callout--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={15} aria-hidden />
      <div>
        {title ? <div className="callout__title">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------- Fields --------------------------------- */

export function Field({ label, hint, error, htmlFor, children }: {
  label: ReactNode; hint?: ReactNode; error?: ReactNode; htmlFor?: string; children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
      {error ? <span className="field__error" role="alert">{error}</span> : null}
    </div>
  );
}

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`select ${props.className ?? ''}`.trim()} />
);

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`input ${props.className ?? ''}`.trim()} />
);

export function SearchInput({ value, onChange, placeholder, label }: {
  value: string; onChange: (value: string) => void; placeholder?: string; label: string;
}) {
  return (
    <div className="search">
      <Search size={15} aria-hidden />
      <input
        type="search"
        className="input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <IconButton label="Suche zurücksetzen" className="search__clear" onClick={() => onChange('')}>
          <X size={14} />
        </IconButton>
      ) : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, title, note, tone, disabled }: {
  checked: boolean; onChange: (value: boolean) => void;
  title: ReactNode; note?: ReactNode; tone?: 'warning'; disabled?: boolean;
}) {
  return (
    <label className="checkbox" data-tone={tone}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="checkbox__text">
        {title}
        {note ? <span className="checkbox__note">{note}</span> : null}
      </span>
    </label>
  );
}

/* --------------------------------- States --------------------------------- */

export function EmptyState({ icon, title, text, action }: {
  icon?: ReactNode; title: string; text?: string; action?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state__icon">{icon ?? <Search size={20} aria-hidden />}</div>
      <p className="state__title">{title}</p>
      {text ? <p className="state__text">{text}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Daten konnten nicht geladen werden', text, onRetry }: {
  title?: string; text?: string; onRetry?: () => void;
}) {
  return (
    <div className="state state--error" role="alert">
      <div className="state__icon"><XCircle size={20} aria-hidden /></div>
      <p className="state__title">{title}</p>
      {text ? <p className="state__text">{text}</p> : null}
      {onRetry ? <Button variant="secondary" onClick={onRetry}>Erneut versuchen</Button> : null}
    </div>
  );
}

export function LoadingState({ rows = 5, label = 'Daten werden geladen' }: { rows?: number; label?: string }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--s-3)', padding: 'var(--s-5)' }} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ width: `${100 - index * 7}%` }} />
      ))}
    </div>
  );
}

/* -------------------------------- Copyable -------------------------------- */

export function CopyValue({ value, mono = true, onCopied }: {
  value: string; mono?: boolean; onCopied?: (value: string) => void;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      onCopied?.(value);
      timer.current = setTimeout(() => setDone(false), 1400);
    } catch {
      onCopied?.(value);
    }
  };

  return (
    <span className="copy-cell">
      <span className={mono ? 'mono' : undefined}>{value}</span>
      <IconButton label={`${value} kopieren`} active={done} onClick={copy}>
        {done ? <Check size={13} /> : <Copy size={13} />}
      </IconButton>
    </span>
  );
}

/* -------------------------------- Glossary -------------------------------- */

export function Term({ term, definition, children }: {
  term: string; definition: string; children?: ReactNode;
}) {
  return (
    <abbr className="term" title={`${term}: ${definition}`} aria-label={`${term}: ${definition}`}>
      {children ?? term}
    </abbr>
  );
}

/* ------------------------------- Disclosure ------------------------------- */

export function Disclosure({ summary, children, open }: {
  summary: ReactNode; children: ReactNode; open?: boolean;
}) {
  return (
    <details className="disclosure" open={open}>
      <summary><ChevronRight size={14} aria-hidden />{summary}</summary>
      <div className="disclosure__content">{children}</div>
    </details>
  );
}

/* --------------------------- Definition list ------------------------------ */

export function DefinitionList({ items }: { items: Array<{ term: ReactNode; value: ReactNode }> }) {
  return (
    <dl className="dl">
      {items.map((item, index) => (
        <div key={index} style={{ display: 'contents' }}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
