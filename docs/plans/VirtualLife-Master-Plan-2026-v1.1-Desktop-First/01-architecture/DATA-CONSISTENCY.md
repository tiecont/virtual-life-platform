# State, persistence, transactions, settlement and schema ownership

## Data stores
**PostgreSQL remains source of truth for critical persistent state.** Shared cluster is acceptable initially; separate schema/roles `platform_*` and `game_*`; game-runtime must not mutate platform ledger tables directly. Single numbered migrations journal coordinated by existing repo (do not create independent SQLx auto-migrator racing Drizzle).

## Game command transaction (logical)
1. Authenticate/authorize command and freshness of signed authority context; validate expected room/session membership and policy generation near mutation boundary.
2. Serialize per match/seat transaction; use DB unique `(game_session_id, actor_id, command_id)` and `payload_fingerprint` to distinguish duplicate same payload vs ID collision.
3. Pure Rust reducer gives next state and events; transaction checks current version/epoch, inserts command receipt, canonical events and snapshot, optional settlement/outbox atomically. Commit.
4. Only post-commit publish recipient-filtered projection and ACK. If RPC timed out, query receipt by command ID; game result cannot be guessed by UI.
5. Nest async worker consumes game outbox and writes platform inbox keyed `(source, event_id, effect_type)` + ledger transaction; duplicates safe; failed consumer retries with backoff/dead letter and operator reconciliation.

## Critical invariants
- One active avatar per account within mutually exclusive world/instance membership policy; no double travel.
- One active seat holder per seat and epoch; seat TTL or durable ownership; no stuck seat after crash/logout.
- One accepted version transition per match; exactly one settlement for each finalized matchId.
- No hidden card/secret seed in public event feed, telemetry or client caches.
- No platform currency mutation without platform ledger transaction; reward result can be pending, not invented on client.
- Revocation/block/age/consent enforcement at read and write paths including recipient fanout.

## Snapshots
World movement is soft real-time/ephemeral; do not flush 20 position snapshots every second to Postgres. Persist visit/instance membership semantics, checkpoint position on intervals/transfer/logout as bounded effort, and degrade to safe spawn on recovery. Match turns require durable event+snapshot per accepted decision; Lodge encrypted journal contract must remain readable, not converted in place without proof.

## Migration patterns
Expand → dual read adapter (not dual authoritative write) → scoped cutover → verify → contract later. Rust can shadow-**compute** a legacy match for test but cannot commit two results. Store rules/content/engine versions and build digests for replay/rollback; rollback old binaries only if they can read new committed states or safely drain/abort.
