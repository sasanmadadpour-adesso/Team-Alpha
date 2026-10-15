export class SapIsuNotConfiguredAdapter {
  readonly status = 'NOT_CONFIGURED' as const;

  connect(): never {
    throw new Error('NOT_CONFIGURED: Es besteht keine Verbindung zu SAP IS-U.');
  }
}
