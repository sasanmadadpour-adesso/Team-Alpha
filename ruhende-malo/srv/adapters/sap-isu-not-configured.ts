export class SapIsuNotConfiguredAdapter {
  readonly status = 'NOT_CONFIGURED' as const;

  connect(): never {
    throw new Error('NOT_CONFIGURED: There is no connection to SAP IS-U.');
  }
}
