import { readFile } from 'node:fs/promises';
import path from 'node:path';
import cds from '@sap/cds';
import { VSZ_ITEMS } from './vsz.js';

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
  defaults: Partial<Record<SapAttribute, string>>;
  vszConfirmedFor: string[];
  malo: Record<string, Partial<Record<SapAttribute, string>>>;
  melo: Record<string, Partial<Record<SapAttribute, string>>>;
}

export async function loadSapFixture(): Promise<SapFixture> {
  return JSON.parse(await readFile(SAP_FIXTURE_PATH, 'utf8')) as SapFixture;
}

/** Applies the fixture to the given constructs (workbook import / reset). */
export async function applySapFixture(tx: cds.Service, constructIds: string[], fixture: SapFixture) {
  const rows = await tx.run(SELECT.from(ns('ParticipantSourceRows')).columns('sourceId', 'role', 'maloId', 'meloId', 'constructId').where({ constructId: { in: constructIds } })) as { sourceId: string; role: string; maloId: string; meloId: string }[];
  for (const r of rows) {
    const set: Record<string, string> = {};
    for (const attr of Object.keys(COLUMN) as SapAttribute[]) {
      const value = fixture.melo[r.meloId]?.[attr] ?? fixture.malo[r.maloId]?.[attr] ?? fixture.defaults[attr];
      if (value) set[COLUMN[attr]] = value;
    }
    if (Object.keys(set).length) await tx.run(UPDATE(ns('ParticipantSourceRows')).set(set).where({ sourceId: r.sourceId }));
  }
  const now = new Date().toISOString();
  const vsz = constructIds.filter((c) => fixture.vszConfirmedFor.includes(c));
  if (vsz.length) {
    await tx.run(UPDATE(ns('VszChecklistItems')).set({ status: 'CONFIRMED', confirmedBy: SAP_SOURCE, confirmedAt: now, evidence: 'Read from simulated SAP state (data/fixtures/sap-simulated-state.json)' }).where({ constructId: { in: vsz } }));
  }
  return { constructs: constructIds.length, vszConfirmed: vsz.length, items: VSZ_ITEMS.length };
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
