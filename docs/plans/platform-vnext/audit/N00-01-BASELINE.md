# N00-01 — current-source baseline, 2026-11-05

## Revision and scope

Baseline: `cef7dc17172f7c6cda930c99648a5e3ad609cc55`; execution branch: `codex/vnext-n00-01-baseline`. HEAD equals the vNext design audit, so there is no committed source delta to re-audit. At entry, `git status --short --branch` showed `main...origin/main` and only untracked `docs/plans/`. The supplied 41-file plan pack was nested one level too deep; its contents were moved to `docs/plans/platform-vnext/` before validation. Root documentation integration and drift correction remain N00-02.

This task audits the existing platform. It changes no gameplay, transport, schema, dependency pins, release policy, or legacy source. Fresh results below must be distinguished from the historical Mxx ledger and the earlier read-only design review. The evidence index records the source revision, command exits and artifact hashes.

## Inventory and runtime

The HEAD tree has 4,365 tracked files / 157,991,008 blob bytes; `docs/agent/evidence/` accounts for 3,586 files / 151,876,136 bytes. These are tree sizes, not Git-history or filesystem usage. All historical evidence was backed up before browser execution. The task does not perform cleanup or move evidence consumers.

| Area | Observed implementation |
|---|---|
| Applications | `apps/platform-api` (Nest/Fastify HTTP + Socket.IO), `apps/portal-web` (Next/React) |
| Shared packages | config, contracts, world-sdk, pixi-scene, focus-ui, deadline-world, maid-world, library-world, restaurant-world, lounge-world, park-world |
| Toolchain | Linux x64; Node 26.9.0; pnpm 11.28.5; Git 2.56.0; Docker Engine 29.9.0; Compose 5.6.0 |
| Main pins | TypeScript 5.9.3, Nest 11.2.8, Fastify 5.12.8, Next 16.4.4, React 19.3.1, Pixi 8.22.0, Drizzle 0.45.4, Socket.IO 4.8.4, Vitest 4.1.12 |
| Browser | Playwright 1.64.1; launched Chromium 156.0.8078.4; desktop + iPhone 13 emulation, not a physical iPhone |
| Test inventory | 58 unit files selected by the unit lane; 38 integration files, 10 governance files, 29 browser specs in six CI groups; five TypeScript load profiles |
| Deployable gaps | No admin-web, native-mobile or independent worker entrypoint at baseline; vNext designs are not implemented deployables |

Root `package.json`, workspace manifests, `vitest.config.mts`, `playwright.config.ts`, the quality workflow, DB harness and browser runners were read before execution. `pnpm check` chains governance, CI/infra/legacy/architecture validation, lint, types, dating policy, assets, governance/unit tests, real PostgreSQL integration, and package/API/web builds. It does not run browser, load, deployment or physical-device checks. `pnpm ci:browser` requires a real group argument and stops at the first failed spec. Fresh browser scope is `legacy`, selected to investigate the hosted failure and cover both existing integrated applications.

## Migrations and legacy preservation

There are 38 SQL migrations, `0001_foundation.sql` through `0038_hospitality_recipe_compatibility.sql`. The runner uses a PostgreSQL transaction, advisory migration lock and SHA-256 journal checks; historical checksum changes are rejected. Current readiness requires schema version 1 and an exact bundled migration manifest plus room authority. Migration 0038 adds recipe-reader compatibility metadata; it does not add a table or rewrite player data. Older strict workflow readers remain incompatible. No new migration is introduced or applied to a retained/production database by this task.

The test harness validates loopback/test-named DB targets, otherwise creates a uniquely owned Compose PostgreSQL database with synthetic secrets and removes its own resources. Browser execution uses one API/DB lifetime per spec/device. Ports 3300/4300/4400 were unoccupied at preflight; existing unrelated services were left alone.

Selected immutable snapshots remain Deadline `6d2ca6a4e00505b2df1d6f41f1041fa14a227c5b` (88 files) and Maid `f676298fdab6cd3f2d54ad422f409538c4bdf52a` (59 files), independently materialized under ignored `artifacts/legacy-runtime/`. Original sources were accessible for read-only hash/HEAD/status comparison. The harness prepares copies only and preserves their separate dependency graphs. Deadline declares Node 26.13.x while this execution uses the repository's 26.9.0 pin; that compatibility limit remains explicit. Source rights for local integration do not grant public media or release approval.

## Hosted CI observation

