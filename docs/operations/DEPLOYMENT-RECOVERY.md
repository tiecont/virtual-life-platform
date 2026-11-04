# Local deployment recovery and rollback

M21-04 supports one API process per schema. This document does not authorize production deployment. [ADR0074](../adr/0074-bounded-readiness-and-compatible-local-rollback.md) records the audit and failure findings; exact results belong in `docs/agent/evidence/m21-deployment-checks.json`.

`GET /health/live` reports whether the HTTP process can respond and does not require DB access. `GET /health/ready` requires the exact bundled migration names/checksums, the expected metadata version, the existing single RoomAuthority lock and a process that has not begun draining. Unknown newer migrations make an older binary unready. A competing idle replica cannot appear ready while another owns the schema. Authority loss is terminal for that process; restart, do not advertise successful automatic state restoration.

Readiness coalesces concurrent underlying work. Checkout has a 1000ms deadline and at most one outstanding checkout even if the pool remains exhausted. Late clients are discarded. Read-only transactions apply server-local500ms statement/200ms lock timeouts, with750ms client query and1500ms response deadlines. The response deadline does not claim that all owner work ended at that exact instant: RoomAuthority has its own bounded waits, and another probe reuses outstanding work. A real test showed that destroying a timed-out client alone left a server lock waiter; server-side timeouts now stop that work while the lock is still held. Successful reads commit before returning their connection; failures destroy it. Metadata health releases its client before checking authority. Normal API pools need room for the dedicated owner connection plus application work; the main pool remains10.

SIGTERM/SIGINT begins an irreversible trusted drain, stops scheduling new maintenance and closes the app/pool. HTTP product requests and new socket handshakes are denied during drain; connected commands check availability before and after authentication. A transient session-check failure is retryable and does not claim that the user's session was revoked. Existing admitted work may finish under its existing owner/transaction guards. Shutdown hooks emit `room.ended` with `server-stopping` before disconnecting transports. The process exits with failure on a shutdown error or after12seconds; Compose allows15seconds. This is bounded stop/start recovery, not zero downtime.

Client room state is memory owned by a process epoch. After transport loss, the UI must clear confirmed entities/seats until authoritative resync. After a restart, a previously committed receipt describes history and cannot recreate a live old membership. A fresh join creates a new epoch/membership and no automatic seat claim. Durable sessions and business records survive according to their respective owner rules; an interrupted unserved order may be cancelled rather than shown as served. Recovery never restores consent automatically.

The disposable production-mode TLS harness can prove compatible API rollback:

```sh
docker build -f infra/docker/Dockerfile -t virtual-life-platform:m21-deployment .
CITY_SMOKE_IMAGE=virtual-life-platform:m21-deployment \
CITY_SMOKE_ROLLBACK_IMAGE=virtual-life-platform:m21-telemetry \
node scripts/staging-smoke.mjs
```

Both explicit local images must already exist. Before any stack mutation, the harness reads their bundled SQL migration manifests with no network and refuses any difference. It records image IDs/manifest hashes, not credentials. It then creates its own stack, checks graceful process exit0/socket closure, attempts an intentionally invalid candidate configuration and observes failed readiness, rolls back only the API to the previous compatible image, verifies preserved session identity and fresh socket authentication, then rolls forward and verifies browser reload. There is no automatic account/room admission or schema rollback. The web image stays fixed; this proves API compatibility for the exercised identity/transport paths, not a coordinated frontend rollback or every old-client contract.

The harness removes only its generated test project/volume/network/env/key/certificate. Never use its disposable `down --volumes` cleanup for a persistent environment. No production rollback helper is enabled and no public ingress is added.

Before a real release, pin reviewed immutable images and full source revisions, review compatibility with every deployed consumer, retain independent session/encryption secrets, take and restore-test encrypted backups, check migration forward/rollback strategy and have an operator decision point. A different migration manifest is a stop: this harness does not prove an older image safe after schema changes. M21-05 owns backup/restore evidence; B-001/B-002/B-003 and all world/adult/operator gates remain independent.
