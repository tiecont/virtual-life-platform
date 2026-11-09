# CI/CD, environments, operations, telemetry and recovery

## Deployment units
- `portal-web` Next; `admin-web` existing; `platform-api` Nest; `platform-worker` separate entrypoint; `game-runtime` Rust OCI **new**; `migration-job` *single* allocated journal; `asset-cdn` hashed content.
- Reuse existing GitHub Actions/GHCR/ArgoCD/Kustomize if verified in HEAD; don't introduce new cluster just because Rust binary added.
- Rust game-runtime independent readiness/liveness, graceful connection drain; versions in response headers/status/metrics; feature flag per world/game instance (default OFF).

## Environments
Local Docker Compose profile optional game runtime + PG fixture + seed; CI integration ephemeral PG; staging with real TLS and load test profiles; production gated manual promotion. Secrets via repo's existing secret-management method; no credentials committed. Single replica game runtime initial until actor ownership reviewed.

## Quality CI
Rust `cargo fmt --check`, `clippy -D warnings` where feasible with pinned toolchain, unit/proptest/fuzz fixtures, DB integration, protobuf backward compatibility, deterministic replay and TS/C# binding compatibility; web e2e + Lighthouse/trace benchmark; art exporter validation.

## Observability
End-to-end traceId/requestId + gameSession/instance hash (avoid raw player ID). Rust metrics: tick duration/overrun, mailbox depth, input rate, AOI subscribers, recipient fanout, command receipt latency, DB retries, reward outbox lag, scene/asset version drift. Web: p50/p95 FPS, shader hitch, initial payload bytes, long tasks, memory. Native: FPS/thermal/battery/memory on real devices.

## Recovery drills
Kill Rust during turn, teleport hold, seated game, in-flight reward. Restore DB from backup on staging with encrypted Lodge fixture. Roll back release while active sessions: version fence and drain/abort with truthful state. Provider outage (CDN/DB/auth) displays real error and no phantom grants. One deploy digest, tagged asset catalog and database migration compatibility map per release.
