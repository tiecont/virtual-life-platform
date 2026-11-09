# Rust runtime — game loops, actor ownership, deterministic reducers

## Workspace đề xuất
```
apps/game-runtime/      # one executable: axum + tonic + Tokio
crates/vl-protocol/     # protobuf generated, stable errors/versioning
crates/vl-world/        # zone/room actors; movement, collision, seats, entry
crates/vl-map/          # POI, spawn/teleport permission and holds
crates/vl-activity/     # session lifecycle, game launch, audience projection
crates/vl-game-core/    # pure reducer trait + canonical action/event
crates/vl-pet-arena/    # deterministic match-3, party, AI, damage
crates/vl-boardgames/   # card rules, privacy and turn timers
crates/vl-persistence/  # Pg, tx, receipts, outbox, snapshot read/write
crates/vl-security/     # signed tickets, safety generation and authz
crates/vl-observability/
```
**Namespace illustrative, reconcile existing repository package conventions at VL-001.**

## Actor/key ownership
- Per-zone or per-room single-writer mailbox with bounded queue and coalescing for movement; no process-global Promise queue or global mutex. Per-match sequential command executor for turn games.
- `WorldInput` authoritative validation: session ticket, worldId/zoneId, seq monotonic, max accel/speed, navmesh bounds, collision/capacity, teleport prohibition, no trust in client position.
- Client gets time-stamped position delta, server tick seq, interest-group updates; local prediction + reconciliation only movement. No client combat/reward claims.
- Queue overflow: movement supersedes prior unprocessed input; game commands preserve ordering and error `BACKPRESSURE`, never silently drop accepted turn.
- Tick social world **10–20 Hz** as starting point; spatial grid AOI, subscription culling, update budgets per entity, dynamic visibility.
- Static NPC/trees/doors/vehicles use deterministic **client-only cosmetic animations** unless they participate in server interaction. Server tracks only interactive state/waypoints.

## Match reducer contract
`apply(state: GameState, command: VerifiedCommand, ctx: RuleContext) -> Result<Transition, DomainError>` pure, no SQL/RPC/time in reducer. `ctx` includes fixed serverTick/logicalTime, versioned PRNG and content manifest hash. `Transition` returns canonical events, next state, per-recipient projections intent and settlement proposal; orchestration persists before emit.

## Determinism
- Use integer/fixed-point for damage, exp, random rolls; avoid nondeterministic iteration/float chaos in authoritative rules.
- PRNG version + cryptographic seed management, separate public seed hash and secret stream; do not leak hidden cards/loot.
- Canonical serialization, stable content ids, ruleset version pinned at session begin, replay golden fixtures and hash on each accepted turn.
- Server validates content versions/ability budget; rejected command is idempotent with stable error receipt where necessary.
- CPU-heavy AI/mass simulations in bounded separate worker pool (Rayon); Tokio async tasks must not run long CPU loops.

## Lifecycle
Allocate → LoadingAssets → Ready → Running → PausedOnDisconnect (per game policy) → Settling → Closed/Aborted; exception cases: revoked session, owner loss, cooldown, live deploy/drain. Every durable transition has `epoch/version`, commandId and receipt. Timers use server monotonic clock for scheduling plus durable UTC deadline for restart semantics.

## Scale-out only after gate
One Rust replica to start or explicit fixed room routes. Future: consistent partition mapping, authoritative lease/epoch/fencing in durable store, takeover reconciliation, network partition chaos, sticky route/connection drain and resync. Do not add multi-replica HPA before state ownership correctness.
