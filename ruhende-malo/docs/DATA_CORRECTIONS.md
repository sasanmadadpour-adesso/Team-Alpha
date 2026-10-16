# Data corrections

The supplied `data/source/new-data-source.xlsx` remains unchanged. `npm run correct:data` reproducibly creates `new-data-source-corrected.xlsx`, which is the SQLite import baseline.

## DC-001 — Cross-building demo MaLo identity

The source assigns MaLo `50539603888` to both Frankfurt and Köln. For the clean demo baseline:

- Frankfurt keeps `50539603888`.
- Köln (`B-CGN-01`, MeLo `DE0001815707800000101300000130234`) uses synthetic MaLo `50539603891`.
- The Köln participant row and all 8,760 matching hourly-consumption rows are changed together.
- `50539603891` is unique and has a valid check digit under the project’s BDEW validation algorithm.

This is a **synthetic demo correction**, not a SAP-verified identifier. Future onboarding data comes through `POST /api/v1/producer-onboardings` and does not rewrite either workbook. Producer onboarding must provide two different identifiers: `market_location_identifier` is the 33-character MeLo and `market_location_malo` is the separate 11-digit MaLo. The MeLo cannot be used as the MaLo.
