import cds from '@sap/cds';
import { ROLES, type ParticipantRow } from '../../scripts/workbook.js';
import { VSZ_ITEMS } from './vsz.js';
import { refreshConstructs } from './service.js';

/** Step S1 — Anmeldung Konstrukt. One code path for Excel import and JSON registration. */
const ns = (name: string) => `mk7.controlcenter.${name}`;

export interface RegistrationParticipant {
  role: string; maloId: string; meloId: string; participates?: boolean; participationRaw?: string;
  generationFeedInMaloId?: string; supplyStartUtc?: string; contractFromUtc?: string; contractToUtc?: string;
}
export interface RegistrationInput {
  buildingId: string; city?: string; operator?: string; streetAddress?: string; stichtag?: string;
  participants: RegistrationParticipant[];
}
export interface RegistrationSource { file: string; checksum?: string; actor: string }
export interface RegistrationResult { constructIds: string[]; rows: number; households: number; participating: number }

/** Maps a JSON registration to normalized participant rows (same shape as workbook rows). */
export function rowsFromRegistration(input: RegistrationInput): ParticipantRow[] {
  const rows = input.participants.map((p, index): ParticipantRow => {
    const participationRaw = p.participationRaw ?? (p.participates === false ? 'nein' : 'Ja');
    return {
      sourceId: `API:${input.buildingId}:${index + 1}`, sourceFile: 'API', sourceSheet: 'POST /constructs', sourceRowNumber: index + 1,
      buildingId: input.buildingId, role: p.role, participationRaw, participates: participationRaw.trim().toLowerCase() === 'ja',
      meloId: String(p.meloId ?? '').trim(), maloId: String(p.maloId ?? '').trim(),
      generationFeedInMaloId: p.generationFeedInMaloId, supplyStartUtc: p.supplyStartUtc ?? input.stichtag,
      contractFromUtc: p.contractFromUtc, contractToUtc: p.contractToUtc,
      city: input.city, operator: input.operator, streetAddress: input.streetAddress,
      maloConflict: false, unverifiedSourceAttributes: '{}', sourceData: JSON.stringify(p),
    };
  });
  const reststrom = [...new Set(rows.filter((r) => r.role === ROLES.reststrom).map((r) => r.maloId))];
  for (const row of rows) row.reststromMaloId = reststrom.length === 1 ? reststrom[0] : undefined;
  return rows;
}

/** Default Stichtag: earliest MK7 supply start of the participating households (demo default, see ASSUMPTIONS). */
export function defaultStichtag(rows: ParticipantRow[]): string | undefined {
  return rows.filter((r) => r.role === ROLES.household && r.participates && r.supplyStartUtc).map((r) => r.supplyStartUtc!).sort()[0];
}

/**
 * Registers (or re-registers) constructs. Replaces the source rows and process state of the given
 * constructs; audit history is append-only and kept. `replaceAll` wipes every construct first (workbook baseline).
 */