Read-only GitHub API observation on 2026-11-05: [Quality run 42037215254](https://github.com/tiecont/virtual-life-platform/actions/runs/42037215254), attempt 1, at the exact baseline SHA, completed **failure** (updated 14:23:40 UTC). Core and city/social/study/hospitality/private browser groups succeeded. The legacy group failed; the aggregate `quality` also failed.

Failure: desktop `deadline-acceptance.spec.ts`, scene loading/cache/idle/SPA budget test, line 76. Observed rAF p95 gap **133.3 ms**, required **<100 ms**. The runner stopped there; later legacy specs and the mobile Deadline acceptance batch were not demonstrated by this run. This refresh supersedes the design audit's earlier `in_progress` observation. No hosted workflow was triggered/rerun, no checks or thresholds were changed, and required-check/branch-protection policy was not revalidated.

## Fresh local execution

Frozen install exited 0 (`Already up to date` with the existing dependency store). Initial plan validation exited 0 (revision 2.0: 14 modules, 64 tasks, acyclic DAG); the initial scheduler returned only N00-01. During final review the supplied pack was updated to **revision 2.1 Android-first: 15 modules / 69 tasks**. Its master, N00 acceptance and CachyOS execution profile were reread. N00-01 acceptance is unchanged; completed audit evidence/status was reconciled into the new ledger while preserving N14 and all platform distribution contexts. The incoming templates were saved privately before reconciliation. Updated helper checks are recorded separately; none is an Android/iOS implementation or device test. Runtime source hashes still match the tested baseline. `node scripts/ops-watch.mjs` exited 0, recomputing the unchanged historical 151 tasks / 148 VERIFIED / 3 BLOCKED_EXTERNAL, no ready Mxx tasks and public release false. Those historical statuses are not 148 fresh acceptance runs.

`pnpm check` exited **0** (14:33:29–14:44:11 UTC). All chained gates passed: governance, CI contract, infra, immutable legacy snapshots, architecture, lint/boundaries, type checks, dating policy, avatar/scene provenance, **28 governance tests**, **278 unit tests in 58 files**, **553 integration tests in 38 files**, and all shared-package/API/Next builds. Integration used an owned disposable PostgreSQL 17.7-alpine container; its cleanup completed. The standalone security project's selected tests also belong to the integration project and were exercised there; no extra standalone security run is claimed.

`pnpm ci:browser legacy` exited **0** (14:44:18–14:50:56 UTC): **40 executions, eight specs, 16 spec/device lifetimes**, with eight validated batch reports. Actual Deadline identity/gameplay/safety/acceptance and Maid gameplay/safety/travel/acceptance all passed. The same Deadline cadence assertion passed locally at **33.4 ms desktop / 16.7 ms mobile**; this does not diagnose or repair the hosted failure. No budget, retry policy or source was changed. The other five browser groups were not freshly executed locally.

The preservation utility exited **0**: all **4,365 pre-existing tracked files**, including **3,586 historical evidence files**, match preflight hashes. All **147 original + 147 materialized-copy legacy file hashes** and both original HEAD/status fingerprints stayed unchanged. **50 fresh browser-generated evidence files** were saved separately under `artifacts/vnext/n00-01/browser-generated/`; all 50 historical paths were restored from backup (15 had changed bytes, 35 were freshly written with identical bytes). Equal screenshots were not required to change merely to count as fresh. The lockfile, old task ledger, configs, migrations and provenance records remain byte-for-byte intact.

The cleanup audit exited **0**: all 17 owned disposable database projects were removed (one integration plus 16 browser lifetimes), no owned containers/networks remain, and test ports 3300/4300/4400 are free. No verification process or preview is left running by this session.

N00-01 acceptance is met as an audit: actual scripts, revision, inventories, fresh lanes, preserved historical evidence and the existing hosted failure are recorded. This is explicitly permitted for a baseline task with documented failures; it is not a green hosted-CI or release assertion. [Machine-readable checks](N00-01-CHECKS.json) retain command exits and artifact hashes.

## Limits and next action

This is a baseline audit, not a release pass. No fresh production CCU benchmark, TLS/image/backup/Argo deployment, security certification, human usability/accessibility review, native build or physical-device/store test is claimed. Proposed scripts such as `images:verify`, `test:deployment`, `test:admission`, `bench:capacity` and `test:mobile:device` remain work for their owner tasks; none were treated as executed tests. Public/store release remains NOT_REQUESTED and historical world/safety/media approvals remain closed.

Raw logs, reports and freshly generated browser evidence stay in ignored local `artifacts/vnext/n00-01/`; committed files contain compact summaries and hashes. Local retention lasts until owner cleanup; no durable off-host archive has been provisioned or implied. N01 must migrate archive consumers before removing historical evidence.

Next exact action: run `node docs/plans/platform-vnext/tools/next-task.mjs`; reserve **N00-02**, read `plans/N00-baseline.md`, then integrate the AGENTS addendum/root links and reconcile current architecture/evidence documentation against this pinned baseline. Run its governance, architecture and plan validation gates. N00-03 and N01-01 may also become ready; priority selects N00-02 first.
