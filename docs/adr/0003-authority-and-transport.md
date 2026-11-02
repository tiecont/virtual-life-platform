# ADR 0003 — Single authoritative room owner; Socket.IO; durable critical state

Status: Accepted design for local implementation, 2026-11-02 (M02-04).

Choose one API replica and an in-memory serialized room authority initially. Versioned snapshots plus sequence/epoch let clients detect stale commands and reconnect gaps. Multi-tab identity has one active membership; additional connections cannot duplicate seats/roles/rewards. The server derives identity and membership on every command. Native focus clocks use trusted timestamps, not second-by-second broadcasts.

City uses Socket.IO when M06 mounts realtime. Alternatives: raw ws retains Deadline's dependency but requires custom ack/reconnect handling; Socket.IO aligns Maid's planned transport while still requiring explicit authorization/idempotency. Neither source has a working gateway in this audit; preserve source protocol behind adapters, never pretend a raw ws client speaks Socket.IO. HTTP and sockets share service policies and error codes. M05/M06/M09 finalize versioned schemas and compatibility tests before application integration.

PostgreSQL/Drizzle persists identity, privacy, social, sanctions, intents/critical engine transitions. Transactions, row locks and unique keys protect races; ephemeral room state does not persist fake success after a crash. Redis may be added for measured cache/rate coordination needs; Pub/Sub alone gives no room authority/fencing. Do not add distributed transactions, Kafka or microservices.

Tradeoff: process restart loses ephemeral membership and seats. Clients must show interrupted/resync and re-admit; persistent focus/order state is reconciled by owner services. One-replica capacity must be measured, never advertised from an assumed CCU number. Horizontal scaling is gated on verified ownership/fencing, routing and split-brain tests, documented separately.

Migration/rollback impact: no transport or room code deployed by this ADR. Future gateway sits behind explicit feature flags. Disabling a world denies new admissions and gracefully returns current occupants; critical activity is cancelled/interrupted according to engine rules, never marked complete by disconnect. Existing repositories and DBs are unaffected.
