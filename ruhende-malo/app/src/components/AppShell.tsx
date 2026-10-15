import { type ReactNode, useEffect, useState } from 'react';
import {
  Activity, Database, FlaskConical, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen,
  ShieldAlert, Table2, Workflow, X,
} from 'lucide-react';
import { IconButton } from './primitives';

export type PageId = 'overview' | 'explorer' | 'workbench' | 'automation' | 'history' | 'tests';

export interface PageDefinition {
  id: PageId;
  label: string;
  description: string;
  group: string;
  icon: typeof LayoutDashboard;
}

export const PAGES: PageDefinition[] = [
  { id: 'overview', label: 'Übersicht', description: 'Status des MK7-Konstrukts auf einen Blick', group: 'Analyse', icon: LayoutDashboard },
  { id: 'explorer', label: 'MaLo Explorer', description: 'Alle Marktlokationen durchsuchen und prüfen', group: 'Analyse', icon: Table2 },
  { id: 'workbench', label: 'Prozess-Workbench', description: 'Einzelnen Vorgang geführt prüfen und ausführen', group: 'Vorgänge', icon: Workflow },
  { id: 'automation', label: 'Automatisierung', description: 'Mehrere Marktlokationen als Stapel verarbeiten', group: 'Vorgänge', icon: Activity },
  { id: 'history', label: 'Historie & Protokoll', description: 'Lückenlose Nachverfolgung aller Vorgänge', group: 'Nachweis', icon: Database },
  { id: 'tests', label: 'Testcenter', description: 'Reale Szenario-Prüfungen gegen die Domänenlogik', group: 'Nachweis', icon: FlaskConical },
];

export const pageById = (id: PageId) => PAGES.find((page) => page.id === id)!;

const GROUPS = ['Analyse', 'Vorgänge', 'Nachweis'];

export function AppShell({ page, onNavigate, counts, children }: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  counts: Partial<Record<PageId, number>>;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mk7.sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = pageById(page);

  useEffect(() => {
    localStorage.setItem('mk7.sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  useEffect(() => { setMobileOpen(false); }, [page]);

  return (
    <div className="shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <a className="skip-link" href="#main-content">Zum Inhalt springen</a>

      <nav className="sidebar" aria-label="Hauptnavigation">
        <div className="sidebar__brand">
          <span className="sidebar__mark" aria-hidden>MK7</span>
          <span className="sidebar__names">
            <span className="sidebar__title">MK7 Control Center</span>
            <span className="sidebar__subtitle">Ruhende MaLo</span>
          </span>
          <IconButton
            label="Navigation schließen"
            onClick={() => setMobileOpen(false)}
            style={{ marginLeft: 'auto' }}
            className="topbar__menu"
          >
            <X size={16} />
          </IconButton>
        </div>

        <div className="sidebar__nav">
          {GROUPS.map((group) => (
            <div className="sidebar__group" key={group}>
              <div className="sidebar__group-label">{group}</div>
              <ul className="sidebar__list">
                {PAGES.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon;
                  const count = counts[item.id];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="nav-item"
                        aria-current={item.id === page ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        onClick={() => onNavigate(item.id)}
                      >
                        <Icon size={16} aria-hidden />
                        <span>{item.label}</span>
                        {count !== undefined && !collapsed
                          ? <span className="nav-item__count">{count}</span>
                          : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="sidebar__footer">
          <div className="sidebar__env" title="Alle Ergebnisse sind lokale Simulationen in SQLite.">
            <ShieldAlert size={14} aria-hidden />
            <span>Simulation — keine SAP-Verbindung</span>
          </div>
          <button type="button" className="sidebar__collapse" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
            <span>Navigation einklappen</span>
          </button>
        </div>
      </nav>

      {mobileOpen ? <div className="drawer-backdrop" onClick={() => setMobileOpen(false)} aria-hidden /> : null}

      <div className="main">
        <header className="topbar">
          <IconButton label="Navigation öffnen" className="topbar__menu" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </IconButton>
          <div className="breadcrumbs" aria-label="Brotkrumennavigation">
            <span className="breadcrumbs__root">{current.group}</span>
            <span className="breadcrumbs__sep" aria-hidden>/</span>
            <span className="breadcrumbs__current">{current.label}</span>
          </div>
          <div className="topbar__spacer" />
          <div className="topbar__actions">
            <span className="sim-pill" title="Es besteht keine Verbindung zu einem SAP-System. Alle Ergebnisse sind simuliert.">
              <span className="sim-pill__dot" aria-hidden />
              SIMULATION — KEINE SAP-VERBINDUNG
            </span>
          </div>
        </header>

        <main className="content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: {
  title: string; description?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {description ? <p className="page-header__desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
