# Agent progress

Current checkpoint: **W1 in progress; W0 + M03/M04/M05 + M06-01..05 VERIFIED locally. Next: M06-06 metrics/network baseline.** Project virtual-life-platform, local origin configured, no push/public release. Historical checkpoints below preserve their actual command evidence.

2026-11-02, Linux local host, Node v26.9.0, pnpm 11.28.5, Docker 29.9.0. Source of task status: task-state.json (checked by scripts/plan-status.mjs). No public release occurred.

## AUD-01..08 — VERIFIED audit, not verified legacy worlds

Inventory/identity/DB/transport/assets inspected; ADR 0001 accepts adapter-first integration. Sources have dirty changes; never overwritten or committed here. Real command results:

| Source / command | Exit | Evidence |
|---|---|---|
| Deadline pnpm lint | 1 | audit-deadline-lint.log; 521 errors in generated .next-e2e output |
| Deadline pnpm typecheck / test / build | 0 / 0 / 0 | audit-deadline-checks.json; tests 1 contract + 2 web + 4 API, some empty suites permitted |
| Maid pnpm lint / typecheck / test / build | 0 / 0 / 0 / 0 | audit-maid-checks.json; unit and 4 real PostgreSQL integration tests, disposable Docker DB |

All evidence paths under docs/agent/evidence. Legacy E2E and Deadline PG integration NOT_RUN in audit. Deadline runtime asks 26.13.x; actual 26.9.0 warning disclosed. No claim either legacy app is gameplay-complete. SHA and initial dirty states recorded in inventory JSON.

## M00-01..05 — VERIFIED governance deliverables

Product PRD, all seven world policies, seven persona journeys and wireflows, UX tokens, analytics consent/retention and content/risk/release gates written. Reconciled Deadline silent focus and Maid voluntary hospitality with source reference plans. config/rollout.json has all worlds OFF and no public release authorization. No runtime access policy or production legal compliance claimed.

- `node --test tests/governance/plan-status.test.mjs` → 0, 4 tests, no skips (m00-tests.log).
- `node scripts/verify-governance.mjs` → 0 (m00-review.log), supplied plan files, original refs, required deliverables and rollout gates validated.
- First governance checker execution → 1: actual manifest uses plans, not modules. Corrected checker and added actual-manifest regression; rerun passed.

DAG checkpoint rejects verification without evidence, unknown task IDs, cycles and completed tasks with unmet dependencies. Document-specific acceptance interpretation is recorded in ADR 0001; this is not runtime/gameplay verification.

## Historical initial wave checkpoint

W0 IN_PROGRESS (AUD/M00 verified; M01 next). W1–W4 TODO. W5/W6 TODO and publicly gated. Public release: NOT_LIVE.

## Historical initial next action

M01-01..06: create independent pinned pnpm foundation; verify HTTP → PostgreSQL migrations and readiness. Do not start M02 unless all M01 acceptance criteria are verified.

## M01-01..06 — VERIFIED local foundation (owner-amended offline scope)

Implementation commit c7ec45b9ffb2c5643890fd5a3db6787f3758c556; source archive of that commit installed from frozen lockfile on the workspace filesystem with cached packages. Node v26.9.0/pnpm 11.28.5/Linux, PostgreSQL 17.7-alpine via Docker 29.9.0; Next 16.4.4/Nest 11.2.8.

- `pnpm check` → 0 (m01-check.log): governance, lint, boundaries, types, 7 Node governance/boundary tests, 6 Vitest unit tests, 3 real PostgreSQL integration tests, API/shared-package/Next production builds. No skipped tests.
- `pnpm test:e2e` → 0 (m01-e2e-attempt2.log): 2 real browser tests (desktop/mobile), readiness through actual API/PG, keyboard refresh focus, no horizontal overflow. Screenshots m01-{desktop,mobile}.png visually inspected (mobile), original code-native UI/system fonts.
- `pnpm setup:local`, `pnpm db:up`, `pnpm db:migrate` → 0 (m01-dev-db.log); generated ignored .env, independent loopback Compose DB. `pnpm dev` + HTTP API/portal assertions → 0 (m01-dev-smoke.json); task process group terminated, DB stopped preserving volume (m01-dev-stop.log).
- `pnpm install --frozen-lockfile` → 0; fresh committed source archive `pnpm install --offline --frozen-lockfile` → 0 (m01-fresh-install.log). Initial /tmp archive install → 1 because cross-filesystem pnpm selected an empty store; repeat on workspace filesystem succeeded without fetching.
- Intentional temporary TypeScript `any` lint probe: `pnpm lint` → 1 as expected; probe removed; normal lint + boundary tests → 0 (m01-negative-gate.log, m01-boundary-recheck.log). This proves local failure propagation, not hosted branch protection.

