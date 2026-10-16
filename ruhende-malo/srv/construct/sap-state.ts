import { readFile } from 'node:fs/promises';
import path from 'node:path';
import cds from '@sap/cds';

/**
 * Simulated SAP IS-U / market-communication state (iMSys per MeLo, supplier Abmeldung per MaLo,
 * MCM per generator, Aufbau vSZ per construct). In a real integration these values would be READ
 * from SAP and market communication; here they come from an explicitly labeled demo fixture or the API.
 */
const ns = (name: string) => `mk7.controlcenter.${name}`;
export const SAP_FIXTURE_PATH = path.resolve('data/fixtures/sap-simulated-state.json');
export const SAP_SOURCE = 'SAP (simulated fixture)';

export type SapAttribute = 'imsys' | 'abmeldung' | 'mcm';
export const SAP_VALUES: Record<SapAttribute, string[]> = {
  imsys: ['INSTALLED', 'MISSING', 'UNKNOWN'],
  abmeldung: ['CONFIRMED', 'PENDING', 'UNKNOWN'],
  mcm: ['COMPLETED', 'OPEN', 'UNKNOWN'],
};
const COLUMN: Record<SapAttribute, string> = { imsys: 'imsysStatus', abmeldung: 'deregistrationStatus', mcm: 'mcmStatus' };

export interface SapFixture {
  knownConstructs: string[];
  defaults: Partial<Record<SapAttribute, string>>;
  malo: Record<string, Partial<Record<SapAttribute, string>>>;
  melo: Record<string, Partial<Record<SapAttribute, string>>>;
}

export async function loadSapFixture(): Promise<SapFixture> {
  return JSON.parse(await readFile(SAP_FIXTURE_PATH, 'utf8')) as SapFixture;
}

/**
 * Pipeline read (stages 3 and 4): queries the simulated SAP state for one construct at run time.
 * Only fills values that are still UNKNOWN — status input from the API and manual confirmations are never overwritten.
 * Constructs the simulated SAP does not know stay UNKNOWN (and are stopped at the vSZ gate / prerequisites).
 */
export async function readSapState(tx: cds.Service, constructId: string, actor: string) {
  const fixture = await loadSapFixture();
  if (!fixture.knownConstructs.includes(constructId)) return { known: false, updated: 0, vsz: 0 };
  const rows = await tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('sourceId', 'maloId', 'meloId', 'imsysStatus', 'deregistrationStatus', 'mcmStatus').where({ constructId })) as { sourceId: string; maloId: string; meloId: string; imsysStatus: string; deregistrationStatus: string; mcmStatus: string }[];
  let updated = 0;
  for (const r of rows) {
    const set: Record<string, string> = {};
    for (const attr of Object.keys(COLUMN) as SapAttribute[]) {
      const current = (r as unknown as Record<string, string>)[COLUMN[attr]];
      const value = fixture.melo[r.meloId]?.[attr] ?? fixture.malo[r.maloId]?.[attr] ?? fixture.defaults[attr];
      if (current === 'UNKNOWN' && value && value !== 'UNKNOWN') set[COLUMN[attr]] = value;
    }
    if (Object.keys(set).length) { await tx.run(UPDATE(ns('ParticipantSourceRows')).set(set).where({ sourceId: r.sourceId })); updated++; }
  }
  const vsz = 0; // the vSZ steps are executed by runVszSetup (stage 3), not read here
  if (updated || vsz) {
    await tx.run(INSERT.into(ns('AuditEvents')).entries({
      operation: 'SAP_READ', actor, eventTime: new Date().toISOString(),
      afterValue: JSON.stringify({ constructId, participantsUpdated: updated, vszItemsConfirmed: vsz }),
      reason: `Status read from simulated SAP: ${vsz} vSZ step(s), ${updated} participant(s)`, simulated: true,
    }));
  }
  return { known: true, updated, vsz };
}

/** API input from other systems: update one simulated SAP status (e.g. the supplier's Abmeldung arrived). */
export async function updateSapState(tx: cds.Service, attribute: SapAttribute, objectId: string, value: string, actor: string) {
  const where = attribute === 'imsys' ? { meloId: objectId } : attribute === 'mcm' ? { generationFeedInMaloId: objectId } : { maloId: objectId };
  const count = (await tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('sourceId').where(where)) as unknown[]).length;
  if (!count) return 0;
  await tx.run(UPDATE(ns('ParticipantSourceRows')).set({ [COLUMN[attribute]]: value }).where(where));
  await tx.run(INSERT.into(ns('AuditEvents')).entries({
    operation: 'SAP_STATE_UPDATE', maloId: attribute === 'abmeldung' ? objectId : null, actor, eventTime: new Date().toISOString(),
    afterValue: JSON.stringify({ attribute, objectId, value }), reason: `Status input: ${attribute} = ${value}`, simulated: true,
  }));
  return count;
}
