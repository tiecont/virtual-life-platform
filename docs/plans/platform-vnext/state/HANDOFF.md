# Handoff — N00-01 baseline verified

## Current checkpoint — 2026-11-05

Baseline HEAD: `cef7dc17172f7c6cda930c99648a5e3ad609cc55`, identical to the design audit. Branch: `codex/vnext-n00-01-baseline`. Entry dirty state contained only the supplied untracked pack, nested one level too deep. Its 41 files now occupy the intended `docs/plans/platform-vnext/` path. No runtime source, old ledger, config, lockfile, migration or legacy data was changed.

N00-01 is VERIFIED as an audit, including the recorded hosted failure. Current ledger: **1 VERIFIED / 68 TODO**, N13/N14 conditional/inactive, release status NOT_REQUESTED, no distributed mobile clients. See the [baseline report](../audit/N00-01-BASELINE.md), [checks](../audit/N00-01-CHECKS.json) and [evidence index](evidence-index.json). Other Nxx tasks are not implemented by this checkpoint.

## Actual execution

- Frozen install: exit 0, using the existing dependency store.
- `pnpm check`: exit 0; 28 governance / 278 unit in 58 files / 553 PostgreSQL integration in 38 files; all chained validators, lint, types, assets/policy and builds.
- `pnpm ci:browser legacy`: exit 0; 40 executions / eight specs / 16 device lifetimes / eight validated batch reports. Other five local browser groups were not rerun.
- Plan validator/scheduler: exit 0; 15 modules / 69 tasks / one evidence record; N00-02 is next.
- Preservation and cleanup: exit 0. All 4,365 pre-existing tracked hashes, including 3,586 historical evidence files, match preflight. All 147 original + 147 copied legacy file hashes and original HEAD/status fingerprints match. Fifty fresh browser-generated files were saved separately and historical paths restored (15 had changed bytes). All 17 owned test DB projects are gone; ports 3300/4300/4400 are free. No verification/preview process remains.

Environment: Linux x64, Node 26.9.0/pnpm 11.28.5, Docker 29.9.0/Compose 5.6.0, disposable PostgreSQL 17.7-alpine, Playwright 1.64.1/Chromium 156.0.8078.4. Mobile browser is emulation. Selected Deadline declares Node 26.13.x; this run retains the repository pin.

## Findings and preservation

Hosted [Quality run 42037215254](https://github.com/tiecont/virtual-life-platform/actions/runs/42037215254), attempt 1 at this SHA, completed **failure**. Core and five browser groups succeeded; legacy failed at `deadline-acceptance.spec.ts:76`: desktop rAF p95 **133.3 ms** against **<100 ms**. Aggregate quality failed closed. The local assertion passed at **33.4 ms desktop / 16.7 ms mobile** without source/budget/retry changes. Cause and hosted regression remain unresolved. No hosted run was triggered/retried or branch policy revalidated.

Raw logs/reports, fifty fresh generated files and utility sources are private/local under `artifacts/vnext/n00-01/` (mode 0700), indexed by hashes. Retention lasts until owner cleanup; no off-host archive is implied. Initial evidence assembly found a recorder/facts filename collision; separate preservation-facts and command-metadata paths corrected it, followed by a successful preservation recheck. No historical bytes were lost. N01 must migrate consumers and verify archive restore before removing old evidence.

Historical Mxx state remains 151 tasks / 148 VERIFIED / three BLOCKED_EXTERNAL, recomputed by ops-watch, not 148 fresh runs. Public/restricted safety/media gates stay closed. No public deployment, production/retained DB migration, load qualification, native/physical-device/store work occurred. Root documentation drift remains N00-02.

## Next exact action

Run `node docs/plans/platform-vnext/tools/validate-plan.mjs` and `node docs/plans/platform-vnext/tools/next-task.mjs`. Reserve **N00-02** in task-state on the next work branch and read `plans/N00-baseline.md`. Merge the AGENTS addendum without replacing existing instructions, link root master/README to vNext, and reconcile current architecture/evidence docs with historical labels. Preserve all Mxx IDs/evidence and public gates. Run `pnpm governance:check`, `pnpm architecture:check` and the plan validator; record actual exits and update state/handoff.

N00-03 and N01-01 are also ready at lower priority. Server/store credentials are not needed to begin N00-02. Nothing is promised to continue in a hidden background process.

## Planning provenance

The preceding design handoff delivered 14 workstreams/64 tasks, contracts, gates and read-only helpers; its review did not run the application. The old offline Mxx checkpoint does not block newly requested vNext work. Code authorization does not grant public/store release authority.

## Revision 2.1 reconciliation

The supplied Android-first revision replaced the planning templates during final review. Its master, N00 acceptance and CachyOS execution profile were reread. N00-01 acceptance is unchanged. All 69 task IDs, N14 conditional activation and Android/iOS distribution contexts are preserved; only completed N00-01 evidence/status is restored. Runtime inputs remain identical to the tested baseline. No Android/iOS task or physical-device gate was executed. Updated plan/helper checks are recorded separately.

## Supplied revision 2.1 planning handoff — historical template

# Handoff — vNext architecture delivered

## Đã làm trong lượt lập kế hoạch

- Đọc ZIP gốc và snapshot GitHub pin SHA.
- Audit source/deployment/runtime/UX trọng yếu; phân biệt evidence lịch sử và thiếu xác minh.
- Thiết kế kiến trúc, 15 workstreams/69 tasks (revision 2.1), contracts, quality gates và helper validate/next-task.
- Bổ sung execution profile CachyOS + một Android; Android gates độc lập, N14 iOS conditional và compatibility contexts theo platform.
- Không sửa repository remote, không chạy deployment/load production, không công bố app/store.

## Tiếp tục

1. Đặt gói tại `docs/plans/platform-vnext/` và merge AGENTS addendum khi thực thi được yêu cầu.
2. Chạy `node docs/plans/platform-vnext/tools/validate-plan.mjs`.
3. Chạy `node docs/plans/platform-vnext/tools/next-task.mjs`.
4. Bắt đầu `N00-01`; kiểm HEAD mới thay vì giả audit snapshot luôn là latest.

## Rủi ro cần nhớ

Singleton PG lock, global serialization, exact migration readiness và offline policy assertions là facts cần xử lý. Current capacity chưa phải production CCU. Mobile auth không dùng cách bỏ Origin/CSRF. Evidence archive phải migrate consumers trước xóa. N13 scaling và N14 iOS conditional, không chặn Android/web. Android/iOS distribution flags phải ghi đúng từ lần phân phối đầu; không lấy một Android baseline làm broad device hoặc iOS certification.

## Next exact action

Inspect current repository AGENTS.md, `git status --short`, `git rev-parse HEAD`, package scripts and the latest CI result; record scope-specific baseline for N00-01.