Failures retained: first install rejected wildcard release-age exception; pinned exact exceptions fixed it. Check attempts 1/2/3 respectively found missing direct zod dependency, duplicate Nest/Fastify not-found handler, missing root pg test dependency; all fixed and final check passed. E2E attempt 1 failed because I launched its build before another build finished; rerun sequentially passed. No failure represented as success.

M01-05 remote acceptance scope changed by explicit owner instruction to code offline and create remote later (ADR 0002). CI workflow implemented with cache/PostgreSQL/E2E/artifact outputs; hosted CI/PR/required-check settings NOT_RUN. No publishing, pushing or deployment.

DB: only city foundation migration (platform_metadata plus checksum journal); repeated/concurrent application and transactional DDL rollback tested. No legacy database migration, no user data imported. Boundary checker rejects cross-app/world internals, deep package imports and manifest cycles. Further dynamic-code security review remains M22.

Next exact action: M02-01..05 architecture ownership, adapter/migration order and single-owner/future fencing ADRs; verify boundaries and architecture consistency before M03. W0 remains IN_PROGRESS until M02.

## M02-01..05 — VERIFIED architecture deliverables; W0 VERIFIED locally

Changed architecture context/container/module map, service-port responsibilities, DB ownership/transaction and migration boundaries, concrete adapter compatibility references, authority/transport ADR 0003, future lease/fencing/routing/split-brain design and invariant verification map. Current and future features explicitly distinguished. Executable ownership checker reads actual SQL migrations and guards imports; added architecture:check to root check.

- `node scripts/verify-architecture.mjs` → 0 (m02-architecture.log): 1 actual SQL table + separate journal owner, 15 source files checked.
- `pnpm lint` → 0 (m02-lint.log).
- `node --test tests/governance/*.test.mjs` → 0, 7 tests (m02-governance-tests.log).
- App code/types/build unchanged from M01 verified baseline; no repeat gameplay/runtime claim from specification checks. No DB changes in M02.

W0 AUD + M00–M02 VERIFIED for offline local scope. W1 and later NOT_VERIFIED; no public release. Next exact action M03-01..06: identity migration compatibility design, signed host-only city session cookie, guest/upgrade/rotation/logout, private choices/export/delete and deny-by-default restricted admission; verify actual PG/HTTP and browser flows before downstream M04/M05.

## M03 guest/privacy vertical slice — VERIFIED slice, module IN_PROGRESS

2026-11-02T15:15–15:17Z, local Node 26.9.0/pnpm 11.28.5/PostgreSQL 17.7-alpine. Implemented signed host-only guest sessions, trusted server identity, profile changes, separate privacy, own-data export/delete, session renewal/logout, bounded rates, post-commit revocation port, retention maintenance and deny-by-default admission/presence policy interfaces. Added real /identity DOM UI with reload and BroadcastChannel synchronization. API contract and limitations in IDENTITY-API.md and ADR 0004.

- `pnpm check` → 0: governance (7), unit (9), actual PG integration (14), lint/boundaries/types, architecture ownership (9 SQL tables + journal), production builds. m03-guest-check.log and m03-guest-checks.json.
- `pnpm test:e2e` → 0: 4 desktop/mobile browser tests, actual same-origin rewrite → API → PG, profile/privacy reload, two tabs, rotation, export/download, deletion. m03-guest-e2e.log; m03-guest-{desktop,mobile}.png (mobile visually inspected, no overflow/clipping).
- Tests include same bootstrap/profile key concurrency, tampered/legacy cookie rejection, strict forged ID/role rejection, Origin/CSRF denial including multibyte header, private-only export, deletion isolation, rate cap, expiry/purge and fresh nonce after TTL, production cookie flags. Production cookie test uses injection, not deployed HTTPS.

Database: additive 0002_identity.sql, checksum journal/transactional runner; tested only isolated fresh DBs in this slice. Existing local dev DB still at foundation until explicit pnpm db:migrate. Existing .env extended with generated SESSION_SECRET without printing/committing it; setup script now generates it. No legacy DB/source changed.

