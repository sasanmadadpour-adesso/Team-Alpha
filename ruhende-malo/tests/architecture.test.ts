import { describe, expect, it } from 'vitest';
import { SapIsuNotConfiguredAdapter } from '../srv/adapters/sap-isu-not-configured.js';

describe('Phase-A-Sicherheitsgrenze', () => {
  it('verhindert eine nicht konfigurierte SAP-Verbindung', () => {
    expect(() => new SapIsuNotConfiguredAdapter().connect()).toThrow('NOT_CONFIGURED');
  });
});
