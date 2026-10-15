import { describe, expect, it } from 'vitest';
import { SapIsuNotConfiguredAdapter } from '../srv/adapters/sap-isu-not-configured.js';

describe('Phase A safety boundary', () => {
  it('prevents an unconfigured SAP connection', () => {
    expect(() => new SapIsuNotConfiguredAdapter().connect()).toThrow('NOT_CONFIGURED');
  });
});
