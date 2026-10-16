import { getSapLocation } from './sap-client';
import { classifyIdentifier, hasValidationError, normalize } from './validation';
import {
  LocalCheck,
  ProducerOnboarding,
  SapLocation,
  Status,
  VerificationCheck,
  VerificationResponse,
} from './types';

const NETWORK_OPERATOR = 'VNB-DEMO';
const CAPACITY_TOLERANCE_KW = 0.1;

function equalText(left: string, right: string): boolean {
  const normalizeForComparison = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalizeForComparison(left) === normalizeForComparison(right);
}

function verificationCheck(
  field: string,
  submitted: unknown,
  authoritative: unknown,
  result: VerificationCheck['result'],
  message: string,
  why: string,
): VerificationCheck {
  return { field, submitted, authoritative, result, message, why };
}

function compare(input: ProducerOnboarding, sap: SapLocation): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  const identifierType = classifyIdentifier(input.market_location_identifier);

  const identifierMatches = input.market_location_identifier === sap.identifier;
  checks.push(
    verificationCheck(
      'market_location_identifier',
      input.market_location_identifier,
      sap.identifier,
      identifierMatches ? 'MATCH' : 'MISMATCH',
      identifierMatches
        ? 'The submitted identifier exists in the authoritative data.'
        : 'The submitted identifier differs from the authoritative identifier.',
      'The VNB must verify that the submitted installation refers to a known location.',
    ),
  );

  const identifierTypeMatches = identifierType === sap.identifier_type;
  checks.push(
    verificationCheck(
      'identifier_type',
      identifierType,
      sap.identifier_type,
      identifierTypeMatches ? 'MATCH' : 'MISMATCH',
      identifierTypeMatches
        ? 'The identifier type matches.'
        : 'The submitted identifier type differs from SAP.',
      'MaLo and MeLo identifiers refer to different business objects.',
    ),
  );

  const networkOperatorMatches = NETWORK_OPERATOR === sap.network_operator;
  checks.push(
    verificationCheck(
      'network_operator',
      NETWORK_OPERATOR,
      sap.network_operator,
      networkOperatorMatches ? 'MATCH' : 'MISMATCH',
      networkOperatorMatches
        ? 'The location belongs to this VNB.'
        : 'The location belongs to another network operator.',
      'The backend must not accept a location outside this VNB responsibility.',
    ),
  );

  const addressFields: Array<[field: string, submitted: string, authoritative: string]> = [
    ['deliv_address_street', input.deliv_address_street, sap.address.street],
    ['deliv_address_house_number', input.deliv_address_house_number, sap.address.house_number],
    ['deliv_address_zipcode', input.deliv_address_zipcode, sap.address.postal_code],
    ['deliv_address_city', input.deliv_address_city, sap.address.city],
  ];

  for (const [field, submitted, authoritative] of addressFields) {
    const matches = equalText(submitted, authoritative);
    checks.push(
      verificationCheck(
        field,
        submitted,
        authoritative,
        matches ? 'MATCH' : 'MISMATCH',
        matches ? 'Address component matches.' : 'Address component differs from SAP.',
        'The installation address is used to confirm that the submitted plant is the expected physical location.',
      ),
    );
  }

  if (input.production_type === 'Keine') {
    checks.push(verificationCheck('production_type', input.production_type, null, 'MATCH', 'No generation plant is declared for this building construct.', 'Plant comparison is skipped for a building construct without generation.'));
    checks.push(verificationCheck('plant_capacity_kw', input.plant_capacity_kw, null, 'MATCH', 'No generation capacity is declared.', 'Capacity comparison is skipped when production type is Keine.'));
  } else {
    const productionTypeMatches = input.production_type === sap.plant.production_type;
    checks.push(verificationCheck('production_type', input.production_type, sap.plant.production_type, productionTypeMatches ? 'MATCH' : 'MISMATCH', productionTypeMatches ? 'Production technology matches.' : 'Production technology differs from SAP.', 'The registered plant technology must match the onboarding declaration.'));
    const capacityMatches = Math.abs(input.plant_capacity_kw - sap.plant.capacity_kw) <= CAPACITY_TOLERANCE_KW;
    checks.push(verificationCheck('plant_capacity_kw', input.plant_capacity_kw, sap.plant.capacity_kw, capacityMatches ? 'MATCH' : 'MISMATCH', capacityMatches ? 'The submitted capacity matches the registered capacity.' : 'The submitted capacity differs from the registered capacity.', 'The declared plant must correspond to the plant registered in VNB master data.'));
  }

  const buildingMatches = input.building_id === sap.building_id;
  checks.push(
    verificationCheck(
      'building_id',
      input.building_id,
      sap.building_id,
      buildingMatches ? 'MATCH' : 'MISMATCH',
      buildingMatches ? 'Building reference matches.' : 'Building reference differs from SAP.',
      'The plant must belong to the proposed building or sharing group.',
    ),
  );
  // MaLo is optional in the established FEED_IN request format. SAP owns the
  // authoritative value when the client does not send one.
  const maloMatches = !input.market_location_malo || input.market_location_malo === sap.market_location_malo;
  checks.push(verificationCheck(
    'market_location_malo', input.market_location_malo, sap.market_location_malo,
    maloMatches ? 'MATCH' : 'MISMATCH',
    input.market_location_malo
      ? maloMatches ? 'MaLo identifier matches.' : 'MaLo identifier differs from SAP.'
      : 'MaLo identifier was derived from SAP and matches the authoritative record.',
    'The MaLo identifies the market location associated with the verified MeLo.',
  ));

  const effectiveAt = new Date(input.preferred_delivery_start ?? input.contract_start_utc);
  const validFrom = new Date(sap.valid_from);
  const validTo = sap.valid_to ? new Date(sap.valid_to) : null;
  const isActiveAtEffectiveDate =
    sap.status === 'ACTIVE' && effectiveAt >= validFrom && (!validTo || effectiveAt < validTo);

  checks.push(
    verificationCheck(
      'effective_period',
      effectiveAt.toISOString(),
      `${sap.valid_from}/${sap.valid_to ?? 'open'}`,
      isActiveAtEffectiveDate ? 'MATCH' : 'MISMATCH',
      isActiveAtEffectiveDate
        ? 'The authoritative record is active at the intended date.'
        : 'The authoritative record is not active at the intended date.',
      'The plant must be valid when the requested participation starts.',
    ),
  );

  return checks;
}

