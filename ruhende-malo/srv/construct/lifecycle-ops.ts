import cds from '@sap/cds';
import { CapLifecycleRepository } from '../adapters/cap-lifecycle-repository.js';
import { buildLifecyclePlan, type LifecycleOperation, type LifecyclePlan } from '../domain/lifecycle.js';
import { ProcessError, refreshConstructs } from './service.js';

/**
 * Manual lifecycle operations after the Umstellung (FR-13 to FR-16): Wiederaktivierung, Herauslösung,
 * Korrektur, Rücknahme. Decisions come from domain/lifecycle.ts; this module persists, verifies and audits.
 * Preview and execute share one code path; preview never writes.
 */
const ns = (name: string) => `mk7.controlcenter.${name}`;

export interface LifecycleCommand { maloId: string; buildingId: string; effectiveDate: string; reason?: string; referenceOperationId?: string }

export async function planLifecycle(tx: cds.Service, operation: LifecycleOperation, c: LifecycleCommand): Promise<LifecyclePlan> {
  const repository = new CapLifecycleRepository(tx);
  const currentState = await repository.state(c.maloId);
  if (!currentState) throw new ProcessError(404, `MaLo ${c.maloId} not found.`);
  const participant = await tx.run(SELECT.one.from(ns('ParticipantSourceRows')).columns('sourceId').where({ maloId: c.maloId, constructId: c.buildingId }));
  if (!participant) throw new ProcessError(404, `MaLo ${c.maloId} is not registered in construct ${c.buildingId}.`);
  return buildLifecyclePlan({
    operation, effectiveDate: c.effectiveDate, reason: c.reason, referenceOperationId: c.referenceOperationId, currentState,
    periods: await repository.periods(c.maloId), reference: await repository.reference(c.referenceOperationId, c.maloId),
    alreadyCompleted: await repository.completed(operation, c.maloId, c.buildingId, c.effectiveDate, c.referenceOperationId),
    alreadyReversed: operation === 'REVERSE_TRANSITION' ? await repository.reversed(c.referenceOperationId) : false,
  });
}

export async function executeLifecycle(tx: cds.Service, operation: LifecycleOperation, c: LifecycleCommand, actor: string): Promise<{ plan: LifecyclePlan; requestId?: string }> {
  const plan = await planLifecycle(tx, operation, c);
  if (!plan.canExecute) return { plan };
  const repository = new CapLifecycleRepository(tx);
  const requestId = cds.utils.uuid();
  const now = new Date().toISOString();
  const idempotencyKey = [operation, c.maloId, c.buildingId, c.effectiveDate, c.referenceOperationId ?? ''].join('|');
  const before = { businessState: plan.beforeState, periods: await repository.periods(c.maloId) };
  await tx.run(INSERT.into(ns('ProcessRequests')).entries({ ID: requestId, operation, maloId: c.maloId, buildingId: c.buildingId, effectiveDate: c.effectiveDate, mode: 'MANUAL', status: 'PROCESSING', idempotencyKey, referenceOperationId: c.referenceOperationId, actor, reason: c.reason, simulated: true, executionTime: now }));

  if (plan.changes.closePeriodId) await tx.run(UPDATE(ns('LifecyclePeriods')).set({ validToExclusive: c.effectiveDate }).where({ ID: plan.changes.closePeriodId }));
  if (plan.changes.openState) {
    await tx.run(INSERT.into(ns('LifecyclePeriods')).entries({ maloId: c.maloId, businessState: plan.changes.openState, validFrom: c.effectiveDate, provenance: `SIMULATED_${operation}` }));
    await tx.run(UPDATE(ns('MarketLocations')).set({ businessState: plan.afterState }).where({ maloId: c.maloId }));
  }
  let closed = 0;
  if (plan.changes.relationshipAction === 'CLOSE') {
    // Herauslösung: end MaMa (MaLo → Reststrom), household MeMa and Einspeise-MeMa to this MaLo's MeLos as of the date,
    // and take the participant out of the construct so the automatic pipeline does not re-create them.
    const melos = (await tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('meloId').where({ maloId: c.maloId, constructId: c.buildingId })) as { meloId: string }[]).map((r) => r.meloId);
    const open = await tx.run(SELECT.from(ns('Relationships')).columns('ID', 'fromLocationId', 'toLocationId', 'validFrom').where({ source: 'SIMULATED', buildingId: c.buildingId, validToExclusive: null })) as { ID: string; fromLocationId: string; toLocationId: string; validFrom: string }[];
    const ids = open.filter((r) => (r.fromLocationId === c.maloId || melos.includes(r.toLocationId)) && r.validFrom < c.effectiveDate).map((r) => r.ID);
    if (ids.length) await tx.run(UPDATE(ns('Relationships')).set({ validToExclusive: c.effectiveDate }).where({ ID: { in: ids } }));
    closed = ids.length;
    await tx.run(UPDATE(ns('ParticipantSourceRows')).set({ excluded: true, exclusionReason: `Herauslösung from ${c.effectiveDate}: ${c.reason ?? ''}` }).where({ maloId: c.maloId, constructId: c.buildingId }));
  }
  if (plan.changes.correction) {
    await tx.run(UPDATE(ns('LifecyclePeriods')).set({ validToExclusive: plan.changes.correction.newDate }).where({ maloId: c.maloId, validToExclusive: plan.changes.correction.previousDate }));
    await tx.run(UPDATE(ns('LifecyclePeriods')).set({ validFrom: plan.changes.correction.newDate }).where({ maloId: c.maloId, validFrom: plan.changes.correction.previousDate }));
    // Keep relationship Zeitscheiben consistent with the corrected dormant start.
    await tx.run(UPDATE(ns('Relationships')).set({ validFrom: plan.changes.correction.newDate }).where({ source: 'SIMULATED', buildingId: c.buildingId, fromLocationId: c.maloId, validFrom: plan.changes.correction.previousDate }));
  }

  const afterPeriods = await repository.periods(c.maloId);
  const persisted = await repository.state(c.maloId);
  if (persisted !== plan.afterState || afterPeriods.some((p) => p.validFrom && p.validToExclusive && p.validToExclusive <= p.validFrom)) throw new Error('Lifecycle write verification failed; transaction rolled back.');

  await tx.run(INSERT.into(ns('AuditEvents')).entries({
    requestId, referenceOperationId: c.referenceOperationId, operation, maloId: c.maloId, actor, effectiveDate: c.effectiveDate, eventTime: now,
    beforeValue: JSON.stringify(before), afterValue: JSON.stringify({ businessState: persisted, periods: afterPeriods, closedRelationships: closed }),
    reason: c.reason ?? plan.message, simulated: true,
  }));
  const message = operation === 'REMOVE_FROM_CONSTRUCT' ? `Herauslösung persisted: ${closed} relationship(s) closed as of ${c.effectiveDate}; participant removed from ${c.buildingId}.` : `${operation} persisted and verified in SQLite (simulated).`;
  await tx.run(UPDATE(ns('ProcessRequests')).set({ status: 'SUCCESS', resultCode: 'SIMULATED_SUCCESS', resultMessage: message, beforeState: plan.beforeState, afterState: persisted }).where({ ID: requestId }));
  await refreshConstructs(tx);
  return { plan: { ...plan, status: 'SUCCESS', code: 'SIMULATED_SUCCESS', message, canExecute: false }, requestId };
}
