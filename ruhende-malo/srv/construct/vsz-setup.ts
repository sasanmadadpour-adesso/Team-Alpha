import cds from '@sap/cds';
import { ROLE, isGeneration } from './rules.js';
import { loadSapFixture } from './sap-state.js';

/**
 * Stage 3 — Aufbau vSZ, executed step by step during the pipeline run (Prozessschritte.pdf steps 1–4.7).
 * There is no real SAP connection: steps that happen in SAP in reality are executed in the simulated SAP
 * (this database) with the parameters the PDF prescribes, and the result is recorded per step.
 * Steps that can be verified against our own data are verified, not assumed.
 * A step confirmed by a person (confirmVsz) is never overwritten.
 */
const ns = (name: string) => `mk7.controlcenter.${name}`;
export const PIPELINE = 'Pipeline (Simulation)';
export const DATA_CHECK = 'Datenprüfung';

interface Item { ID: string; itemCode: string; status: string; confirmedBy: string | null }
interface Row { role: string; participates: boolean; excluded: boolean; meloId: string; maloId: string; imsysStatus: string; reststromMaloId: string | null; operator: string | null }
type Outcome = { status: 'DONE' | 'CHECKED' | 'PARTIAL' | 'CONFIRMED' | 'UNKNOWN' | 'MISSING'; by: string; evidence: string };

export async function runVszSetup(tx: cds.Service, constructId: string, actor: string) {
  const construct = await tx.run(SELECT.one.from(ns('Constructs')).columns('reststromMaloId', 'stichtag', 'operator').where({ constructId })) as { reststromMaloId: string | null; stichtag: string | null; operator: string | null };
  const items = await tx.run(SELECT.from(ns('VszChecklistItems')).columns('ID', 'itemCode', 'status', 'confirmedBy').where({ constructId })) as Item[];
  const rows = (await tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('role', 'participates', 'excluded', 'meloId', 'maloId', 'imsysStatus', 'reststromMaloId', 'operator').where({ constructId })) as Row[]).filter((r) => !r.excluded);
  const fixture = await loadSapFixture();

  const households = rows.filter((r) => r.role === ROLE.household && r.participates);
  const generators = rows.filter((r) => isGeneration(r.role) && r.participates);
  const reststrom = [...new Set(rows.filter((r) => r.role === ROLE.reststrom).map((r) => r.maloId))];
  const malo = construct.reststromMaloId ?? '';
  const ab = construct.stichtag ?? '—';
  const anlageOk = reststrom.length === 1;
  const ordered = fixture.knownConstructs.includes(constructId);
  const imsysOk = households.filter((r) => ['INSTALLED', 'CONFIRMED_MANUAL'].includes(r.imsysStatus)).length;
  /** Language-neutral result text: "i18n:<key>|<json params>" — the UI translates it; human evidence stays as typed. */
  const ev = (key: string, params: Record<string, string | number> = {}) => `i18n:${key}|${JSON.stringify(params)}`;
  const exec = (key: string, params: Record<string, string | number> = {}): Outcome => (anlageOk ? { status: 'DONE', by: PIPELINE, evidence: ev(key, params) } : { status: 'MISSING', by: PIPELINE, evidence: ev('vsz.ev.skipped') });
  const operatorName = construct.operator ?? rows[0]?.operator ?? '—';

  const outcomes: Record<string, Outcome> = {
    MESSKONZEPT: ordered
      ? { status: 'CONFIRMED', by: 'DSO-DP (Simulation)', evidence: ev('vsz.ev.MESSKONZEPT.ok', { hh: households.length, gen: generators.length }) }
      : { status: 'UNKNOWN', by: 'DSO-DP (Simulation)', evidence: ev('vsz.ev.MESSKONZEPT.unknown') },
    STECKBRIEFE: rows.length
      ? { status: 'CHECKED', by: DATA_CHECK, evidence: ev('vsz.ev.STECKBRIEFE.ok', { points: rows.length, tenants: rows.filter((r) => r.role === ROLE.household).length, operator: operatorName }) }
      : { status: 'MISSING', by: DATA_CHECK, evidence: ev('vsz.ev.STECKBRIEFE.missing') },
    IMSYS_EINBAU: households.length === 0
      ? { status: 'MISSING', by: DATA_CHECK, evidence: ev('vsz.ev.IMSYS.none') }
      : imsysOk === households.length
        ? { status: 'CHECKED', by: DATA_CHECK, evidence: ev('vsz.ev.IMSYS.ok', { n: households.length }) }
        : { status: 'PARTIAL', by: DATA_CHECK, evidence: ev('vsz.ev.IMSYS.partial', { ok: imsysOk, n: households.length }) },
    RESTSTROM_MALO: anlageOk
      ? { status: 'DONE', by: PIPELINE, evidence: ev('vsz.ev.RESTSTROM_MALO.ok', { malo, ab }) }
      : { status: 'MISSING', by: DATA_CHECK, evidence: ev('vsz.ev.RESTSTROM_MALO.bad', { n: reststrom.length }) },
    GERAETEINFOSATZ: exec('vsz.ev.GERAETEINFOSATZ', { malo, ab }),
    ZAEHLPUNKTART: exec('vsz.ev.ZAEHLPUNKTART', { malo }),
    LASTPROFIL: exec('vsz.ev.LASTPROFIL', { malo, ab }),
    ZP_STATUS: exec('vsz.ev.ZP_STATUS', { ab }),
    BILANZIERUNG: exec('vsz.ev.BILANZIERUNG', { ab }),
    SERVICES: exec('vsz.ev.SERVICES'),
  };

  const now = new Date().toISOString();
  const changed: string[] = [];
  for (const item of items) {
    const isPerson = item.status === 'CONFIRMED' && item.confirmedBy && ![PIPELINE, DATA_CHECK, 'DSO-DP (Simulation)'].includes(item.confirmedBy);
    if (isPerson) continue; // a person's confirmation with evidence wins
    const o = outcomes[item.itemCode];
    if (!o) continue;
    if (item.status !== o.status || item.confirmedBy !== o.by) changed.push(item.itemCode);
    await tx.run(UPDATE(ns('VszChecklistItems')).set({ status: o.status, confirmedBy: o.by, confirmedAt: now, evidence: o.evidence.slice(0, 500) }).where({ ID: item.ID }));
  }
  if (changed.length) {
    await tx.run(INSERT.into(ns('AuditEvents')).entries({
      operation: 'VSZ_SETUP', actor, eventTime: now, afterValue: JSON.stringify({ constructId, steps: changed }),
      reason: null, simulated: true,
    }));
  }
}