function buildResponse(
  status: Status,
  message: string,
  localChecks: LocalCheck[],
  localChecksPassed: boolean,
  onboardingAction: VerificationResponse['onboarding_action'],
  verification: VerificationResponse['verification'] = { performed: false, source: null, checks: [] },
): VerificationResponse {
  return {
    status,
    valid: localChecksPassed,
    verified: status === 'VERIFIED',
    message,
    validation: { passed: localChecksPassed, checks: localChecks },
    verification,
    onboarding_action: onboardingAction,
  };
}

export async function verifyProducer(
  input: ProducerOnboarding,
  localChecks: LocalCheck[],
): Promise<VerificationResponse> {
  if (hasValidationError(localChecks)) {
    return buildResponse(
      'VALIDATION_FAILED',
      'The onboarding data contains fields that must be corrected.',
      localChecks,
      false,
      'CORRECT_DATA',
    );
  }

  const normalized = normalize(input);
  const identifier = normalized.market_location_identifier ?? '';

  let sapLocation: SapLocation | null;
  try {
    sapLocation = await getSapLocation(identifier);
  } catch {
    // Only a failure to reach the authoritative source is treated as
    // SOURCE_UNAVAILABLE. Defects in the comparison logic below are not
    // caught here and will surface as real errors.
    return buildResponse(
      'SOURCE_UNAVAILABLE',
      'The authoritative SAP source is currently unavailable.',
      localChecks,
      true,
      'RETRY_LATER',
    );
  }

  if (!sapLocation) {
    return buildResponse(
      'NOT_VERIFIABLE',
      'No authoritative SAP record was found for the submitted identifier.',
      localChecks,
      true,
      'REQUEST_CLARIFICATION',
    );
  }

  const checks = compare(normalized, sapLocation);
  const networkOperatorMismatch = checks.some(
    (check) => check.field === 'network_operator' && check.result === 'MISMATCH',
  );
  const anyMismatch = checks.some((check) => check.result === 'MISMATCH');

  // Mismatches cannot be resolved automatically in this flow, so reject them.
  const status: Status = networkOperatorMismatch || anyMismatch ? 'REJECTED' : 'VERIFIED';

  const message =
    status === 'VERIFIED'
      ? 'The onboarding data is valid and matches the authoritative data.'
      : status === 'REJECTED'
        ? 'The location cannot be accepted by this VNB.'
        : 'The onboarding data does not match the authoritative data and was rejected.';

  const onboardingAction =
    status === 'VERIFIED' ? 'CONTINUE' : status === 'REJECTED' ? 'STOP' : 'PAUSE_FOR_REVIEW';

  return buildResponse(status, message, localChecks, true, onboardingAction, {
    performed: true,
    source: 'MOCK_SAP',
    checks,
  });
}
