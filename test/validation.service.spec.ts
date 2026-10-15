import { ValidationService } from '../src/validation/validation.service';

describe('ValidationService', () => {
  const service = new ValidationService();
  const valid = {
    first_name: ' Jan ', last_name: 'Koller', email: 'JANKOLLER@GMAIL.COM', is_business: true, is_reverse_charge: true,
    deliv_address_street: 'Vilbeler  Landstrasse', deliv_address_house_number: '21', deliv_address_zipcode: '60388', deliv_address_city: 'Frankfurt am Main',
    subscription_reason: 'E01', production_type: 'Solar', plant_capacity_kw: 6, plant_specifics: { latitude: 50, longitude: 8 },
    market_location_identifier: 'DE0073325707820000000000000088943', tranche: null, preferred_delivery_start: '2026-10-01T00:00:00Z', contract_start_utc: '2026-10-01T00:00:00Z', contract_end_utc: '2026-10-02T00:00:00Z', building_id: 'B-FRA-01',
  } as const;
  it('normalizes producer data and reports MeLo-shaped identifiers', () => { const result = service.normalize(valid); expect(result.normalized.email).toBe('jankoller@gmail.com'); expect(result.findings.some((f) => f.ruleId === 'VAL-ID-003')).toBe(true); });
  it('requires an identifier or tranche', () => { const result = service.normalize({ ...valid, market_location_identifier: null, tranche: null }); expect(result.findings.some((f) => f.ruleId === 'VAL-ID-001')).toBe(true); });
  it('rejects a contract with reversed dates', () => { const result = service.normalize({ ...valid, contract_start_utc: '2026-10-02T00:00:00Z', contract_end_utc: '2026-10-01T00:00:00Z' }); expect(result.findings.some((f) => f.ruleId === 'VAL-DATE-001')).toBe(true); });
  it('reports malformed timestamps as findings instead of throwing', () => { const result = service.normalize({ ...valid, contract_start_utc: 'not-a-date' }); expect(result.findings.some((f) => f.ruleId === 'VAL-DATE-003')).toBe(true); });
});
