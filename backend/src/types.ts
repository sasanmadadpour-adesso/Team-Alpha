import { ProducerInput } from './onboarding-schema';
import type { SidelyDelivery } from './sidely-client';

export type IdentifierType = 'MALO' | 'MELO' | 'UNKNOWN';
export type CheckResult = 'VALID' | 'INVALID' | 'WARNING';
export type VerificationResult = 'MATCH' | 'MISMATCH';

export type Status =
  | 'VERIFIED'
  | 'VALIDATION_FAILED'
  | 'REJECTED'
  | 'NOT_VERIFIABLE'
  | 'SOURCE_UNAVAILABLE';

export type OnboardingAction =
  | 'CONTINUE'
  | 'CORRECT_DATA'
  | 'PAUSE_FOR_REVIEW'
  | 'STOP'
  | 'REQUEST_CLARIFICATION'
  | 'RETRY_LATER';

// The normalized producer payload has the same shape as the parsed input;
// normalization only rewrites values (trimming, casing, timestamps).
export type ProducerOnboarding = ProducerInput;

export type SapLocation = {
  identifier: string;
  identifier_type: IdentifierType;
  network_operator: string;
  status: 'ACTIVE' | 'INACTIVE';
  address: {
    street: string;
    house_number: string;
    postal_code: string;
    city: string;
  };
  plant: {
    production_type: Exclude<ProducerOnboarding['production_type'], 'Keine'>;
    capacity_kw: number;
  };
  building_id: string;
  market_location_malo: string;
  valid_from: string;
  valid_to: string | null;
};

export type LocalCheck = {
  field: string;
  result: CheckResult;
  message: string;
  value?: unknown;
};

export type VerificationCheck = {
  field: string;
  submitted: unknown;
  authoritative: unknown;
  result: VerificationResult;
  message: string;
  why: string;
};

export type VerificationResponse = {
  status: Status;
  valid: boolean;
  verified: boolean;
  message: string;
  validation: {
    passed: boolean;
    checks: LocalCheck[];
  };
  verification: {
    performed: boolean;
    source: 'MOCK_SAP' | null;
    checks: VerificationCheck[];
  };
  onboarding_action: OnboardingAction;
  sidely_delivery?: SidelyDelivery;
};
