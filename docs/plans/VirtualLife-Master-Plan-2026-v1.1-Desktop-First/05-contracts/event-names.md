# Internal committed event conventions

All durable events carry `eventId`, `occurredAtUtc`, `traceId`, `schemaVersion`, `source`, `aggregateType`, `aggregateId`, `aggregateVersion`, `authorityEpoch`, `payloadFingerprint`, `sensitivity`, `recipientScope` and `idempotencyKey`. Payloads live in per-domain schema; public projections may omit fields.

| Event | Owner | Consumer | Notes |
|---|---|---|---|
| `WorldEntered` | Rust world | portal/admin metrics | only after reserved+committed travel |
| `SeatReserved`/`SeatReleased` | Rust world | gameplay UI | private participant list restrictions |
| `ActivityStarted`/`ActivityEnded` | Rust activity | social UI | active seat required |
| `GameCommandCommitted` | Rust game | replay/index | never unfiltered hidden card payload |
| `MatchSettled` | Rust game | Nest worker | result + grant proposal; outbox only after DB commit |
| `RewardGrantAcknowledged` | Nest ledger | Rust projection | idempotent result linkage |
| `PolicyGenerationChanged` | Nest identity/safety | Rust authority | immediate revoke + commit freshness check |

**Schema versioning:** additive required fields, stable UUID uniqueness, redact hidden payloads; no user ID in metrics labels.
