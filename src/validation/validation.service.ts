import { Injectable } from '@nestjs/common';
import { producerSchema, ProducerInput } from './producer.schema';
import { Finding, classifyIdentifier, normalizeText, ProducerOnboarding } from '../common/types';

export type NormalizationResult = { normalized: ProducerOnboarding; findings: Finding[] };

@Injectable()
export class ValidationService {
  normalize(input: ProducerInput): NormalizationResult {
    const p = input;
    const findings: Finding[] = [];
    const parseTimestamp = (value: string, field: string): string => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        findings.push({ ruleId: 'VAL-DATE-003', severity: 'ERROR', field, submittedValue: value, message: 'Timestamp must be a valid ISO 8601 value with an explicit timezone.' });
        return value;
      }
      if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
        findings.push({ ruleId: 'VAL-DATE-004', severity: 'ERROR', field, submittedValue: value, message: 'Timestamp must include an explicit timezone.' });
      }
      return date.toISOString();
    };
    const normalized: ProducerOnboarding = {
      ...p,
      first_name: normalizeText(p.first_name), last_name: normalizeText(p.last_name), email: p.email.trim().toLowerCase(),
      salutation: p.salutation?.trim() || null,
      deliv_address_street: normalizeText(p.deliv_address_street), deliv_address_house_number: normalizeText(p.deliv_address_house_number),
      deliv_address_zipcode: p.deliv_address_zipcode.trim(), deliv_address_city: normalizeText(p.deliv_address_city),
      production_type: p.production_type, building_id: p.building_id.trim(),
      market_location_identifier: p.market_location_identifier?.trim() || null, tranche: p.tranche?.trim() || null,
      preferred_delivery_start: p.preferred_delivery_start || null,
      saas_customer_id: p.saas_customer_id?.trim() || null, saas_contract_id: p.saas_contract_id?.trim() || null,
      product_name: p.product_name?.trim() || null, consumer_saas_contract_id: p.consumer_saas_contract_id?.trim() || null,
      contract_start_utc: parseTimestamp(p.contract_start_utc, 'contract_start_utc'), contract_end_utc: parseTimestamp(p.contract_end_utc, 'contract_end_utc'),
    };
    const add = (finding: Finding) => findings.push(finding);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) add({ ruleId: 'VAL-EMAIL-001', severity: 'ERROR', field: 'email', submittedValue: p.email, message: 'Email address is not syntactically valid.' });
    if (!/^\d{5}$/.test(normalized.deliv_address_zipcode)) add({ ruleId: 'VAL-ADDRESS-001', severity: 'ERROR', field: 'deliv_address_zipcode', submittedValue: p.deliv_address_zipcode, message: 'Postal code must contain five digits.' });
    if (normalized.plant_capacity_kw <= 0 || normalized.plant_capacity_kw > 100000) add({ ruleId: 'VAL-CAPACITY-001', severity: 'ERROR', field: 'plant_capacity_kw', submittedValue: p.plant_capacity_kw, message: 'Capacity must be greater than zero and below the configured maximum.' });
    const lat = normalized.plant_specifics?.latitude; const lon = normalized.plant_specifics?.longitude;
    if ((lat == null) !== (lon == null)) add({ ruleId: 'VAL-COORDINATES-001', severity: 'ERROR', field: 'plant_specifics', message: 'Latitude and longitude must be supplied together.' });
    if (lat != null && (lat < -90 || lat > 90)) add({ ruleId: 'VAL-COORDINATES-002', severity: 'ERROR', field: 'plant_specifics.latitude', submittedValue: lat, message: 'Latitude must be between -90 and 90.' });
    if (lon != null && (lon < -180 || lon > 180)) add({ ruleId: 'VAL-COORDINATES-003', severity: 'ERROR', field: 'plant_specifics.longitude', submittedValue: lon, message: 'Longitude must be between -180 and 180.' });
    const start = new Date(normalized.contract_start_utc); const end = new Date(normalized.contract_end_utc);
    if (!(start < end)) add({ ruleId: 'VAL-DATE-001', severity: 'ERROR', field: 'contract_start_utc', message: 'Contract start must precede contract end.' });
    if (normalized.preferred_delivery_start) { const preferred = new Date(normalized.preferred_delivery_start); if (Number.isNaN(preferred.getTime())) add({ ruleId: 'VAL-DATE-005', severity: 'ERROR', field: 'preferred_delivery_start', submittedValue: p.preferred_delivery_start, message: 'Preferred delivery start must be a valid ISO 8601 value.' }); else if (preferred < start || preferred >= end) add({ ruleId: 'VAL-DATE-002', severity: 'WARNING', field: 'preferred_delivery_start', submittedValue: p.preferred_delivery_start, message: 'Preferred delivery start is outside the submitted contract period.' }); }
    if (!normalized.market_location_identifier && !normalized.tranche) add({ ruleId: 'VAL-ID-001', severity: 'ERROR', field: 'market_location_identifier', message: 'Either market_location_identifier or tranche is required.' });
    if (normalized.market_location_identifier) { const type = classifyIdentifier(normalized.market_location_identifier); if (type === 'UNKNOWN') add({ ruleId: 'VAL-ID-002', severity: 'ERROR', field: 'market_location_identifier', submittedValue: p.market_location_identifier, message: 'Identifier has an unknown structure.' }); else if (type === 'MELO') add({ ruleId: 'VAL-ID-003', severity: 'WARNING', field: 'market_location_identifier', submittedValue: p.market_location_identifier, normalizedValue: normalized.market_location_identifier, message: 'Identifier has the structure of a MeLo.' }); }
    return { normalized, findings };
  }

  parseAndValidate(input: unknown): { parsed?: ProducerInput; findings: Finding[] } {
    const parsed = producerSchema.safeParse(input);
    if (!parsed.success) return { findings: parsed.error.issues.map((issue) => ({ ruleId: 'VAL-SCHEMA-001', severity: 'ERROR', field: issue.path.join('.') || undefined, message: issue.message, details: { code: issue.code } })) };
    return { parsed: parsed.data, findings: [] };
  }
}
