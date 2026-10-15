import {describe,expect,it} from 'vitest';
import {invalidInterval,intervalsOverlap,reconcileRelationships,type RelationshipRecord} from '../srv/domain/reconciliation.js';
const expected:RelationshipRecord={kind:'MAMA',source:'EXPECTED',buildingId:'B-MUL-01',fromLocationId:'50539603921',toLocationId:'50539603639',validFrom:'2026-10-01'};
describe('Phase D relationship reconciliation',()=>{
 it('reports MATCH for equal expected and mock-observed slices',()=>expect(reconcileRelationships([expected,{...expected,source:'MOCK_OBSERVED'}],'B-MUL-01','50539603921','2026-10-01')[0].status).toBe('MATCH'));
 it('TC06 reports MISSING and blocks',()=>{const result=reconcileRelationships([expected],'B-MUL-01','50539603921','2026-10-01')[0];expect(result.status).toBe('MISSING');expect(result.blocking).toBe(true);});
 it('reports EXTRA and blocks',()=>{const result=reconcileRelationships([{...expected,source:'MOCK_OBSERVED'}],'B-MUL-01','50539603921','2026-10-01')[0];expect(result.status).toBe('EXTRA');expect(result.blocking).toBe(true);});
 it('TC07 reports a conflicting MaMa target',()=>{const result=reconcileRelationships([expected,{...expected,source:'MOCK_OBSERVED',toLocationId:'OTHER'}],'B-MUL-01','50539603921','2026-10-01')[0];expect(result.status).toBe('CONFLICT');expect(result.code).toBe('CONFLICTING_TARGET');});
 it('rejects invalid intervals',()=>expect(invalidInterval({...expected,validToExclusive:'2026-09-30'})).toBe(true));
 it('TC08 detects overlapping slices',()=>expect(intervalsOverlap(expected,{...expected,validFrom:'2026-10-15'})).toBe(true));
 it('does not require MaMa for generation-only MeMa',()=>{const generation:RelationshipRecord={kind:'MEMA',source:'EXPECTED',buildingId:'B-MUL-01',fromLocationId:'50539603639',toLocationId:'GEN-MELO',validFrom:'2026-10-01'};const result=reconcileRelationships([generation,{...generation,source:'MOCK_OBSERVED'}],'B-MUL-01','GEN-MALO','2026-10-01');expect(result).toHaveLength(1);expect(result[0].status).toBe('MATCH');});
});