Not complete: registered-account upgrade/login, actual room/socket/travel/social binding of policy/revocation ports, production/TLS operations, legal retention approval. No world open and no public release. M03 remains IN_PROGRESS; M04/M05 are not unlocked yet.

Next exact action: M03-02 second slice — implement optional local registered upgrade retaining account ID, password-based login with salted bounded scrypt, idempotent upgrade/login and safe credential/session revocation; verify API and browser sign-out/sign-in with unchanged identity, then review all M03 criteria.

## M03 registration vertical slice — VERIFIED slice; actual socket revocation next

Actual outcomes in m03-checks.json (2026-11-02T15:29–15:31Z): `pnpm check` → 0 (7 governance/boundary, 11 unit, 18 PostgreSQL integration, lint/types/architecture and builds), `pnpm test:e2e` → 0 (6 desktop/mobile browser tests). Registered upgrade is idempotent, preserves account/profile/privacy, revokes old sessions; login works from a separate browser context and deletion invalidates that context. Passwords are salted async scrypt with bounded KDF concurrency; no external auth service or recovery promise. ADR 0005 and IDENTITY-API updated.

Regression found and fixed: m03-check-attempt2.log/json records exit 1 because identical timestamps made session-cap eviction choose a UUID-dependent session. Added monotonically generated DB creation_order in migration 0003; oldest session eviction now deterministic. Kept assertion rather than weakening it; rerun passed. Also tightened readiness to require all bundled migrations; partial-DB real HTTP test proves 503 until migrations complete.

DB migration 0003 adds platform-owned credentials/login request receipts and session creation order; SQL ownership checker covers 11 tables + journal. No production/legacy migration. Local dev database still needs pending 0002/0003 on next db:migrate.

Next exact action M03-06: implement an authentication-only Socket.IO session gateway (no rooms/travel yet) and actual network tests for origin/CSRF/auth guard, per-command reauthentication and post-commit revocation. This fulfills M03's socket revocation acceptance without starting M06 room ownership out of DAG order. M03 remains IN_PROGRESS until that guardrail slice is verified. M04/M05 remain locked.

## M03-01..06 — VERIFIED identity module; W1 still IN_PROGRESS

Final actual commands/exit codes recorded in m03-final-checks.json, 2026-11-02T15:39–15:41Z, Node 26.9.0/pnpm 11.28.5/Linux/PostgreSQL 17.7-alpine:
- `pnpm install --frozen-lockfile` → 0.
- `pnpm check` → 0: 7 governance/boundary tests, 11 unit, 29 actual PostgreSQL/HTTP/Socket.IO integration, lint/types/ownership and builds.
- `pnpm test:e2e` → 0: 6 desktop/mobile browser tests, guest/private data lifecycle and registered cross-browser continuity.

Final M03 acceptance adds actual network-authenticated Socket.IO session gateway, strict handshake and per-command guards, Origin/CSRF, private credential storage, post-commit logout/renewal/upgrade/deletion disconnection, external DB revocation checks, idle/clock expiry, bounded connections/commands and transport shutdown. Gateway is auth-only and has no room/travel/chat commands. Restricted admission/presence interfaces are fail-closed and tested for unknown age/forged roles/registered status/blocks/hidden dating/unknown worlds; live world consumers remain M05/M06/M09 acceptance, not claimed here.

Migration compatibility uses deliberate rejection of legacy cookies/body formats and documented possession-proof strategy; no legacy account migration performed. All identity tables owned by platform, explicit deletion/export/expiry policies, no credential export or logging. Server task evidence is in IDENTITY-API.md/IDENTITY-SOCKET.md and ADRs 0004/0005. M03 fulfilled its own interface/identity transport boundaries; W1 needs the remaining social/registry/room/scene/safety/travel/portal modules.

Next exact action: M04-01..05, lowest-ID ready module: friend-request state machine, reciprocal consent, atomic pair uniqueness, block policy and privacy-safe discovery. Do not start M06 before M05 verified. No public release, all worlds OFF, no remote operations.

## Owner steering — virtual-life-platform name and local origin

Project name set to virtual-life-platform in root package/manifest/docs and web branding. Origin configured locally to git@github.com:tiecont/virtual-life-platform.git. No remote network operation, push, PR or publication; owner offline instruction still active. Current directory retained for workspace/artifact continuity. ADR 0006 records this scope.

project-name-checks.json actual outcomes: frozen install → 0, pnpm build → 0, existing browser suite → 0 (6 desktop/mobile cases, including viewport checks after branding). Next exact action remains M04, dependent on verified M03 at c66520d.

