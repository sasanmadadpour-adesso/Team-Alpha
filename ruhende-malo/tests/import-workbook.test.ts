import { beforeAll, describe, expect, it } from 'vitest';
import { excelDateToIso, readParticipantWorkbook, ROLES, type ParticipantRow } from '../scripts/workbook.js';

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
  it('marks the cross-building MaLo assignment as a conflict',()=>{
    const duplicate=rows.filter(r=>r.maloId==='50539603888'); expect(duplicate).toHaveLength(2); expect(duplicate.every(r=>r.maloConflict)).toBe(true); expect(new Set(duplicate.map(r=>r.buildingId))).toEqual(new Set(['B-FRA-01','B-CGN-01']));
  });
  it('preserves IDs as strings and validates B-MUL-01',()=>{
    expect(rows.every(r=>typeof r.maloId==='string'&&typeof r.meloId==='string')).toBe(true);
    const household=rows.filter(r=>r.buildingId==='B-MUL-01'&&r.role===ROLES.household); expect(household).toHaveLength(4); expect(household.filter(r=>r.participates)).toHaveLength(3); expect(household.filter(r=>!r.participates).map(r=>r.maloId)).toEqual(['50539603604']);
  });
});
