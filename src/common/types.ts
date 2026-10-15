export type IdentifierType = 'MALO' | 'MELO' | 'UNKNOWN';
export type Severity = 'ERROR' | 'WARNING' | 'INFO';
export type Finding = {
  ruleId: string;
  severity: Severity;
  field?: string;
  submittedValue?: unknown;
  normalizedValue?: unknown;
  message: string;
  details?: Record<string, unknown>;
};

export type ProducerOnboarding = {
  first_name: string;
  last_name: string;
  email: string;
  salutation?: string | null;
  is_business: boolean;
  is_reverse_charge: boolean;
  deliv_address_street: string;
  deliv_address_house_number: string;
  deliv_address_zipcode: string;
  deliv_address_city: string;
  subscription_reason: 'E01' | 'E02' | 'E03';
  production_type: 'Solar' | 'Wind' | 'Gas' | 'Hydro' | 'Battery';
  plant_capacity_kw: number;
  plant_specifics?: { latitude?: number | null; longitude?: number | null } | null;
  market_location_identifier?: string | null;
  tranche?: string | null;
  preferred_delivery_start?: string | null;
  saas_customer_id?: string | null;
  saas_contract_id?: string | null;
  product_name?: string | null;
  consumer_saas_contract_id?: string | null;
  control_resource?: unknown;
  technical_resources?: unknown;
  contract_start_utc: string;
  contract_end_utc: string;
  building_id: string;
};

export function classifyIdentifier(value: string | null | undefined): IdentifierType {
  if (!value) return 'UNKNOWN';
  if (/^\d{11}$/.test(value)) return 'MALO';
  if (/^DE[A-Z0-9]{10,}$/i.test(value)) return 'MELO';
  return 'UNKNOWN';
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