## M04-01..05 — VERIFIED social domain and browser slice

Actual outcomes m04-checks.json, 2026-11-02T16:17–16:19Z, Node 26.9.0/pnpm 11.28.5/PostgreSQL 17.7-alpine:
- `pnpm check` → 0: 7 governance/boundary + 11 unit + 45 actual PostgreSQL/HTTP/Socket.IO integration tests, lint/types/ownership and production builds.
- `pnpm test:e2e` → 0: 8 desktop/mobile browser tests. Two independent browser contexts exchange/accept offers and receive actual live notifications; upgrade preserves friendship/code, block removes contact, unblock does not restore it, preference persists after reload.
- Frozen install → 0 in m04-frozen-install.log (command exit in m04-checks-attempt2.json). Source code/lock consumed for final check.

Implemented contact-code consent, SQL state/unique pair constraints, reciprocal race handling, idempotent responses, server expiry, unfriend, bilateral private block enforcement, identity-owned visibility projection, bounded/persisted abuse limits and moderation hook, account-scoped refresh events, export/delete lifecycle and actual DOM social UI. Source/protocol/state diagram in SOCIAL-API.md and ADR 0007. Migration 0004 adds five social tables; architecture checker covers 16 tables + journal. No active world source, no simulated population, no report/moderator operations claimed.

Failures retained: m04-check-attempt1 → exit 2 (frontend direct zod type import unavailable; exported contract types used instead); m04-e2e-attempt1 → exit 1 (controlled checkbox reverted during async write). Fixed pending draft/rollback and sequence guards against stale refresh; existing uncheck and reload assertions retained, rerun passed. Also added current block checks before receipt replay, tested old send/accept receipts cannot bypass a new block. Checkbox failure screenshot retained; final social desktop/mobile screenshots copied from real browser output and mobile visually inspected.

Large-graph test uses isolated explicitly synthetic 499-edge fixture and two concurrent accepts: final 500, never 501. This is invariant evidence, not a load benchmark/CCU result. Privacy source fixtures test every world key including hidden dating/unknown worlds; actual room presence remains M05/M06 integration. No public release, all world flags OFF, no legacy changes.

Next exact action: M05-01..05 read plans/05-world-sdk-registry.md, implement versioned world contracts + flags/registry, guarded lifecycle sample sandbox and private discovery tests. M06 stays gated until M05 verified.

## M05-01..05 — VERIFIED world SDK/registry

2026-11-02T16:55Z, Node 26.9.0/pnpm 11.28.5/Linux/PostgreSQL 17.7-alpine. Evidence m05-checks.json records actual outcomes: offline lock/frozen installs -> 0; pnpm check -> 0 (7 governance,25 unit,50 PG/HTTP/Socket.IO integration; lint/types/ownership/builds); pnpm test:e2e -> 0 (8 existing desktop/mobile browser flows). No web layout/assets changed; no new visual acceptance claimed. Test DB containers cleaned up.

Strict schema/API v1 manifests/capabilities/policies/map/card metadata, frozen definitions, private hooks/single-use registry grants, bounded serial invocation queues, per-call authentication/access/membership and exact world/scene versions. Disable generation invalidates queued/in-flight ACKs and awaits shutdown; hook errors mark adapter offline and sanitize failure. SDK Sandbox is a real local lifecycle module with inspect command, explicitly no playable scene or room owner. Direct unauthorized calls, bad manifests, legacy shapes, stale assets, hidden/private/restricted discovery, flag reload/env isolation, permission/session revocation, disabled active hooks and cleanup failure tested.

Runtime flags use optional trusted local JSON plus SIGHUP wiring, default false and no production sandbox. Reload method tested over real persistent HTTP without process restart; OS signal delivery not separately exercised. Invalid/missing/unknown config disables worlds. Catalog never returns players/occupancy/policy keys. Actual membership provider defaults deny; tests label controlled membership/policy fixtures. M06 must integrate authoritative room membership/cleanup before playable room claims. Legacy strategy and wire-rejection tests do not claim bidirectional mapper/runtime integration; M15/M16 retain source/revision gates. ADR 0008 and WORLD-SDK.md document this scope and rollback.

Intentional initial acceptance run failed (7 missing-registry failures,1 schema pass) in m05-registry-red.log; implemented code passes original scenarios. One documentation apply_patch context mismatch aborted atomically and was reapplied with correct README context; no runtime verification failure hidden. No DB migration, legacy change, copied assets, remote push or public activation. W1 remains incomplete; W2–W6 not verified.