export async function registerConstructs(tx: cds.Service, rows: ParticipantRow[], source: RegistrationSource, options: { replaceAll?: boolean; stichtag?: string } = {}): Promise<RegistrationResult> {
  const constructIds = [...new Set(rows.map((r) => r.buildingId))];
  const now = new Date().toISOString();
  const scope = options.replaceAll ? {} : { constructId: { in: constructIds } };
  const buildingScope = options.replaceAll ? {} : { buildingId: { in: constructIds } };

  const previousMalos = (await tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('maloId').where(buildingScope)) as { maloId: string }[]).map((r) => r.maloId);
  for (const entity of ['ValidationIssues', 'VszChecklistItems', 'OutboxEvents']) await tx.run(DELETE.from(ns(entity)).where(scope));
  await tx.run(DELETE.from(ns('Relationships')).where(buildingScope));
  await tx.run(DELETE.from(ns('ParticipantSourceRows')).where(buildingScope));
  await tx.run(DELETE.from(ns('Constructs')).where(scope));
  await tx.run(DELETE.from(ns('Buildings')).where(buildingScope));
  if (options.replaceAll) {
    for (const entity of ['LifecyclePeriods', 'MarketLocations', 'MeteringLocations', 'ProcessRequests', 'PrerequisiteChecks', 'ProcessRuns']) await tx.run(DELETE.from(ns(entity)));
  }

  // Cross-building MaLo identity is evaluated against all rows, not only the registered ones.
  const others = await tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('maloId', 'buildingId')) as { maloId: string; buildingId: string }[];
  const buildingsOf = new Map<string, Set<string>>();
  for (const r of [...others, ...rows]) buildingsOf.set(r.maloId, (buildingsOf.get(r.maloId) ?? new Set()).add(r.buildingId));
  for (const r of rows) r.maloConflict = (buildingsOf.get(r.maloId)?.size ?? 0) > 1;
  await tx.run(UPDATE(ns('ParticipantSourceRows')).set({ maloConflict: false }));
  const conflicted = [...buildingsOf].filter(([, b]) => b.size > 1).map(([m]) => m);
  if (conflicted.length) await tx.run(UPDATE(ns('ParticipantSourceRows')).set({ maloConflict: true }).where({ maloId: { in: conflicted } }));

  await tx.run(INSERT.into(ns('ParticipantSourceRows')).entries(rows.map((r) => ({ ...r, constructId: r.buildingId, excluded: false, imsysStatus: 'UNKNOWN', deregistrationStatus: 'UNKNOWN', mcmStatus: 'UNKNOWN' }))));

  for (const constructId of constructIds) {
    const own = rows.filter((r) => r.buildingId === constructId);
    const meta = { city: own.find((r) => r.city)?.city, operator: own.find((r) => r.operator)?.operator, streetAddress: own.find((r) => r.streetAddress)?.streetAddress };
    const reststromMaloId = own[0]?.reststromMaloId;
    await tx.run(INSERT.into(ns('Buildings')).entries({ buildingId: constructId, ...meta, reststromMaloId, sourceRowCount: own.length }));
    await tx.run(INSERT.into(ns('Constructs')).entries({
      constructId, buildingId: constructId, ...meta, reststromMaloId, stichtag: options.stichtag ?? defaultStichtag(own),
      registrationSource: source.file, registeredAt: now, stage: 'REGISTERED', vszConfirmed: 0, vszTotal: VSZ_ITEMS.length,
    }));
    await tx.run(INSERT.into(ns('VszChecklistItems')).entries(VSZ_ITEMS.map((item) => ({ constructId, ...item, status: 'UNKNOWN' }))));
    await tx.run(INSERT.into(ns('AuditEvents')).entries({
      operation: 'REGISTER_CONSTRUCT', maloId: reststromMaloId, actor: source.actor, eventTime: now,
      afterValue: JSON.stringify({ constructId, rows: own.length, source: source.file }), reason: null, simulated: true,
    }));
  }

  // Market locations: one per unique MaLo; household baseline state ACTIVE (documented demo assumption).
  const allRows = await tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('maloId', 'role', 'participates', 'buildingId', 'meloId', 'reststromMaloId')) as ParticipantRow[];
  const existing = new Set((await tx.run(SELECT.from(ns('MarketLocations')).columns('maloId')) as { maloId: string }[]).map((r) => r.maloId));
  const reRegistered = new Set(previousMalos);
  const byMalo = new Map<string, ParticipantRow[]>();
  for (const r of allRows) byMalo.set(r.maloId, [...(byMalo.get(r.maloId) ?? []), r]);
  for (const [maloId, list] of byMalo) {
    const record = {
      maloId, primaryRole: list[0].role, participates: list.some((r) => r.participates), assignmentCount: list.length,
      conflictingAssignment: new Set(list.map((r) => r.buildingId)).size > 1, assignmentSummary: list.map((r) => `${r.buildingId}:${r.meloId}:${r.reststromMaloId ?? ''}`).join(';'),
    };
    if (existing.has(maloId) && !reRegistered.has(maloId)) { await tx.run(UPDATE(ns('MarketLocations')).set(record).where({ maloId })); continue; }
    if (existing.has(maloId)) {
      await tx.run(DELETE.from(ns('MarketLocations')).where({ maloId }));
      await tx.run(DELETE.from(ns('LifecyclePeriods')).where({ maloId }));
    }
    await tx.run(INSERT.into(ns('MarketLocations')).entries({ ...record, businessState: 'ACTIVE' }));
    if (list[0].role === ROLES.household) await tx.run(INSERT.into(ns('LifecyclePeriods')).entries({ maloId, businessState: 'ACTIVE', provenance: 'BASELINE_ASSUMED_ACTIVE' }));
  }
  const gone = previousMalos.filter((m) => !byMalo.has(m));
  if (gone.length) {
    await tx.run(DELETE.from(ns('MarketLocations')).where({ maloId: { in: gone } }));
    await tx.run(DELETE.from(ns('LifecyclePeriods')).where({ maloId: { in: gone } }));
  }

  await tx.run(INSERT.into(ns('ImportRuns')).entries({
    sourceFile: source.file, sourceChecksum: source.checksum, startedAt: now, completedAt: now, status: 'SUCCESS',
    totalRows: rows.length, buildingCount: constructIds.length, conflictCount: conflicted.length, message: `Registered ${constructIds.join(', ')}`,
  }));
  await refreshConstructs(tx);
  const households = rows.filter((r) => r.role === ROLES.household);
  return { constructIds, rows: rows.length, households: households.length, participating: households.filter((r) => r.participates).length };
}
