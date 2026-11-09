# ADR-001 — Runtime stack and authoritative ownership (updated for v1.1)

**Status PROPOSED**; see `ADR-003-DESKTOP-FIRST.md` for the desktop client priority supersession.

- **Rust data plane**: Tokio + Axum WSS, tonic internal RPC, pure rules crates, per-zone actor/tick and durable match reducers, typed Postgres (sqlx or equivalent after repo spike). Server emits canonical receipts and restricted projections. Do not persist each movement frame; semantic state snapshots and policies must support recovery.
- **NestJS control plane**: auth/session, friends, chat/moderation, admin, account recovery, economy entitlements and ledger, durable event consumer/outbox workflows. Never own movement/combat/turn truth for new games.
- **Postgres**: separate logical ownership, migrations with reviewed lock, event journal/reward receipts and unique idempotent settlement.
- **Unity 6.3 LTS + URP native Windows (PRIMARY)**: C# input, camera, preview, animation/VFX, emotes, in-world game UIs, Addressables asset streaming, direct secure WSS to Rust. Clients do not compute authoritative damage/reward or decide seat/teleport commit.
- **Next.js official web**: SSR marketing/download/update/account, no mandatory 3D world, existing web client/renderer remains an optional compatibility effort with old N06 evidence preserved.
- **Asset**: Blender source identity rig, original licensed content, Unity URP materials and assets; web thumbs/video and optional glTF lite previews.

One Rust runtime deploy initially can host multiple game modules but not one global mutex; per-zone isolation and rate limits. Split workers/distribution only after perf/availability evidence. QUIC/native UDP, Kubernetes mesh, HDRP/UE5 are conditional experiments only, not mandated service sprawl.

### Decisions not to conflate
Rust for world physics/gameplay does **not** mean Rust produces all GPU shading. Unity client local animation and visual wind are permitted; they are not authoritative gameplay calculations. Nest necessarily consumes CPU/memory for API and async I/O; “no in-RAM computations” means not owning live game simulation.
