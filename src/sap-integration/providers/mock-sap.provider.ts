import { Injectable } from '@nestjs/common';
import { AuthoritativeLocation, SapVerificationProvider } from '../contracts/sap-verification.provider';

const base = {
  address: { street: 'Vilbeler Landstrasse', houseNumber: '21', postalCode: '60388', city: 'Frankfurt am Main' },
  plant: { technology: 'SOLAR', capacityKw: 6, status: 'ACTIVE' },
  connectionObjectId: 'CO-FRA-01', buildingReference: 'B-FRA-01', validFrom: '2025-01-01T00:00:00Z', validTo: null,
  sourceSystem: 'SAP_UTILITIES', sourceRecordId: 'SAP-PLANT-FRA-01', networkOperatorMatch: true,
};

@Injectable()
export class MockSapProvider implements SapVerificationProvider {
  async resolveIdentifier(input: { identifier: string; detectedType: 'MALO' | 'MELO' | 'UNKNOWN'; effectiveAt: string; correlationId: string }): Promise<AuthoritativeLocation> {
    if (input.identifier.includes('UNAVAILABLE')) return { status: 'SOURCE_UNAVAILABLE', identifier: input.identifier, identifierType: input.detectedType, sourceSystem: 'SAP_UTILITIES', details: { reason: 'fixture_unavailable' }, networkOperatorMatch: false };
    if (input.identifier.includes('NOTFOUND')) return { status: 'NOT_FOUND', identifier: input.identifier, identifierType: input.detectedType, sourceSystem: 'SAP_UTILITIES', networkOperatorMatch: false };
    if (input.identifier.includes('MULTI')) return { status: 'MULTIPLE_MATCHES', identifier: input.identifier, identifierType: input.detectedType, sourceSystem: 'SAP_UTILITIES', networkOperatorMatch: true };
    if (input.identifier.includes('INACTIVE')) return { status: 'NOT_ACTIVE_AT_DATE', identifier: input.identifier, identifierType: input.detectedType, sourceSystem: 'SAP_UTILITIES', networkOperatorMatch: true };
    const mismatch = input.identifier.includes('MISMATCH');
    return { status: 'FOUND', identifier: input.identifier, identifierType: mismatch ? 'MALO' : input.detectedType, ...base, ...(mismatch ? { plant: { technology: 'WIND', capacityKw: 5.8, status: 'ACTIVE' } } : {}) };
  }
}
