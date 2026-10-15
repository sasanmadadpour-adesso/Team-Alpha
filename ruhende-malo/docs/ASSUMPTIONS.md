# Assumptions and Limitations

- Phase A contains only the local technical foundation.
- There is no SAP connection. The SAP adapter intentionally fails with `NOT_CONFIGURED`.
- The persisted system status is a technical Phase A record, not a workbook or SAP business record.
- The import uses only `MK7 Teilnehmer`; hourly measurements are irrelevant to Phase B.
- Empty SAP-related source attributes are retained as unverified source data and are not interpreted as successful checks.
- `supplyStartUtc` is a workbook/demo date, not a confirmed Ruhendstellung effective date.
- Phase C treats SAP and market prerequisites as `UNKNOWN` under the default strict profile. `ASSUMED_DEMO` must be explicitly selected for each preview/execution and never represents SAP verification.
- A Phase C Ruhendstellung changes only local simulated lifecycle state. Relationship reconciliation remains a separate Phase D concern.