Next exact action: M06-01 room allocator with bounded authoritative capacity and authenticated join/leave, wire through existing session gateway + SDK membership port, real 100-way concurrency/admission/eviction tests. Then seats/snapshot/reconnect/benchmark before completing M06.

## M06-01 — VERIFIED allocator/join vertical slice; M06 IN_PROGRESS

2026-11-02T17:08Z, Linux/Node 26.9.0/pnpm 11.28.5/PostgreSQL 17.7-alpine. Actual commands in m06-allocator-checks.json: targeted integration -> 0 (5 tests); pnpm check -> 0 (7 governance,25 unit,55 PG/HTTP/Socket.IO integration plus lint/types/ownership/production builds). First lint found prefer-const in composition, fixed before final full check. No browser repeat in this slice; M05's 8 regression cases remain previous evidence, not new room-browser acceptance.

Implemented bounded single-owner allocator, capacity-safe provisional SDK admission, one room/account with shared tabs, scoped runtime idempotency, epoch/membership/connection guards, aggregate-only rooms HTTP, actual session gateway join/snapshot/leave ACKs, disconnect/logout cleanup, world disable generation/removal and empty-room eviction. Contracts in packages/contracts/src/rooms.ts; code in platform-api/rooms; docs in ROOMS.md. SDK now consumes authoritative RoomService membership by default (supersedes M05's default-deny checkpoint); controlled M05 fixture overrides remain labeled tests.

100 concurrent target-room attempts use real independent PostgreSQL sessions and controlled connection-ID fixtures: 7 admitted plus original owner = 8 capacity, 93 ROOM_FULL, no oversubscription; cleanup leaves original occupancy1. This is invariant evidence, NOT 100 network connections or performance measurement. Actual network tests cover ACKs/IDOR/forged authority/stale epoch/assets/replays/multitab/revocation/disable. Initial peer snapshot intentionally own-only with aggregate occupancy; no scene/chat/seat/delta/reconnect-grace acceptance claimed. No migration, assets, real-world flag change or public release.

Next exact action M06-02: declarative seat IDs per world, atomic claim/release, one seat/account, disconnect grace and final revocation cleanup; 100-way contention plus actual Socket.IO tests. Then M06-03..07 replay/security completion, privacy-safe peer projections/deltas/client recovery, benchmarks and single-owner release guard before M06 verification.

## M06-02 — VERIFIED seats/grace slice; M06 IN_PROGRESS

Actual evidence m06-seats-checks.json, 2026-11-02T17:20Z: pnpm check -> 0 (7 governance,26 unit,60 actual PG/HTTP/socket integration, lint/types/ownership/builds). Targeted room suite -> 0 (9 tests), later extended with the tenth regression. Prior full run -> 0 (59 integration), final run supersedes after the additional edge case and snapshot validation. Test containers cleaned up. No room-browser acceptance claimed yet.

Optional declarative seat IDs and seating/capacity/uniqueness validation, sandbox8 original code-defined IDs, one seat/account and owner/seat, live-session/membership/epoch/permission guards, non-mutating receipt replay, anonymous availability, 15-second capacity/seat hold, reconnect same membership, expiry cleanup and immediate revocation/leave/world disable. Real network seat/ownership/grace flows pass. 100 independent real DB sessions concurrently claiming shared-seat via controlled connection fixture -> exactly1 owner/99 SEAT_TAKEN; not a CCU/load result. Validators reject contradictory self-seat/duplicate seats/overcapacity snapshots.

Review found and fixed a potential indefinite hold: older session disconnected while a second remained live, then second logout left the older session remembered without a grace deadline. Revocation now starts bounded grace when valid dormant sessions remain but no connections. Real registered two-session regression proves expiry. No assertion weakened. No DB/art/source/rollout changes or publication. SDK seatIds default empty preserves existing presence-only manifests in this prerelease workspace; strict M05 docs amended in ROOMS.md, no deployed-client compatibility claim.

Next exact action M06-03: add actual network pending-queue/rate/expired-session/invalid-action security scenarios; finish command guards/replay audit. Continue M06-04 privacy-safe peer projections, snapshots/deltas/client sync, M06-05 restart recovery, M06-06 metrics/real network baseline, M06-07 exclusive owner guard/fencing alternative. M06 stays incomplete and downstream locked.

## M06-03 — VERIFIED realtime security slice; M06 IN_PROGRESS

2026-11-02T17:27Z: targeted real room/socket suite ->0 (13 tests); pnpm check ->0 (7 governance,26 unit,63 PG/HTTP/socket integration, lint/types/ownership/builds), in m06-security-checks.json. Strict forged action/role/account/future-schema denial, shared session command cap across room/seat events and actual slow-hook pending budget verified. Ten concurrent joins on one delayed socket ->8 successful membership responses/2 RATE_LIMITED, occupancy1.

Added trusted gateway session-ended callbacks, so idle expiry/external revocation discovered by command immediately releases room/seat ownership instead of applying network grace. Retained cookie/Origin/CSRF, expiry/revoke, IDOR, stale epoch/assets and scoped non-mutating replay assertions. Ordinary transport loss still keeps15-second grace. No DB/assets/UI/world flags changed, all containers cleaned. No public transport security approval or production readiness claimed.

Next exact action: M06-04 viewer-filtered peer snapshots, world activity source integration, room versions/deltas and client gap/resync reducer with privacy/block update tests. Remaining restart UX/benchmarks/exclusive single owner are M06-05..07; M06/downstream not complete.

## M06-04 — VERIFIED privacy-safe peer projection and delta sync

2026-11-02T17:39Z. Targeted privacy/block room test -> 0; package sync tests -> 0 (3); lint/typecheck -> 0; full `pnpm check` -> 0 with 7 governance, 28 unit, 64 real PostgreSQL/HTTP/Socket.IO integration tests and production builds. Evidence: `m06-presence-checks.json` and `m06-presence-check.log`. No browser room UI claim.

Room snapshots project only viewer-authorized profiles. Public presence is visible, hidden presence is omitted, and bilateral blocks override friendship/public settings. Seat state stays anonymous. Social block and identity/profile/privacy callbacks refresh affected rooms and emit per-connection filtered `room.delta`; targeted Socket.IO test confirms B no longer receives A after block while A sees only self. Existing room/seat/revoke/disable tests remain in the full suite.

Added strict `RoomDeltaSchema` and `applyRoomDelta`: matching epoch/room/world required, duplicates/old versions ignored, gaps reported for resync, malformed or cross-context state rejected. Server remains authoritative and recomputes each viewer projection. No room state is persisted; no fake population, scene, chat, travel or performance result claimed. Projection is safety-sensitive and must fail closed; operational metrics/retry UX are future work.

Next exact action: M06-05 reconnect after transport loss/process restart, truthful interrupted state and multi-tab recovery. Then M06-06 measured socket/join/room benchmark and bounded metrics, M06-07 single-owner/fencing guard. M06/downstream remain incomplete.

## M06-05 — VERIFIED recovery state and process restart slice

2026-11-02T17:57Z, Linux/Node26.9.0/pnpm11.28.5/PostgreSQL17.7-alpine. `pnpm check` ->0 with explicit TOP_LEVEL_EXIT=0 in m06-reconnect-complete-check.log: 7 governance,30 unit,67 actual PG/HTTP/Socket.IO integration; lint/types/architecture and production builds. Earlier staged checks retained as historical evidence; final complete check supersedes them. Child test processes and disposable DB cleaned up.

Rooms close in Fastify preClose before gateway transport closes, emitting server-stopping while connected. SDK RoomRecovery clears cached live projections/seats on loss, exposes reconnecting/interrupted/syncing state, invalidates late ACK tickets, requires authoritative snapshot, detects new membership/epoch and rejects foreign membership deltas. Real child API is SIGKILLed and restarted on the same port with the same DB/cookie: old snapshot command ->NOT_IN_ROOM; new epoch/membership,occupancy1,no phantom seat. Grace reconnect retains original seat; multi-tab tests retained. Fixed seat/reconnect delta bases and now notify peers on grace expiry/session removal; actual socket deltas apply contiguously through claim/detach/rejoin/expiry.

No room browser/scene exists yet: recovery presentation is a tested SDK state adapter for M07 consumption, not verified pixels. No DB migration, public flags, production recovery, benchmark or multi-owner claim. Runtime state remains ephemeral; restart intentionally loses seats and requires admission.

Next exact action: M06-06 bounded low-cardinality metrics and reproducible real-socket benchmark with hardware/socket count/p95 join/CPU/memory, then M06-07 exclusive owner/split-brain guard. Full M06 and downstream remain gated.
