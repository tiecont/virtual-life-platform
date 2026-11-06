# ADR0126 — Disjoint global admission occupancy and deferred hard limits

Status: accepted for local N09-01 reference contracts,2026-11-06.

Use one account record with mutually exclusive WAITING/RESERVED/ACTIVE/RECONNECT_GRACE phases. Count only the last three against effective hard capacity. New reservations require occupancy<target≤hard; room/booking holds do not add global slots and travel reuses the current lease. Queue identities, bounded deadlines and actor-derived authority are separate from room membership and native/browser authentication.

Lower target drains without kicks. Hard reduction is desired/pending while occupancy is too high, applying only after it fits. Existing counted grace/reservations can transition without allocating another slot; queue pause prevents new offers, while maintenance/safety/entitlement still govern actual activity. Never infer capacity from missing metrics or forget an active slot simply because monitoring/owner state is unavailable.

Ship additive strict public schemas and a deterministic server-side reference model first, with executable state/property coverage and no runtime wiring. N09-02 supplies transactional PostgreSQL allocation, receipts, current session/owner binding and restart/expiry reconciliation. N09-04 needs fresh measured capacity and audited operator policy. Reference model/technical validation ceilings are not sustainable CCU or production authorization.
