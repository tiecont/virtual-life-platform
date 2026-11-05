# Local CI contract and future hosted checks

M21-02 follows the owner's offline scope in [ADR0002](../adr/0002-local-foundation.md). [ADR0072](../adr/0072-offline-ci-coverage-and-fail-closed-quality-gate.md) explains the final workflow design;[actual evidence](https://github.com/tiecont/virtual-life-platform/blob/cef7dc17172f7c6cda930c99648a5e3ad609cc55/docs/agent/evidence/m21-ci-checks.json) records local commands. No remote PR,push,workflow dispatch,artifact upload or required-check setting has been executed. A passing local command does not establish hosted runner behavior or branch protection.

The proposed required check remains `quality`. Its core dependency runs `pnpm check` against isolated test PostgreSQL;this includes governance,CI/environment contracts,architecture,lint,types,policy/assets,unit/integration and builds. Browser jobs consume a validated plan covering every spec exactly once,build the same workspace and run six groups with max-parallel2/fail-fast false. Each spec/device keeps its own disposable DB/API lifetime. Both core and browser jobs have30minute budgets;these are initial limits,not measured hosted timing guarantees. Superseded workflow runs are cancelled. The optional legacy group additionally prepares the owner-selected isolated Deadline baseline;normal browser profiles keep its identity adapter OFF. Fresh hosted dependency preparation explicitly permits network access;local preparation uses the offline cache.

| Browser group | Existing specs |
|---|---|
| city | activity,header,map,discovery,foundation,portal route,park,park safety |
| social | identity,invitations,safety,social,travel |
| study | focus,library,scene,wardrobe |
| hospitality | lounge,restaurant |
| private | dating continuation,dating profile/matching/Date |
| legacy | actual pinned Deadline identity association,Deadline scene/Portal,Deadline invitations/privacy/safety |

The actual filenames live in `config/ci-browser-groups.json`:M24-01 adds park to city,making20specs across the same five groups. Coverage rejects omitted,duplicate,unknown or traversing paths. Future specs must be assigned;there is no silent test filtering. Core emits the plan as a validated job output. An invalid/missing plan cannot become a successful browser group.

The aggregate uses explicit core/browser dependencies and `if: always()`. Its tested program accepts only both success results. Failure,cancellation,skip,missing/malformed or unexpected job metadata fails. The browser matrix result represents all its groups. After creating the repository,the owner must explicitly require the `quality` status in branch protection and verify a real broken PR. That remote step is NOT_RUN under current authorization.

Read-only contents permission,pull_request rather than pull_request_target,and checkout without persistent credentials are mandatory. No production secret or deployment/publishing step exists. First-party/pnpm actions use reviewed40hex commit pins in `config/ci-actions.json`;the local checker rejects unknown/unpinned action references. These are reproducibility boundaries,not a vulnerability or transitive supply-chain certification. Forks use only isolated synthetic test credentials;the harness refuses nonlocal/nontest DB targets.

Reports have unique `ci/group/spec/device` directories. The wrapper removes old batch metadata and verifies exact spec/device/outcome records before archiving;successful metadata needs both devices. Missing/foreign/duplicate/incomplete success metadata fails the job. A failed spec stops remaining specs in its group;they are not counted passed. Other matrix groups may continue for diagnostics. Job summaries preserve actual process/result codes and report validity.

Artifacts are restricted to the core log or that group's HTML report,test-results and summary directories,with seven-day retention. Whole `artifacts/`,env files,TLS/tool caches,infra raw diagnostics,application container images and node_modules are not uploaded. Browser screenshots/traces are included;traces may contain synthetic test sessions and are private short-lived debugging evidence. Do not publish them as sanitized reports or collect real participant data. There has been no actual hosted artifact upload here.

Local commands:

```sh
pnpm ci:check
node --test tests/governance/ci.test.mjs
pnpm check
pnpm ci:browser private
```

Build API/web before the browser command if needed;never rebuild Next during an active browser run. `pnpm ci:browser <group>` runs actual specs sequentially,without widening application quotas. Full local browser coverage remains `pnpm test:e2e`;it is more expensive and must be reported independently from one group. The CI task's private-group run is not evidence that all groups or hosted jobs ran.

The local negative acceptance deliberately added a lint violation,ran the exact root `pnpm check`,observed exit1 at lint,and removed the probe. Aggregate failure/success were also executed as actual Node processes. A subsequent stable positive root run and actual private browser group are recorded separately. Actionlint1.7.12 was checksum-verified from its official release into ignored local tooling and validates the workflow. Config checks alone are not a real PR/merge-protection demonstration.

Before enabling hosted CI,the owner must review runner/billing budgets,permissions/artifact access,timeout behavior,actual failure propagation and required-check settings. No public release,restricted-world approval,whole legacy-world integration or production deployment follows from these files. Owner-selected offline snapshots resolved B-001/B-002 within that scope;public B-003 remains external.
