import cds from '@sap/cds';

export default class MaloService extends cds.ApplicationService {
  async init(): Promise<void> {
    this.on('health', () => ({
      status: 'OK',
      mode: 'SIMULATION',
      sapConnection: 'NOT_CONFIGURED',
    }));

    await super.init();
  }
}
