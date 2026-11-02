# Agent progress

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

## Waves

W0 IN_PROGRESS (AUD/M00 verified; M01 next). W1–W4 TODO. W5/W6 TODO and publicly gated. Public release: NOT_LIVE.

## Next exact action

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
