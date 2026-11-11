# Native runtime

The default process serves foundation liveness and returns 503 for readiness.
The native route is enabled only with explicit local configuration.

Run the Linux real-process proof from the repository root.

```sh
pnpm build:packages
cargo build --locked --package vl-game-runtime
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay
```

The harness provisions its own disposable PostgreSQL schema, restricted TLS role,
Nest-issued admission tickets and loopback HTTPS/WSS proxy. It executes the
synthetic headless-counter ruleset, checks committed receipts and private views,
kills the actual runtime, restarts it and replays the original command.
It also checks readiness revocation and redacted aggregate metrics.

## Explicit local configuration

The process reads VL_GAMEPLAY_ENABLED=1, VL_GAMEPLAY_CONFIG pointing to a private
JSON file, VL_GAME_DATABASE_URL with the restricted game role and VL_RUNTIME_BIND
with a loopback socket address. The trusted TLS terminator supplies WSS.

The configuration contains schemaVersion=1, ruleset=headless-counter, world,
boot, matchId, player, publicKeys, caFile, role, origin, activeStorageKey,
storageKeys and engineHash. The integration harness creates a complete isolated
example under ignored artifacts/desktop-first/vl022/. Those generated credentials
are disposable test inputs.

The Nest allocator owns world enablement, the logical boot and its short lease.
The runtime checks that lease at admission, each command, replay and readiness.
Restart with the same allocated boot and storage keys restores the committed
checkpoint. A different boot or incompatible engine/ruleset/key fails closed.
Allocator-authorized epoch handover remains a separate ownership procedure.

## Synthetic ruleset

The sole configured player advances three turns. Each turn draws a private
integer from the canonical RNG. The public action carries an expected epoch,
and the envelope carries the match and expected state version. The final turn
appends one completion settlement. An explicitly configured platform worker
can reconcile the completion marker through VL-018.

The test ruleset proves orchestration. Pet Arena content, combat and reward
eligibility continue through VL-043, VL-044 and VL-047.

## Local observability

GET /health/live reports process liveness. GET /health/ready validates the live
zone, owner lease and authenticated stored checkpoint. GET /metrics exposes
aggregate command receipt and rejection counters. Receipt counters include
successful replays.

The checked-in OCI configuration keeps native gameplay disabled. Public release,
production configuration, legacy room ownership and platform qualification follow
their maintained task gates.
