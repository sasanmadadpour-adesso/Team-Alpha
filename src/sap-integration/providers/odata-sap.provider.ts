import { Injectable } from '@nestjs/common';
import { AuthoritativeLocation, SapVerificationProvider } from '../contracts/sap-verification.provider';

@Injectable()
export class OdataSapProvider implements SapVerificationProvider {
  async resolveIdentifier(input: { identifier: string; detectedType: 'MALO' | 'MELO' | 'UNKNOWN'; effectiveAt: string; correlationId: string }): Promise<AuthoritativeLocation> {
    return { status: 'SOURCE_UNAVAILABLE', identifier: input.identifier, identifierType: input.detectedType, sourceSystem: 'SAP_ODATA', networkOperatorMatch: false, details: { reason: 'OData adapter is not configured; provide the approved SAP contract and credentials.' } };
  }
}
