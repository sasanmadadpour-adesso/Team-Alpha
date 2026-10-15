import { IdentifierType } from '../../common/types';

export type ProviderResultStatus = 'FOUND' | 'NOT_FOUND' | 'MULTIPLE_MATCHES' | 'NOT_ACTIVE_AT_DATE' | 'SOURCE_UNAVAILABLE' | 'DATA_NOT_MAINTAINED';

export type AuthoritativeLocation = {
  status: ProviderResultStatus;
  identifier: string;
  identifierType: IdentifierType;
  networkOperatorMatch: boolean;
  address?: { street: string; houseNumber: string; postalCode: string; city: string };
  plant?: { technology: string; capacityKw: number; status: string };
  connectionObjectId?: string;
  buildingReference?: string;
  validFrom?: string;
  validTo?: string | null;
  sourceSystem: string;
  sourceRecordId?: string;
  details?: Record<string, unknown>;
};

export interface SapVerificationProvider {
  resolveIdentifier(input: { identifier: string; detectedType: IdentifierType; effectiveAt: string; correlationId: string }): Promise<AuthoritativeLocation>;
}
