# Current architecture and evidence index

Updated 2026-11-05 for N00-02 at base `86959b96472ef30eda711a28087dbe106baf5674`. That commit adds vNext planning/baseline records; executable source still matches `cef7dc17172f7c6cda930c99648a5e3ad609cc55`. This index documents source and scoped evidence, not production readiness.

## Implemented local architecture

| Boundary | Current source | Scope and limits |
|---|---|---|
| Web client | `apps/portal-web/app/components/WorldRoomPanel.tsx`; `packages/pixi-scene/src/renderer.ts` | Dynamic client-only Pixi scene mount plus native keyboard/DOM controls; room state comes from authenticated server snapshots. |
| API composition | `apps/platform-api/src/app.ts` | Nest/Fastify modular monolith composes identity, social, rooms, safety, travel, focus, hospitality, events/reservations, progression and discovery. Current module directories are incremental boundaries, not separate deployed services. |
| Room ownership | `apps/platform-api/src/rooms/authority.ts`, `rooms/service.ts` | One schema/process owner, PostgreSQL advisory lock and serialized authority. No multi-replica/fenced routing or production CCU claim. |
| Persistence | `apps/platform-api/src/db/migrations.ts`, `db/migrations/` | PostgreSQL/Drizzle; 38 checksum migrations, transactional journal and exact readiness. Do not edit historical SQL or down-migrate existing data. |
| World integration | `packages/{deadline,maid,library,restaurant,lounge,park}-world`; API world/engine adapters | Actual local scenes and rules exist; installation/rollout remain default OFF and local installers reject production. Dating remains a distinct synthetic gated prototype. |
| Legacy source | `integrations/legacy-snapshots/` | Owner-selected immutable Deadline/Maid pins; independent copies and dependency graphs. No source-data/history import or identity merge inferred. |
| Operations | `apps/platform-api/src/operations/`; `infra/compose/`; `.github/workflows/quality.yml` | Local guarded telemetry/recovery/drain and CI exist. Admin app, independent durable worker, hardened split images, GitOps deployment and platform queue remain vNext work. |
| Native mobile | [vNext execution profile](../plans/platform-vnext/architecture/05-CACHYOS-ANDROID-FIRST.md) | Android-first plan on CachyOS; no native binary, physical-device gate or store distribution is established by this documentation. N14 iOS and N13 scale remain conditional. |

## Evidence and applicability

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| [N00-01 baseline](../plans/platform-vnext/audit/N00-01-BASELINE.md) and [checks](../plans/platform-vnext/audit/N00-01-CHECKS.json) | Fresh frozen install, core exit 0 (28 governance / 278 unit / 553 integration), legacy browser exit 0 (40 executions), original evidence/source preservation and disposable cleanup at the pinned source. | Other five browser groups were not freshly run locally; no deployment/mobile/capacity/release certification. |
| [Current Nxx ledger](../plans/platform-vnext/state/task-state.json) and [evidence index](../plans/platform-vnext/state/evidence-index.json) | Authoritative vNext scheduling and task-specific verification references. | Planning files or a helper PASS do not implement application features. |
| [Historical Mxx ledger](../agent/task-state.json) | 151 tasks: 148 VERIFIED, M20-07/M23-03/M23-05 BLOCKED_EXTERNAL, with retained scoped evidence. | Not 148 fresh test runs; not a public release. |
| [Actual cross-world journey](../agent/evidence/m22-actual-city-checks.json) / [ADR0097](../adr/0097-actual-cross-world-browser-journey.md) | Actual City → Deadline → Maid → Library → Restaurant → City journey, one identity/membership, separate labelled synthetic fault case. | Does not make the earlier synthetic-only checkpoint actual integration evidence or establish production operations. |
| [Historical offline handoff](../agent/OFFLINE-HANDOFF.md) / [M23 final checks](../agent/evidence/m23-handoff-checks.json) | Completed local Mxx scope and historical world/recovery/safety verification. | “Offline work exhausted” does not block authorized vNext work. |
| [Hosted Quality observation](https://github.com/tiecont/virtual-life-platform/actions/runs/42037215254) | Existing baseline run failed at desktop Deadline rAF p95 133.3 ms vs <100 ms; aggregate failed closed. | Local 33.4/16.7 ms results do not diagnose or repair hosted failure; no hosted rerun was initiated by N00-01. |

Raw N00 logs/screenshots remain private local artifacts with committed hash references. The historical evidence tree and original Mxx IDs remain unchanged. N01 must migrate consumers and validate restore before archival cleanup.

## Documentation precedence and release

Use the [vNext master](../plans/platform-vnext/MASTER-AGENT-PLAN.md), [current handoff](../plans/platform-vnext/state/HANDOFF.md), then task/dependency evidence. [ARCHITECTURE.md](ARCHITECTURE.md) and [JOURNEY-ACCEPTANCE.md](JOURNEY-ACCEPTANCE.md) retain labelled early checkpoints. [Product journeys](../product/JOURNEYS.md) remain requirements; a listed journey is not its test result.

Current public/store release is **NOT_REQUESTED** for vNext and historical public operation remains NO_GO_PUBLIC/OFFLINE_ONLY. Safety/privacy/consent, operator coverage, adult verification, media rights, backups, monitoring and exact candidate gates remain mandatory. Code preparation for mobile/Kubernetes does not authorize deployment, purchases, production-data changes or store publication.
