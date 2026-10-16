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
  const exec = (evidence: string): Outcome => (anlageOk ? { status: 'DONE', by: PIPELINE, evidence } : { status: 'MISSING', by: PIPELINE, evidence: 'Nicht ausgeführt: Reststrom-MaLo fehlt oder ist nicht eindeutig (Schritt 4.1).' });

  const outcomes: Record<string, Outcome> = {
    MESSKONZEPT: ordered
      ? { status: 'CONFIRMED', by: 'DSO-DP (Simulation)', evidence: `Beauftragt: C1001_M001 für ${households.length} Bezugs-MeLo(s)${generators.length ? `, C1003_M001 für ${generators.length} Erzeugungsanlage(n)` : ''}.` }
      : { status: 'UNKNOWN', by: 'DSO-DP (Simulation)', evidence: 'Keine Beauftragung der Messkonzepte über die DSO-DP bekannt.' },
    STECKBRIEFE: rows.length
      ? { status: 'CHECKED', by: DATA_CHECK, evidence: `Teilnehmerliste liegt vor: ${rows.length} Zählpunkte, ${households.length + rows.filter((r) => r.role === ROLE.household && !r.participates).length} Mieter, Betreiber ${construct.operator ?? rows[0]?.operator ?? '—'}.` }
      : { status: 'MISSING', by: DATA_CHECK, evidence: 'Keine Teilnehmerliste vorhanden.' },
    IMSYS_EINBAU: households.length === 0
      ? { status: 'MISSING', by: DATA_CHECK, evidence: 'Keine teilnehmenden Bezugs-MeLos.' }
      : imsysOk === households.length
        ? { status: 'CHECKED', by: DATA_CHECK, evidence: `iMSys an allen ${households.length} teilnehmenden Bezugs-MeLos eingebaut.` }
        : { status: 'PARTIAL', by: DATA_CHECK, evidence: `iMSys an ${imsysOk} von ${households.length} Bezugs-MeLos. Fehlende werden je MaLo in Stufe 4 geklärt.` },
    RESTSTROM_MALO: anlageOk
      ? { status: 'DONE', by: PIPELINE, evidence: `Reststrom-MaLo ${malo} · Anlage angelegt (ES30) ab ${ab} · Sparte 01 · AbrKl SLP · Tariftyp ES001 · Serviceart 1001 · Netzebene 01.` }
      : { status: 'MISSING', by: DATA_CHECK, evidence: `${reststrom.length} Reststrom-MaLos gefunden, genau eine ist nötig.` },
    GERAETEINFOSATZ: exec(`Gerät VG-${malo} · Gerätetyp/Material 117-1000002 · Sparte 01 · abrechnungstechnischer Einbau OBIS 1.8.0 (EG34) ab ${ab}.`),
    ZAEHLPUNKTART: exec(`Zählpunkt ${malo}: Zählpunktart Marktlokation · Beschreibung VBZS.`),
    LASTPROFIL: exec(`Lastprofil SLP an der Anlage der Reststrom-MaLo ${malo} ab ${ab}.`),
    ZP_STATUS: exec(`ZP-Status „Aktiv“ ab IBN-Datum ${ab} (nur Einrichtung, nicht die Ruhendstellung).`),
    BILANZIERUNG: exec(`SETTLEMALO-Daten (KN-L) ab ${ab} hinterlegt · Zählverfahren E02, Prognose auf Basis von Werten.`),
    SERVICES: exec(`BIKO- und MSB-Service am Versorgungsszenario angelegt (Pflegetransaktion; /EKN/ESERVICE_UPD wird nicht verwendet).`),
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
      reason: `Aufbau vSZ ausgeführt/geprüft: ${changed.join(', ')}`, simulated: true,
    }));
  }
}
