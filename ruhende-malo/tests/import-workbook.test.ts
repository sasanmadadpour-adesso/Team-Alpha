import { beforeAll, describe, expect, it } from 'vitest';
import { excelDateToIso, readParticipantWorkbook, ROLES, type ParticipantRow } from '../scripts/workbook.js';
import { readFullWorkbook, type FullWorkbookData } from '../scripts/full-workbook.js';

let rows:ParticipantRow[];
beforeAll(async()=>{ rows=(await readParticipantWorkbook()).rows; });
describe('TC21 workbook import',()=>{
  it('converts Excel date serials without timezone shifts',()=>expect(excelDateToIso(46296)).toBe('2026-10-01'));
  it('reads the expected roles and buildings',()=>{
    expect(rows).toHaveLength(17);
    expect(rows.filter(r=>r.role===ROLES.reststrom)).toHaveLength(3);
    expect(rows.filter(r=>ROLES.generation.has(r.role))).toHaveLength(3);
    expect(rows.filter(r=>r.role===ROLES.household)).toHaveLength(11);
    expect(rows.filter(r=>r.role===ROLES.household&&r.participates)).toHaveLength(10);
    expect(new Set(rows.map(r=>r.buildingId))).toHaveLength(3);
  });
  it('derives residual-supply targets from workbook rows',()=>{
    const target=(building:string)=>rows.find(r=>r.buildingId===building&&r.role===ROLES.reststrom)?.reststromMaloId;
    expect(target('B-FRA-01')).toBe('51781215544'); expect(target('B-CGN-01')).toBe('51781215999'); expect(target('B-MUL-01')).toBe('50539603639');
  });
  it('allows multiple MeLos for a MaLo but flags cross-building assignment for review',()=>{
    const duplicate=rows.filter(r=>r.maloId==='50539603888'); expect(duplicate).toHaveLength(2); expect(new Set(duplicate.map(r=>r.meloId))).toHaveLength(2); expect(duplicate.every(r=>r.maloConflict)).toBe(true); expect(new Set(duplicate.map(r=>r.buildingId))).toEqual(new Set(['B-FRA-01','B-CGN-01']));
    const oneBuilding=rows.filter(r=>r.buildingId==='B-MUL-01'&&r.role===ROLES.household); expect(oneBuilding.every(r=>!r.maloConflict)).toBe(true);
  });
  it('preserves IDs as strings and validates B-MUL-01',()=>{
    expect(rows.every(r=>typeof r.maloId==='string'&&typeof r.meloId==='string')).toBe(true);
    const household=rows.filter(r=>r.buildingId==='B-MUL-01'&&r.role===ROLES.household); expect(household).toHaveLength(4); expect(household.filter(r=>r.participates)).toHaveLength(3); expect(household.filter(r=>!r.participates).map(r=>r.maloId)).toEqual(['50539603604']);
  });
});

describe('complete source workbook',()=>{
  let data:FullWorkbookData;
  beforeAll(async()=>{data=await readFullWorkbook();},15_000);
  it('parses all seven sheets with exact row totals',()=>{
    expect(data.producerOnboarding).toHaveLength(3);
    expect(data.participants).toHaveLength(17);
    expect(data.hourlyConsumption).toHaveLength(96360);
    expect(data.hourlyGeneration).toHaveLength(26280);
    expect(data.energyPrices).toHaveLength(8760);
    expect(data.fieldDescriptions).toHaveLength(39);
    expect(data.financialRules).toHaveLength(19);
  });
  it('preserves source identifiers and normalizes timestamps',()=>{
    expect(data.hourlyConsumption[0]).toMatchObject({maloId:'50539603888',startTime:'2025-10-16T00:00:00.000Z'});
    expect(data.producerOnboarding[0]).toMatchObject({marketLocationId:'51664053761',preferredDeliveryStart:'2026-10-01'});
  });
});
