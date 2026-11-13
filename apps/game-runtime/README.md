# Native gameplay runtime

The runtime is default-off. NestJS keeps identity, admission, safety and the
platform ledger; legacy rooms continue through Nest RoomAuthority. This binary
uses the existing single-writer `vl-persistence::Host` for both native rulesets.
It never migrates the database or grants platform rewards.

The isolated Linux process suites are reproducible without Unity:

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm --filter @virtual-city/platform-api build
cargo build --locked --package vl-game-runtime
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --pet-arena
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --pet-arena-loss
```

Each suite owns disposable PostgreSQL, restricted roles, ephemeral TLS material,
a loopback Nest HTTPS/WSS gateway and an actual Rust process. Facts and private
fixture material stay under ignored `artifacts/`. These are developer tests,
not a production activation or Unity player qualification.

For a reviewed local allocator, the existing explicit `VL_GAMEPLAY_ENABLED=1`,
`VL_GAMEPLAY_CONFIG` and `VL_GAME_DATABASE_URL` configuration is required. The
upstream bind must be loopback behind trusted TLS. The configuration file is
private: it includes the exact world, leased logical boot, match UUID, player
UUID, ticket public keys, PostgreSQL CA and role, HTTPS origin, engine digest,
and storage key ring. Do not place credentials or key material in source or
Unity assets. A missing/incompatible key, scope, checkpoint or ruleset fails
closed. A new logical boot requires the existing authorized recovery procedure.

Recovery also authenticates historical receipt and event ciphertext and hashes
in pages of sixteen records. Every checkpoint version must have its receipt;
event indices must be contiguous within each recorded turn. The runtime role
can read the encrypted event journal for this check and cannot update/delete it.
Missing historical keys, damaged snapshots/journals and an incompatible engine
stop startup before a listener opens, preserving state and pending settlement.
The Pet Arena process suites exercise these failures and then resume the intact
match through a terminal outcome. These checks do not prove a complete reducer
replay from genesis, detect deletion of every event for a turn, or qualify native
backup/restore, retention or deletion policy. Those remain part of VL-055.

The `headless-counter` ruleset remains a synthetic three-turn transport fixture.
The `pet-arena-pve` ruleset runs the pinned `vl-pet-arena::combat::Combat` reducer.
It additionally requires server-selected `pet` (0–7) and `stage` (0–5). The client
cannot select those fields or supply entropy, damage, outcomes or reward values.
Obtain its adapter content hash with:

```sh
artifacts/rust/target/debug/vl-game-runtime --ruleset-content-hash pet-arena-pve
```

Use that exact hash for the allocator and scoped ticket configuration. The
adapter hash binds the combat hash and native membership/terminal contract;
it is intentionally different from the pure combat content hash.

Send `GameIntent.kind = pet.intent.v1` with UTF-8 JSON
`{"epoch":1,"action":{"kind":"start"}}`. Actions are `start`, `skill`, `pass`,
or `{"kind":"swap","first":0,"second":1}`. All reject unknown fields. The
protobuf envelope supplies the immutable command UUID, match UUID and expected
state version. Reuse the same UUID and payload for ambiguous-result retries.
`pet.view.v1` with an empty action payload reads the caller's current projection.
Only the configured participant may command, read or replay this match. The
projection contains board, combat health in fixed-point raw units, cooldown,
phase and committed telegraph; it excludes checkpoint secrets and RNG state.

Both wins and losses commit a terminal checkpoint, authenticated receipt,
nonprivate completion proposal and outbox atomically. The Nest worker requires
an explicit `NATIVE_REWARD_POLICY_FILE` with `completionKind` set to
`pet-arena.completed.v1`, matching world/ruleset/version/content hash and an
approved `rewardKey`. Only a winning outcome and a currently eligible active
receipt actor receive that nonmonetary completion marker. Losses reconcile as
`DECLINED`. No currency amounts or wallet writes are accepted. Before the worker
commits, caller projections return `REWARD_PENDING`; repeated delivery, receipt
replay and reconnect expose the reconciled result without a second grant.

Unity scene integration and actual Editor/player execution remain VL-081.

With explicit Aurora movement enabled, `fixture.advance.v1` also requires the
account's canonical zone position within the exported activity-terminal radius.
The manifest references the terminal collider GUID; its center and Unity's
interaction radius are exported together. All sockets for one account serialize
movement and game execution until the durable effect finishes. Host policy,
membership and receipt authentication still apply. New remote commands return
`NOT_IN_PROXIMITY`; an immutable committed retry remains readable after walking
away or restarting. Views and Pet Arena battle actions have their own admission
and do not inherit the synthetic terminal requirement. Movement remains opt-in;
nonmovement headless fixtures retain their existing command contract.

Liveness remains distinct from readiness: `/health/live` reports the process;
`/health/ready` checks the zone, owner lease, checkpoint and stored journal integrity.
`/metrics` contains aggregate receipt/rejection counters only; successful receipt
replays count as receipts. The checked-in OCI image keeps gameplay disabled.
