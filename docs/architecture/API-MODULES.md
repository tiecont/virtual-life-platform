# Current API ownership and extraction map

This map starts from the implemented API at `6a7ae9328cb64e76fc1ec5c4ffa4df1ce1815a75`. At that N02-01 checkpoint, the application runtime still matched the audited `cef7dc1` baseline; later scoped behavior is indexed in CURRENT-STATE.md. N02-01 itself changed ownership/import rules, not runtime behavior or SQL. [Machine policy](api-modules.json) lists every current transitional cross-module entry file; [table ownership](ownership.json) remains authoritative for SQL ownership. Concrete service classes are current integration surfaces, not a claim that every module already has a minimal interface.

| Area / source directory | Current owner and public integration | Target / constraint |
|---|---|---|
| `identity/` | Accounts, sessions, credentials, privacy and selected legacy identity links; `IdentityService`, `AdultEligibilityProvider`, `DeadlineIdentityPort` | Explicit auth/account/transaction-lock/export/deletion ports; actor authority remains server-side |
| `social/` | Friendship, preferences, blocks and withdrawal; `SocialService`, `SocialPresencePort` | Preserve transactional contact withdrawal and current recipient projection |
| `safety/` | Chat, reports, sanctions, incidents and synthetic moderator grants; report-context and policy ports | Preserve confidential evidence, independent reviewer rules, current permission checks and deny defaults |
| `rooms/` | `RoomAuthority`, `RoomService`, metrics and Socket.IO gateway registration; `RoomSafetyPort`, `RoomProjection` | One process/schema owner; membership/seat/travel publication stays inside authority |
| `travel/`, `invitations/` | Durable travel intents/receipts and shared group/consent choices | Room hold/transfer and current consent ports; exactly one membership, no forced travel |
| `focus/` | `FocusService` and server-time timer lifecycle/history | Shared engine authority; no duplicated per-world timer or client completion |
| `hospitality/` | Order/shift/course workflow, `HospitalityStaffPort`, `HospitalityCompletionSink`, transactional outbox | [N02-02 durable-job seam](HOSPITALITY-JOBS.md) uses DB/account-lock/sink ports and retains compatibility imports |
| `events/` | Events, RSVP, reservations, parties, stage, audience and media gates; organizer/safety/invitation/reservation observers | Existing multi-owner transaction semantics remain; booking waitlists differ from platform admission |
| `progression/` | Reward ledger and appearance; transactional hospitality sink | Engine-owned SQL; never award because an animation completes |
| `dating/` | Synthetic-only restricted profile/matching/date/continuation owners and lifecycle ports | Keep real eligibility, privacy, adult and public release gates closed |
| `worlds/` | API registry composition, local installers and access-policy wiring | `WorldAdapter` through `world-sdk`; this API orchestrator is distinct from pure world packages |
| `library/`, `discovery/` | Study adapter and authorized catalog/activity projection using shared owner services | No independent timer or another world's private repository |
| `operations/` | Private telemetry, readiness and redacted log views | Read ports remain bounded; separate room-owner types/metrics from worker bootstrap as needed |
| `common/`, `config.ts` | Foundation errors/proxy/log helpers and validated environment | Foundation must not import domains; runtime switches cannot grant release entitlement |
| `db/` | One PostgreSQL, checksum migrations and `city_schema_migrations` | Only composition/migrator accesses migration internals; no second DB/ORM/journal |
| `app.ts`, `main.ts` | Coordinator-owned API composition and process lifecycle | Explicit wiring/cleanup; future worker has its own root |

The six world packages contain scene/config/adapter rules and consume public contracts/SDK. They do not own database repositories. The API installs their adapters and supplies shared engines. Current table owners map to their API area in the machine policy; all tables/journal still pass the existing migration/ownership checker.

## Actual bootstrap and dependency direction

`main.ts` validates config, creates one PostgreSQL pool, calls `createApp`, listens, installs two maintenance intervals and handles drain/shutdown. `app.ts` constructs identity/social and policy owners, world registry, the single room authority/service, safety and shared engines, then registers HTTP/socket adapters, transactional withdrawal/export/deletion hooks and bounded telemetry/readiness. Close hooks preserve interruption while sockets are still connected and release authority only after owner shutdown.

`node scripts/api-module-graph.mjs` inspects production TypeScript imports/exports and constructor/call sites in the composition roots. It distinguishes type-only bindings from ordinary imports and validates owner/table coverage and current public entry files. It is a static audit, not a dynamic call graph, permission proof or cycle-free assertion. `rooms/socket.ts` imports the telemetry type; operations imports room metric definitions and the readiness authority type. This existing coupling is retained and identified for extraction rather than hidden by a claim that all domain dependencies form a DAG.

## Enforced forbidden imports

- A domain cannot import `app.ts`/`main.ts`, migration/schema internals, or an unlisted private entry file of another API area.
- Foundation common/config/DB code cannot import domain implementations. Unknown API source areas need an explicit owner before adoption.
- World code cannot import another world or application internals; known SQL drivers and `.sql` imports are rejected. Existing package layering/deep-import and workspace-cycle checks remain.

These are static import boundaries, not a security sandbox or complete detector for computed runtime imports, arbitrary SQL strings or network calls. Typecheck and owner-scoped SQL review remain required. Current public files may expose more than the target minimal port; subsequent extraction tightens them one slice at a time while retaining compatibility exports.

## Worker seam and next slice

The current 300-second maintenance chain includes identity/legacy/social/rooms/reports/sanctions/travel/invitations/focus. The 3-second chain includes hospitality/outbox/events/stage/audience/private profile/continuation/matching/date/progression. Many of these owners consult live membership or publish owner-specific interruption/notices. Moving either entire chain to a worker would violate that lifecycle.

`HospitalityOutbox` is the bounded initial durable candidate: PostgreSQL/account locks, at-most-one delivery receipt per event/consumer, transaction-bound completion sinks and retry state. It currently runs under API maintenance and closes during API shutdown. N02-02 exposes its [DB/account-lock/sink composition seam](HOSPITALITY-JOBS.md) while preserving the API invocation and existing concurrency/deduplication tests. The independent worker entrypoint and ownership/enablement switch belong to N05-05; no worker process exists because this map mentions it.

N05-02 adds a foundation database-observation port and composition-owned pg adapter (`common/database-observation`, `db/observe-pool`) plus bounded six-command room phase metrics. The DB adapter remains unavailable as a domain import; foundation imports no domain implementation. [Runtime profile](RUNTIME-PROFILE.md) describes actual coverage and nested span semantics.

No migration, runtime flag, replica count or real operator assignment changes here. Revert this policy/map slice independently if a documented legitimate import is blocked; do not bypass safety or duplicate implementation trees to satisfy a new rule.

The operations lifecycle port `operations/runtime-lifecycle` tracks API-owned maintenance and trusted signal reloads, then settles them before the existing app/authority and pool close sequence. It imports no domain/SQL implementation and does not construct an owner or worker. See [ADR0111](../adr/0111-settle-maintenance-before-owner-shutdown.md).

N05-05 adds `worker.ts` as a separate composition root. It uses `progression/ledger`, `identity/account-locks`, `hospitality/jobs` and current durable safety policies; it cannot import session/focus/room roots in its runtime graph. `ProgressionService` and `IdentityService` keep their prior API adapters. Configuration file loading remains foundation-only. Default API behavior is retained; external dispatch and bounded retry are explicit. See [worker operation](../operations/DURABLE-WORKER.md).
