# Assumptions and Limitations

- Phase A contains only the local technical foundation.
- There is no SAP connection. The SAP adapter intentionally fails with `NOT_CONFIGURED`.
- The persisted system status is a technical Phase A record, not a workbook or SAP business record.
- The import uses only `MK7 Teilnehmer`; hourly measurements are irrelevant to Phase B.
- Empty SAP-related source attributes are retained as unverified source data and are not interpreted as successful checks.
- `supplyStartUtc` is a workbook/demo date, not a confirmed Ruhendstellung effective date.
- Phase C treats SAP and market prerequisites as `UNKNOWN` under the default strict profile. `ASSUMED_DEMO` must be explicitly selected for each preview/execution and never represents SAP verification.
- Phase D derives expected MeMa and MaMa relationships from workbook rows. These expectations describe the documented relationship shape; they do not prove relationships exist in SAP.
- Mock-observed relationships are a separate local demo fixture with provenance `EXPLICIT_LOCAL_DEMO_FIXTURE_NOT_SAP`. They are never labeled `SAP_VERIFIED`.
- Participating household rows produce expected MeMa and MaMa relationships. Participating generation rows produce MeMa only; household MaMa rules are not applied to Einspeise-MaLo.
- A matching mock-observed relationship is required for the Phase D demo baseline. Missing, extra, conflicting, invalid, or overlapping relationships block Ruhendstellung.
- vSZ readiness, relevant master data, and supplier/market process status remain `UNKNOWN` under strict policy. `ASSUMED_DEMO` explicitly assumes each check for local simulation only.
