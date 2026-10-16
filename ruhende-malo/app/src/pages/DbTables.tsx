import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, KeyRound, Link2, Lock, Search } from 'lucide-react';
import { Banner, EmptyState } from '@/components/app/patterns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { loadDbRows, type DbCatalog, type DbRowPage, type DbTable } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../ui';
import { GROUP_ICON, GROUP_ORDER } from './DbFlow';

/** CAP bookkeeping columns (aspect managed) go last, keys first, so the business columns are in view. */
const MANAGED = ['createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'];
const readingOrder = (cols: DbTable['columns']) => [...cols.filter((c) => c.key), ...cols.filter((c) => !c.key && !MANAGED.includes(c.name)), ...cols.filter((c) => !c.key && MANAGED.includes(c.name))];

/** Every table of the database: list, records (paged, sortable, searchable), columns and shared keys. Read-only. */
export function DbTables({ catalog, selected, onSelect, touched }: { catalog: DbCatalog; selected: string; onSelect: (name: string) => void; touched: number }) {
  const { t, lang } = useI18n();
  const [find, setFind] = useState('');
  const nf = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US');
  const max = Math.max(1, ...catalog.tables.map((x) => x.rows));
  const table = catalog.tables.find((x) => x.name === selected) ?? catalog.tables[0];
  const shown = catalog.tables.filter((x) => !find || x.name.toLowerCase().includes(find.toLowerCase()) || t(`db.t.${x.name}`).toLowerCase().includes(find.toLowerCase()));

  return (
    <Card id="db-browser" className="scroll-mt-20 grid grid-cols-[272px_minmax(0,1fr)] gap-0 overflow-clip py-0 shadow-card max-[900px]:grid-cols-1">
      {/* the list stays in view and scrolls on its own, so a short table never leaves an empty column */}
      <aside className="sticky top-[56px] max-h-[calc(100vh-56px)] self-start overflow-y-auto border-r bg-muted/30 p-3 max-[900px]:static max-[900px]:max-h-[320px] max-[900px]:border-r-0 max-[900px]:border-b">
        <h2 className="px-1 pb-2 text-[15px]">{t('db.browser.title')}</h2>
        <div className="relative mb-2">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder={t('db.browser.find')} aria-label={t('db.browser.find')} className="h-8 bg-card pl-8 text-[13px]" />
        </div>
        {GROUP_ORDER.map((g) => {
          const list = shown.filter((x) => x.group === g);
          if (!list.length) return null;
          const Icon = GROUP_ICON[g];
          return (
            <div key={g} className="mb-2">
              <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"><Icon size={12} />{t(`db.g.${g}`)}</div>
              {list.map((x) => (
                <button key={x.name} onClick={() => onSelect(x.name)} aria-current={x.name === table?.name ? 'true' : undefined}
                  className={cn('group grid w-full gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent', x.name === table?.name && 'bg-card shadow-card ring-1 ring-primary-line')}>
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('truncate font-mono text-[12.5px]', x.name === table?.name && 'font-medium text-primary')}>{x.name}</span>
                    <span className="text-[11.5px] text-muted-foreground tabular-nums">{nf.format(x.rows)}</span>
                  </span>
                  {/* log scale: 17 rows and 96 360 rows both stay visible */}
                  <span className="block h-[3px] overflow-hidden rounded-full bg-border/70">
                    <span className="block h-full rounded-full bg-primary/50 transition-[width] duration-500" style={{ width: `${x.rows ? Math.max(4, (Math.log10(x.rows + 1) / Math.log10(max + 1)) * 100) : 0}%` }} />
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </aside>
      {table ? <TableDetail key={table.name} table={table} catalog={catalog} onSelect={onSelect} touched={touched} /> : <EmptyState>{t('db.rows.empty')}</EmptyState>}
    </Card>
  );
}

function TableDetail({ table, catalog, onSelect, touched }: { table: DbTable; catalog: DbCatalog; onSelect: (name: string) => void; touched: number }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US');
  const Icon = GROUP_ICON[table.group] ?? GROUP_ICON.other;
  const keys = table.columns.filter((c) => c.key).map((c) => c.name);
  const hidden = table.columns.filter((c) => c.redacted).map((c) => c.name);
  return (
    <div className="min-w-0 p-5 max-[640px]:p-4">
      <header className="mb-4 grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-mono text-[20px] font-semibold tracking-tight text-primary">{table.name}</h2>
          <Badge variant="info" className="gap-1.5"><Icon size={12} />{t(`db.g.${table.group}`)}</Badge>
        </div>
        <p className="max-w-[760px] text-muted-foreground">{t(`db.t.${table.name}`)}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <span>{t('db.meta', { r: nf.format(table.rows), c: table.columns.length })}</span>
          {keys.length > 0 && <span className="inline-flex items-center gap-1.5"><KeyRound size={13} />{t('db.meta.key')}: <span className="font-mono text-[12px] text-foreground/80">{keys.join(', ')}</span></span>}
          {hidden.length > 0 && <span className="inline-flex items-center gap-1.5 text-wait"><Lock size={13} />{t('db.redacted.note', { c: hidden.join(', ') })}</span>}
        </div>
      </header>
      <Tabs defaultValue="rows">
        <TabsList>
          <TabsTrigger value="rows">{t('db.tab.rows')}</TabsTrigger>
          <TabsTrigger value="cols">{t('db.tab.cols')} <span className="text-muted-foreground">{table.columns.length}</span></TabsTrigger>
          <TabsTrigger value="links">{t('db.tab.links')} <span className="text-muted-foreground">{new Set(table.links.flatMap((l) => l.tables)).size}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="rows" className="mt-3"><Rows table={table} touched={touched} /></TabsContent>
        <TabsContent value="cols" className="mt-3"><Columns table={table} /></TabsContent>
        <TabsContent value="links" className="mt-3"><Links table={table} catalog={catalog} onSelect={onSelect} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- records ---------------- */
function Rows({ table, touched }: { table: DbTable; touched: number }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US');
  const [top, setTop] = useState(50);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<{ col: string; desc: boolean }>();
  const [page, setPage] = useState<DbRowPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [fresh, setFresh] = useState(false);
  const [record, setRecord] = useState<Record<string, unknown>>();
  const seen = useRef(touched);

  useEffect(() => { const id = setTimeout(() => { setTerm(search.trim()); setSkip(0); }, 300); return () => clearTimeout(id); }, [search]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    loadDbRows(table.name, { top, skip, search: term || undefined, orderBy: sort?.col, desc: sort?.desc })
      .then((p) => { if (live) { setPage(p); setError(undefined); } })
      .catch((e) => { if (live) setError(errorText(t, e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [table.name, top, skip, term, sort, t]);
  // A write to this table elsewhere (another tab, the pipeline, an API client) refreshes the page in place.
  useEffect(() => {
    if (seen.current === touched) return;
    seen.current = touched;
    let live = true;
    loadDbRows(table.name, { top, skip, search: term || undefined, orderBy: sort?.col, desc: sort?.desc })
      .then((p) => { if (live) { setPage(p); setFresh(true); setTimeout(() => live && setFresh(false), 1600); } })
      .catch(() => undefined);
    return () => { live = false; };
  }, [touched]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = useMemo(() => readingOrder(table.columns), [table.columns]);
  const total = page?.total ?? 0;
  const toggleSort = (col: string) => { setSkip(0); setSort((s) => (s?.col !== col ? { col, desc: false } : s.desc ? undefined : { col, desc: true })); };

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('db.rows.search')} aria-label={t('db.rows.search')} className="h-8 pl-8 text-[13px]" />
        </div>
        {fresh && <Badge variant="ok" className="animate-pop"><span className="size-1.5 rounded-full bg-current" />{t('db.rows.updated')}</Badge>}
        <span className="text-[13px] text-muted-foreground tabular-nums">{total ? t('db.rows.range', { a: nf.format(skip + 1), b: nf.format(Math.min(skip + top, total)), n: nf.format(total) }) : ''}</span>
        <Select value={String(top)} onValueChange={(v) => { setTop(Number(v)); setSkip(0); }}>
          <SelectTrigger size="sm" className="w-[118px]" aria-label={t('db.rows.perPage')}><SelectValue /></SelectTrigger>
          <SelectContent>{[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} {t('db.rows.perPage')}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label={t('db.rows.prev')} title={t('db.rows.prev')} disabled={skip === 0 || loading} onClick={() => setSkip(Math.max(0, skip - top))}><ChevronLeft /></Button>
          <Button variant="outline" size="icon-sm" aria-label={t('db.rows.next')} title={t('db.rows.next')} disabled={skip + top >= total || loading} onClick={() => setSkip(skip + top)}><ChevronRight /></Button>
        </div>
      </div>
      {error && <Banner tone="err">{error}</Banner>}
      <div className={cn('overflow-hidden rounded-lg border transition-opacity', loading && page && 'opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {cols.map((c) => (
                <TableHead key={c.name} className="h-9 px-3">
                  <button onClick={() => toggleSort(c.name)} title={t('db.rows.sort', { c: c.name })} className="inline-flex items-center gap-1 font-mono text-[11.5px] font-semibold text-muted-foreground hover:text-foreground">
                    {c.key && <KeyRound size={11} className="text-primary" />}{c.redacted && <Lock size={11} className="text-wait" />}{c.name}
                    {sort?.col === c.name ? (sort.desc ? <ArrowDown size={12} className="text-primary" /> : <ArrowUp size={12} className="text-primary" />) : <ArrowUpDown size={11} className="opacity-40" />}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!page && loading && Array.from({ length: 6 }, (_, i) => <TableRow key={i}><TableCell colSpan={cols.length} className="px-3"><span className="block h-4 animate-pulse rounded bg-muted" /></TableCell></TableRow>)}
            {page?.rows.map((r, i) => (
              <TableRow key={`${skip}-${i}`} onClick={() => setRecord(r)} className="cursor-pointer">
                {cols.map((c) => <TableCell key={c.name} className="max-w-[300px] px-3 py-1.5 font-mono text-[12px]"><Value value={r[c.name]} redacted={c.redacted} /></TableCell>)}
              </TableRow>
            ))}
            {page && page.rows.length === 0 && <TableRow><TableCell colSpan={cols.length}><EmptyState>{t('db.rows.empty')}</EmptyState></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Sheet open={!!record} onOpenChange={(o) => { if (!o) setRecord(undefined); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[540px]">
          <SheetHeader className="gap-1 border-b px-6 py-4 pr-14">
            <SheetTitle className="font-mono text-[18px] font-semibold text-primary">{table.name}</SheetTitle>
            <SheetDescription className="text-[13px]">{t('db.record')}{record && cols.some((c) => c.key) ? ` · ${cols.filter((c) => c.key).map((c) => String(record[c.name] ?? '')).join(' · ')}` : ''}</SheetDescription>
          </SheetHeader>
          {record && (
            <dl className="m-0 grid gap-0 px-6 py-3">
              {cols.map((c) => (
                <div key={c.name} className="grid gap-1 border-b py-2.5 last:border-0">
                  <dt className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    {c.key && <KeyRound size={12} className="text-primary" />}<span className="font-mono font-medium text-foreground/80">{c.name}</span><span className="font-mono">{c.type}</span>
                  </dt>
                  <dd className="m-0 font-mono text-[12.5px] break-all"><Value value={record[c.name]} redacted={c.redacted} full /></dd>
                </div>
              ))}
            </dl>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** A cell value as the database holds it; JSON text is pretty-printed in the record view. Hidden columns never had a value sent. */
function Value({ value, redacted, full }: { value: unknown; redacted: boolean; full?: boolean }) {
  const { t } = useI18n();
  if (redacted) return <span title={t('db.redacted')} className="inline-flex items-center gap-1 text-wait"><Lock size={11} />••••••</span>;
  if (value === null || value === undefined) return <span className="text-muted-foreground/60 italic">null</span>;
  if (typeof value === 'boolean') return <span className={value ? 'text-ok' : 'text-muted-foreground'}>{String(value)}</span>;
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (full && /^[[{]/.test(text.trim())) {
    try { return <pre className="m-0 max-h-[360px] overflow-auto rounded-md bg-muted p-2.5 text-[11.5px] leading-relaxed whitespace-pre-wrap">{JSON.stringify(JSON.parse(text), null, 2)}</pre>; } catch { /* not JSON */ }
  }
  if (full) return <span className="whitespace-pre-wrap">{text}</span>;
  return <span className="block truncate" title={text.length > 40 ? text : undefined}>{text}</span>;
}

/* ---------------- columns ---------------- */
function Columns({ table }: { table: DbTable }) {
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {['#', t('db.col.name'), t('db.col.type'), t('db.col.key'), t('db.col.unique'), t('db.col.default'), ''].map((h, i) => <TableHead key={i} className="h-9 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.columns.map((c, i) => (
            <TableRow key={c.name}>
              <TableCell className="w-10 px-3 text-muted-foreground tabular-nums">{i + 1}</TableCell>
              <TableCell className="px-3 font-mono text-[12.5px] font-medium">{c.name}</TableCell>
              <TableCell className="px-3 font-mono text-[12px] text-accent-foreground">{c.type}</TableCell>
              <TableCell className="px-3">{c.key && <KeyRound size={14} className="text-primary" aria-label={t('db.col.key')} />}</TableCell>
              <TableCell className="px-3">{c.unique && <Check size={14} className="text-ok" aria-label={t('db.col.unique')} />}</TableCell>
              <TableCell className="px-3 font-mono text-[12px] text-muted-foreground">{c.defaultValue ?? ''}</TableCell>
              <TableCell className="px-3">{c.redacted && <Badge variant="wait" className="gap-1"><Lock size={11} />{t('db.redacted')}</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------------- connections ---------------- */
function Links({ table, catalog, onSelect }: { table: DbTable; catalog: DbCatalog; onSelect: (name: string) => void }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const rows = useMemo(() => new Map(catalog.tables.map((x) => [x.name, x.rows])), [catalog]);
  if (!table.links.length) return <EmptyState>{t('db.links.none')}</EmptyState>;
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Link2 size={14} />{t('db.links.note')}</p>
      <div className="grid gap-2.5">
        {table.links.map((l, i) => (
          <div key={l.column} style={{ animationDelay: `${i * 40}ms` }} className="grid animate-rise grid-cols-[minmax(150px,auto)_28px_minmax(0,1fr)] items-center gap-2 max-[640px]:grid-cols-1">
            <div className="flex items-center gap-2 rounded-lg border border-primary-line bg-primary-soft px-3 py-2">
              <span className="font-mono text-[12px] text-muted-foreground">{table.name}.</span><b className="font-mono text-[12.5px] font-semibold text-primary">{l.column}</b>
            </div>
            <span aria-hidden="true" className="relative h-px bg-primary-line max-[640px]:hidden"><span className="absolute -top-[3px] right-0 size-[7px] rounded-full bg-primary-line" /></span>
            <div className="flex flex-wrap gap-1.5">
              {l.tables.map((name) => (
                <button key={name} onClick={() => onSelect(name)} title={t('db.links.via', { c: l.column })}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 font-mono text-[12px] shadow-card transition hover:border-primary-line hover:bg-accent">
                  {name}<span className="text-[11px] text-muted-foreground">{nf.format(rows.get(name) ?? 0)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
