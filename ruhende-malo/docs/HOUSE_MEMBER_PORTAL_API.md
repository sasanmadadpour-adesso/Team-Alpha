# House Member Portal API

`GET /api/v1/house-member-portal?malo={malo}&range={range}` is the authenticated, read-only backend-for-frontend contract for the White-Label MVP.

## Contract

- Supported ranges: `24h`, `7d`, `30d`, `90d`, `1y`.
- Aggregation: hour for `24h`, day for `7d`/`30d`/`90d`, week for `1y`.
- Ranges end at the latest complete consumption/generation source interval.
- An optional `building` query parameter resolves future cross-building identity conflicts.
- The response follows the partner's strict schema version `1.0`; no extra pipeline properties are emitted.
- `switchoverStatus` is `COMPLETED` only when the shared case engine reports `DONE` and business state `RUHEND`; otherwise it is `IN_PROGRESS`.
- Member count means participating, non-excluded household MaLos in the building.

## Energy semantics

Building values are derived per hourly interval:

- local energy = `min(consumption, generation)`
- grid import = `max(consumption - generation, 0)`
- grid export = `max(generation - consumption, 0)`

Member local energy is allocated in proportion to each member's hourly consumption. This is an explicit **demo derivation**, not settlement, billing, measured grid flow, or SAP verification.

## Security and errors

A Bearer session or API key is required. Recommended for another MVP: a backend-only `VIEWER` key. Never expose it in browser JavaScript.

Errors: `400 MALO_REQUIRED`, `400 INVALID_RANGE`, `401 AUTH_REQUIRED`, `404 MALO_NOT_FOUND`, `409 AMBIGUOUS_MALO`, and `422 ENERGY_DATA_UNAVAILABLE`.

## Minimal member validation

```http
GET /api/v1/validate-house-member?malo=50539603888&houseNumber=21
Authorization: Bearer rk_...
```

The response is only the JSON boolean `true` or `false`. It returns `false` for missing, unknown, mismatched, ambiguous, excluded, or nonparticipating records. The check is read-only and does not disclose an address or explain which input was wrong.
