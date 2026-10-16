import cds from '@sap/cds';

/** Internal read-only OData service. Commands live in ProcessApi (/api/v1). */
export default class MaloService extends cds.ApplicationService {
  async init(): Promise<void> {
    this.on('health', () => ({ status: 'OK', mode: 'SIMULATION', sapConnection: 'NOT_CONFIGURED' }));
    await super.init();
  }
}
