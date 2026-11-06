# Current documentation entrypoints

Follow the [vNext master](plans/platform-vnext/MASTER-AGENT-PLAN.md), [current handoff](plans/platform-vnext/state/HANDOFF.md), [task state](plans/platform-vnext/state/task-state.json) and the dependency-ready module plan. The [architecture/evidence map](architecture/CURRENT-STATE.md) describes implemented source and the limits of its verification. Plans and proposed commands are requirements until implemented and actually executed.

| Topic | Canonical entrypoint | Applicability |
|---|---|---|
| Task scheduling and evidence | [vNext state](plans/platform-vnext/state/) / [quality gates](plans/platform-vnext/QUALITY-GATES.md) | Nxx implementation and exact next action; release readiness is separate |
| Historical work | [Mxx ledger](agent/task-state.json) / [offline handoff](agent/OFFLINE-HANDOFF.md) | Preserved historical source/environment results; no fresh-run implication |
| Historical raw retrieval | [Evidence index and access](evidence/README.md) / [store format](evidence/STORE.md) | Immutable private Git bytes or authenticated additional archive; full history/access required |
| Repository cleanup | [Measured cleanup](evidence/N01-04-CLEANUP.json) / [clean-checkout procedure](operations/CLEAN-CHECKOUT.md) | Current-tree reduction, not reduced Git history or full-clone transfer |
| Runtime observations | [Phase semantics and executable local profile](architecture/RUNTIME-PROFILE.md) / [serialization decision](adr/0110-retain-owner-serialization-after-local-profile.md) | Fixed labels, actual SQL/queue/fanout/wire evidence and strict diagnostic comparison; no capacity claim |
| Client compatibility | [Negotiation, legacy wire and scene identity](architecture/CLIENT-COMPATIBILITY.md) | Opt-in web adapter and pinned prior wire fixture; no fictitious released mobile binary |
| Authority and protocol | [Current invariants and adapters](architecture/AUTHORITY-PROTOCOL.md) | Optional bounded ordering and scoped replay/concurrency evidence; singleton and current clients retained |
| Runtime and ownership | [Current architecture](architecture/CURRENT-STATE.md) / [API module map](architecture/API-MODULES.md) / [table owners](architecture/ownership.json) / [ADRs](adr/) | One room owner and one database/journal; future modules are explicitly proposed |
| UX and prototype | [Journeys/direction](design/vnext/JOURNEYS-AND-DIRECTION.md) / [interactive prototype](design/vnext/prototype/README.md) | Original mock UI and scoped automated checks; no human usability or physical-device certification |
| Android | [Spike design and locked budgets](mobile/ANDROID-SPIKE.md) / [execution profile](plans/platform-vnext/architecture/05-CACHYOS-ANDROID-FIRST.md) | Android first; measured physical results remain pending; iOS N14 conditional |
| Verification | [Toolchain/build map](operations/TOOLCHAIN.md) / [isolated harness](architecture/TEST-HARNESS.md) / [CI](operations/CI.md) | Actual local commands differ from hosted workflow results |
| Release and operations | [Release decision](operations/RELEASE-DECISION.md) / [recovery](operations/DEPLOYMENT-RECOVERY.md) / [tracked drain](adr/0111-settle-maintenance-before-owner-shutdown.md) | Public/store gates remain closed; no real deployment follows from code checks |
| Environment policy | [Versioned release/runtime/safety model](operations/ENVIRONMENT-POLICY.md) | Explicit default-deny profile; one operator requirement, no provisioned identity or actual approval |
| Schema rollback | [Image-bound checksum compatibility](operations/SCHEMA-COMPATIBILITY.md) | Exact by default; expanded prefix needs its own reviewed image/data proof; no automatic down-migration |
| Durable worker | [Separate reward process and cutover](operations/DURABLE-WORKER.md) | Compiled source/process checks; default API behavior retained, no room authority or deployment approval |
| API artifact | [Production dependency image](operations/API-IMAGE.md) | Separate nonroot API artifact and same-image migrator; local inspection/smoke is distinct from deployment |
| CI release artifacts | [Source/run/digest publication and owner promotion](operations/ARTIFACT-RELEASE.md) | Default-disabled publisher; explicit enforcement fallback and local rehearsal distinguished from hosted/GHCR results |
| Web artifact | [Standalone portal/runtime origins](operations/WEB-IMAGE.md) | Same-image runtime configuration and local TLS/browser verification; normal build compatibility retained |

Historical architecture and ADR prose retain their original decisions and observations. Prefer the current map and dated task evidence when an early checkpoint differs from later implementation. Source hashes and test environments remain part of every acceptance claim.
