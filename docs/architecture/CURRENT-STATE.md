# Current architecture and evidence index

Updated 2026-11-06 (Asia/Ho_Chi_Minh) for N02-02 at base `0af047d`. vNext adds evidence tooling, isolated test-output paths, pure CSS UI tokens, a mock UX prototype, static API ownership/import guards and a [hospitality durable-job boundary](HOSPITALITY-JOBS.md). Other application runtime source still matches `cef7dc17172f7c6cda930c99648a5e3ad609cc55`; outbox dispatch logic remains unchanged behind compatibility exports. This index documents source and scoped evidence, not production readiness. Use the [current documentation index](../README.md) for entrypoints.

## Implemented local architecture

| Boundary | Current source | Scope and limits |
|---|---|---|
| Web client | `apps/portal-web/app/components/WorldRoomPanel.tsx`; `packages/pixi-scene/src/renderer.ts` | Dynamic client-only Pixi scene mount plus native keyboard/DOM controls; room state comes from authenticated server snapshots. |
| API composition | `apps/platform-api/src/app.ts`; [API module map](API-MODULES.md) | Nest/Fastify modular monolith composes identity, social, rooms, safety, travel, focus, hospitality, events/reservations, progression and discovery. Static owner/public-entry checks cover 19 current areas; concrete service interfaces and type/metrics cycles remain incremental extraction work. |
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
| [N01-05 clean checkout](../evidence/N01-05-CLEAN-CHECKOUT.json) | Full-history separate clone at `6a7ae93`, frozen install, selected legacy preparation, 3,586 indexed evidence files and full check exit 0: 44 governance / 278 unit / 553 integration plus API/portal production builds; tracked tree clean. | Initial offline missing-cache failure and stopped aggregate are retained. No hosted/E2E/physical/deployment result, no reduced Git history/full-clone transfer. |
| [Historical Mxx ledger](../agent/task-state.json) | 151 tasks: 148 VERIFIED, M20-07/M23-03/M23-05 BLOCKED_EXTERNAL, with retained scoped evidence. | Not 148 fresh test runs; not a public release. |
| [Actual cross-world journey](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/evidence/m22-actual-city-checks.json) / [ADR0097](../adr/0097-actual-cross-world-browser-journey.md) | Actual City → Deadline → Maid → Library → Restaurant → City journey, one identity/membership, separate labelled synthetic fault case. | Does not make the earlier synthetic-only checkpoint actual integration evidence or establish production operations. |
| [Historical offline handoff](../agent/OFFLINE-HANDOFF.md) / [M23 final checks](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/evidence/m23-handoff-checks.json) | Completed local Mxx scope and historical world/recovery/safety verification. | “Offline work exhausted” does not block authorized vNext work. |
| [Hosted Quality observation](https://github.com/tiecont/virtual-life-platform/actions/runs/42037215254) | Existing baseline run failed at desktop Deadline rAF p95 133.3 ms vs <100 ms; aggregate failed closed. | Local 33.4/16.7 ms results do not diagnose or repair hosted failure; no hosted rerun was initiated by N00-01. |

Raw N00 logs/screenshots remain private local artifacts with committed hash references. N01-02 restored every historical file; N01-03 migrated readers/writers and preserved all existing release assertions. N01-04 removed the indexed historical outputs from the current tree, retaining byte-identical originals in private Git history and the additional encrypted store. [Index/access](../evidence/README.md) and [exact cleanup measurement](../evidence/N01-04-CLEANUP.json) distinguish this current-tree reduction from unchanged Git history. Original Mxx IDs, source/environment applicability and closed public gates remain intact.

## Documentation precedence and release

Use the [vNext master](../plans/platform-vnext/MASTER-AGENT-PLAN.md), [current handoff](../plans/platform-vnext/state/HANDOFF.md), then task/dependency evidence. [ARCHITECTURE.md](ARCHITECTURE.md) and [JOURNEY-ACCEPTANCE.md](JOURNEY-ACCEPTANCE.md) retain labelled early checkpoints. [Product journeys](../product/JOURNEYS.md) remain requirements; a listed journey is not its test result.

Current public/store release is **NOT_REQUESTED** for vNext and historical public operation remains NO_GO_PUBLIC/OFFLINE_ONLY. Safety/privacy/consent, operator coverage, adult verification, media rights, backups, monitoring and exact candidate gates remain mandatory. Code preparation for mobile/Kubernetes does not authorize deployment, purchases, production-data changes or store publication.
