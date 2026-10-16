import { ProducerInput } from './onboarding-schema';
import { IdentifierType, LocalCheck, ProducerOnboarding } from './types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
const MALO_PATTERN = /^\d{11}$/;
const MELO_PATTERN = /^DE[A-Z0-9]{10,}$/i;
const TIMEZONE_SUFFIX_PATTERN = /[zZ]|[+-]\d{2}:?\d{2}$/;

export function classifyIdentifier(value: string | null | undefined): IdentifierType {
  if (!value) {
    return 'UNKNOWN';
  }
  if (MALO_PATTERN.test(value)) {
    return 'MALO';
  }
  if (MELO_PATTERN.test(value)) {
    return 'MELO';
  }
  return 'UNKNOWN';
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

// Returns the parsed Date only if the string is a syntactically valid
// ISO 8601 timestamp that includes an explicit timezone offset or "Z".
function parseTimezoneAwareDate(value: string): Date | null {
  if (!TIMEZONE_SUFFIX_PATTERN.test(value)) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

export function normalize(input: ProducerInput): ProducerOnboarding {
  const contractStart = parseTimezoneAwareDate(input.contract_start_utc);
  const contractEnd = parseTimezoneAwareDate(input.contract_end_utc);

  return {
    ...input,
    first_name: collapseWhitespace(input.first_name),
    last_name: collapseWhitespace(input.last_name),
    email: input.email.trim().toLowerCase(),
    salutation: normalizeOptionalText(input.salutation),

    deliv_address_street: collapseWhitespace(input.deliv_address_street),
    deliv_address_house_number: collapseWhitespace(input.deliv_address_house_number),
    deliv_address_zipcode: input.deliv_address_zipcode.trim(),
    deliv_address_city: collapseWhitespace(input.deliv_address_city),

    market_location_identifier: normalizeOptionalText(input.market_location_identifier),
    tranche: normalizeOptionalText(input.tranche),
    preferred_delivery_start: normalizeOptionalText(input.preferred_delivery_start),
    saas_customer_id: normalizeOptionalText(input.saas_customer_id),
    saas_contract_id: normalizeOptionalText(input.saas_contract_id),
    product_name: normalizeOptionalText(input.product_name),
    consumer_saas_contract_id: normalizeOptionalText(input.consumer_saas_contract_id),

    // Fall back to the raw value when parsing fails so the validation
    // layer below can report the invalid timestamp with its original text.
    contract_start_utc: contractStart?.toISOString() ?? input.contract_start_utc,
    contract_end_utc: contractEnd?.toISOString() ?? input.contract_end_utc,
  };
}

export function validate(input: ProducerInput): LocalCheck[] {
  const normalized = normalize(input);
  const checks: LocalCheck[] = [];

  function add(field: string, result: LocalCheck['result'], message: string, value?: unknown): void {
    checks.push({ field, result, message, value });
  }

  // --- Email ---
  const emailIsValid = EMAIL_PATTERN.test(normalized.email);
  add(
    'email',
    emailIsValid ? 'VALID' : 'INVALID',
    emailIsValid ? 'Email format is valid.' : 'Email format is invalid.',
    input.email,
  );

  // --- Postal code ---
  const postalCodeIsValid = POSTAL_CODE_PATTERN.test(normalized.deliv_address_zipcode);
  add(
    'deliv_address_zipcode',
    postalCodeIsValid ? 'VALID' : 'INVALID',
    postalCodeIsValid ? 'Postal code has five digits.' : 'Postal code must contain five digits.',
    input.deliv_address_zipcode,
  );

  // --- Plant capacity ---
  const capacityIsValid = normalized.production_type === 'Keine' ? normalized.plant_capacity_kw === 0 : normalized.plant_capacity_kw > 0;
  add(
    'plant_capacity_kw',
    capacityIsValid ? 'VALID' : 'INVALID',
      capacityIsValid ? (normalized.production_type === 'Keine' ? 'No generation plant is declared.' : 'Plant capacity is a positive number.') : normalized.production_type === 'Keine' ? 'Capacity must be zero when production type is Keine.' : 'Plant capacity must be greater than zero.',
    input.plant_capacity_kw,
  );

  // --- Coordinates ---
  const latitude = normalized.plant_specifics?.latitude;
  const longitude = normalized.plant_specifics?.longitude;
  const coordinatesSuppliedTogether = (latitude == null) === (longitude == null);
  add(
    'plant_specifics',
    coordinatesSuppliedTogether ? 'VALID' : 'INVALID',
    coordinatesSuppliedTogether
      ? 'Coordinates are complete or absent.'
      : 'Latitude and longitude must be supplied together.',
  );

  if (latitude != null) {
    const latitudeIsValid = latitude >= -90 && latitude <= 90;
    add(
      'plant_specifics.latitude',
      latitudeIsValid ? 'VALID' : 'INVALID',
      'Latitude must be between -90 and 90.',
      input.plant_specifics?.latitude,
    );
  }

  if (longitude != null) {
    const longitudeIsValid = longitude >= -180 && longitude <= 180;
    add(
      'plant_specifics.longitude',
      longitudeIsValid ? 'VALID' : 'INVALID',
      'Longitude must be between -180 and 180.',
      input.plant_specifics?.longitude,
    );
  }

  // --- Contract dates ---
  const contractStart = parseTimezoneAwareDate(input.contract_start_utc);
  const contractEnd = parseTimezoneAwareDate(input.contract_end_utc);

  add(
    'contract_start_utc',
    contractStart ? 'VALID' : 'INVALID',
    contractStart
      ? 'Contract start is a valid timezone-aware timestamp.'
      : 'Contract start must be a valid ISO 8601 timestamp with timezone.',
    input.contract_start_utc,
  );

  add(
    'contract_end_utc',
    contractEnd ? 'VALID' : 'INVALID',
    contractEnd
      ? 'Contract end is a valid timezone-aware timestamp.'
      : 'Contract end must be a valid ISO 8601 timestamp with timezone.',
    input.contract_end_utc,
  );

  if (contractStart && contractEnd) {
    const periodIsValid = contractStart < contractEnd;
    add(
      'contract_period',
      periodIsValid ? 'VALID' : 'INVALID',
      periodIsValid ? 'Contract start precedes contract end.' : 'Contract end must be later than contract start.',
    );
  }

  // --- Preferred delivery start ---
  if (normalized.preferred_delivery_start) {
    const preferredStart = parseTimezoneAwareDate(normalized.preferred_delivery_start);
    const preferredStartIsValid =
      preferredStart != null && contractStart != null && contractEnd != null &&
      preferredStart >= contractStart && preferredStart < contractEnd;

    add(
      'preferred_delivery_start',
      preferredStartIsValid ? 'VALID' : 'INVALID',
      preferredStartIsValid
        ? 'Preferred start is inside the contract period.'
        : 'Preferred start must be a valid timestamp inside the contract period.',
      input.preferred_delivery_start,
    );
  }

  // --- Identifier or tranche ---
  const hasIdentifier = Boolean(normalized.market_location_identifier);
  const hasTranche = Boolean(normalized.tranche);

  add(
    'market_location_identifier_or_tranche',
    hasIdentifier || hasTranche ? 'VALID' : 'INVALID',
    hasIdentifier || hasTranche
      ? 'An identifier or tranche is supplied.'
      : 'At least a market-location identifier or tranche is required.',
  );

  // This demo only implements SAP lookup by market_location_identifier.
  // A tranche-only submission cannot be verified, so it is rejected early
  // with an explanatory message rather than silently skipping verification.
  if (hasTranche && !hasIdentifier) {
    add(
      'market_location_identifier',
      'INVALID',
      'Tranche-only SAP lookup is not implemented in this demonstration; provide market_location_identifier.',
      input.tranche,
    );
  }

  if (normalized.market_location_identifier) {
    const identifierType = classifyIdentifier(normalized.market_location_identifier);
    add(
      'market_location_identifier',
      identifierType === 'UNKNOWN' ? 'INVALID' : 'WARNING',
      identifierType === 'MELO'
        ? 'Identifier has MeLo-like structure; the field is semantically ambiguous.'
        : identifierType === 'MALO'
          ? 'Identifier has MaLo-like structure.'
          : 'Identifier structure is unknown.',
      input.market_location_identifier,
    );
  }

  return checks;
}

export function hasValidationError(checks: LocalCheck[]): boolean {
  return checks.some((check) => check.result === 'INVALID');
}
