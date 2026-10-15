import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockSapProvider } from './providers/mock-sap.provider';
import { OdataSapProvider } from './providers/odata-sap.provider';
import { SapVerificationProvider } from './contracts/sap-verification.provider';

export const SAP_PROVIDER = Symbol('SAP_PROVIDER');

@Module({
  providers: [MockSapProvider, OdataSapProvider, {
    provide: SAP_PROVIDER,
    inject: [ConfigService, MockSapProvider, OdataSapProvider],
    useFactory: (config: ConfigService, mock: MockSapProvider, odata: OdataSapProvider): SapVerificationProvider => config.get('SAP_PROVIDER', 'mock') === 'odata' ? odata : mock,
  }],
  exports: [SAP_PROVIDER],
})
export class SapIntegrationModule {}
