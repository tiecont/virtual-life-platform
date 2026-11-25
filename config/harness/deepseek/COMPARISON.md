# DeepSeek Wave 1 harness vs the canonical shared core

Compares the superseded Wave 1 implementation preserved on `harness/deepseek-wave1`
against canonical shared-core `15bb972f` (branch `harness/deepseek-adapter`). Contract
authority is `specs/engineering/harness.md`; `AGENTS.md` states the operational rules.
Wave 1 sources below are read from the preservation branch, never checked out.

## Capability comparison

| Capability | Wave 1 approach | Canonical approach | Decision |
| --- | --- | --- | --- |
| Workflow CLI | `scripts/engineering-harness/workflow.mjs` (237) over `registry.mjs` (214): 9 CHECKS + 3 COMPOSITES, `run <id>` / `run composite:<id>` with `--flag value` parsing; statuses PASS/FAIL/TIMEOUT only | `workflow.mjs` (106) over `workflow-catalog.mjs` (502) + `workflow-runner.mjs` (265): 16 workflows, strict `normalizeInput` schema, PASS/FAIL/BLOCKED/NOT_RUN, typed findings, `reproduce.argv`, `evidence` subcommand | ADOPT — Wave 1 registers commands the canonical catalog already owns, and collapses BLOCKED into FAIL |
| State CLI | file-backed `state.mjs` (378): `artifacts/engineering-harness/state.json`, actions init/status/add-task/set-status/attach/next/recover, statuses `pending|in_progress|blocked|done` | `state.mjs` (90) + `state-contract.mjs` (213) + `state-store.mjs` (152): SQLite checkpoints, init/update/show/recover, `PENDING|IN_PROGRESS|BLOCKED|REVIEW|DONE` with a transition table | ADOPT — a mutable JSON file has no version pinning, no integrity check and no cross-run ownership |
| Task contract | per-task `{id,title,status,dependsOn,owner,writeScope,acceptance,checks,evidence,blockers}`, normalized loosely, never validated; `writeScope` advisory | `state-contract.mjs:10-11` exact key sets; bounded arrays; `checkPath` repo-relative; mandated handoff `summary/revision/files/checks/limitations`; `files ⊆ writePaths` (`:86`); DONE needs no FAIL check and no `remainingActions` (`:114-117`) | ADOPT — the handoff shipped to the lead is only enforceable through the canonical contract |
| Evidence schema | ad-hoc `artifacts/engineering-harness/evidence/<id>-<ISO>.json` holding raw `stdout`/`stderr` and full `process.env` cwd facts; no schemaVersion, no digest, no retrieval command | `workflow-runner.mjs:205-218`: `artifacts/engineering-harness/runs/<uuid>/report.json`, 0600/0700, ≤64 KiB, `{schemaVersion,runId,workflow,status,code,revision,worktreeDirty,durationMs,findings,steps,reproduce,evidence[{path,sha256,bytes}]}`; verified read via `workflow.mjs evidence` (`:223-249`) | ADOPT — unbounded raw subprocess text and an unverifiable path are disqualifying |
| Revision guard | monotonic integer `state.revision` + `--expect-revision`; git SHA captured once at init and re-read in `recover` for `sourceDrift` (`state.mjs:219-220`, `:368-373`) | `recordRevision`/`recordWorkingTree` run before every workflow and must both PASS (`workflow.mjs:33-36`, `workflow-catalog.mjs:61-83`); state rows pin full `baseRevision` (`state-contract.mjs:152`) | ADOPT — a result must be attributable to the revision it actually ran at, not the one recorded at init |
| Dependency guard | advisory: refuses `done` with unmet deps (`state.mjs:294-297`); unknown deps silently tolerated; no cycle detection | cycle detection and "deps DONE before activation" (`state-contract.mjs:120-138`), plus cross-task and cross-run write-scope exclusivity (`:140-145`, `state-store.mjs:81-96`) | ADOPT — overlapping write scopes across concurrent worktrees is the failure mode this exists for |
| Idempotency | `--idempotency-key` replay cache persisted inside the state document (`state.mjs:98-109`) | none; optimistic concurrency: expected version compared inside `BEGIN IMMEDIATE` (`state-store.mjs:144-151`), CONFLICT exits 3 | DROP — a second, unvalidated authority would disagree with the version check and grows the 64 KiB state budget |
| Recovery | `recover` re-prints the same JSON plus outstanding/blockedBy/`missingEvidence` via `access()`; no integrity check, one file reused for every write | `recover RUN_ID [TASK_ID]` reads the newest checkpoint, sha256-verifies decode and identity (`state-store.mjs:53-65`), recomputes ready/active/blocked/complete (`state-contract.mjs:202-213`), `show RUN_ID VERSION` replays history | ADOPT — recovery must survive a partially written store, not trust it |
| Benchmark | `bench.mjs`: native-vs-PTC presentation A/B from DSH session logs (`systemBytes`, `toolSchemaBytes`, `toolResultBytes`, `steps`, `wallMs`) into `artifacts/engineering-harness/bench/report.json`; no acceptance parity, no hashed evidence | `benchmark.mjs` (342): four scenarios (PR fixture, frozen migration, `local-review`, checkpoint recovery), baseline-vs-upgraded semantic parity assertion, hash verification through `workflow.mjs evidence` (`:244-288`), order-reversed trials, `modelMetrics` explicitly `NOT_MEASURED` | EXTEND — keep the presentation axis as an adapter script, but its acceptance and evidence must use the canonical method |
| Tests | `scripts/engineering-harness/tests/harness.test.mjs` (148) imports `registry.mjs`, and shells the file-backed `state.mjs`; asserts allowed executables, stale-revision refusal, unmet dependency refusal, idempotent replay, probe names-only | `tests/harness/workflow.test.mjs` (201) + `tests/harness/state.test.mjs` (175): 13 tests via `pnpm test:harness`, fixtures substituted for GitHub, projection-only migration report, containment/digest/Meshy, MinIO loopback refusal, credential-shaped text rejection, cross-run write scopes, single-writer version race, symlink-protected database | DROP — every Wave 1 subject (`registry.mjs`, `state.json`) is deleted, so the file cannot be ported; canonical suite already covers the survivors |

## Migration requirements for the DeepSeek adapter

1. Remove `registry.mjs`, the file-backed `state.mjs` and `tests/harness.test.mjs` from the
   adapter surface. Discovery is `node scripts/engineering-harness/workflow.mjs search|describe`;
   no adapter file may import `workflow-catalog.mjs` or `workflow-runner.mjs` directly.
2. `config/harness/deepseek/ptc-probe.mjs`, `hardened-sandbox-probe.mjs` and
   `ptc-presentation-bench.mjs` stay adapter scripts, not workflow ids:
   `workflow.mjs search sandbox` returns an empty list at `15bb972f`. Report their result as a
   handoff check and an artifact under `artifacts/`; do not invent a workflow id for them.
3. Never open `artifacts/harness-state/checkpoints.sqlite`. Only the lead writes it through
   `state.mjs init|update`; specialists read via `recover`/`show`.
4. Adapter-produced facts (probe, bench) must be recorded with path + SHA-256 so
   `checkEvidence` (`state-contract.mjs:66-71`) accepts them, or land in a canonical report
   retrievable by `workflow.mjs evidence RUN_ID [SHA256]`.
5. Adopt the canonical status vocabulary and exit codes (0/1/2/3,
   `workflow-runner.mjs:9`). `TIMEOUT` is a runner problem code, not a result status.
6. A capability the harness cannot prove must be `BLOCKED` with a code, following the
   `LOCAL_EXECUTION_OPT_IN_REQUIRED` pattern (`workflow-catalog.mjs:262`); never PASS by assumption.
7. Never pass the whole `process.env` to a child (Wave 1 did). Use the `commandEnvironment`
   allowlist (`workflow-runner.mjs:24-38`) and read named keys only, as `minio-verify` does
   (`workflow-catalog.mjs:353-359`).
8. `.codex/agents/*.toml` stays the only role source; `roles.patch.yml` is generated by
   `build-role-presets.mjs` and gated by `--check`.
9. Wave 1 `config/harness/README.md` documents `config/harness/profiles/...`, which no longer
   exists (profiles moved to `config/harness/deepseek/profiles/`). Any restored doc must be
   rewritten against this file and `specs/engineering/harness.md`, not ported.

## Dependency graph: adapter -> canonical modules

```
.codex/agents/*.toml                    (role contract, shared-core owned)
  └─ build-role-presets.mjs ──► config/harness/deepseek/roles.patch.yml

config/harness/deepseek/{ptc-probe,hardened-sandbox-probe,ptc-presentation-bench}.mjs
  └─ artifacts/**/{facts,report}.json ──► readEvidence (via workflow.mjs evidence only)

lead session
  ├─ node scripts/engineering-harness/workflow.mjs {search,describe,run,evidence}
  │     └─ workflow-catalog.mjs ─► workflow-runner.mjs  (CLI-only use; never imported)
  └─ node scripts/engineering-harness/state.mjs {init,update,show,recover}
        ├─ state-contract.mjs
        └─ state-store.mjs ─► artifacts/harness-state/checkpoints.sqlite (lead-only writer)

contract text: specs/engineering/harness.md · AGENTS.md · this file
```

## Acceptance criteria for the adapter migration

- `node config/harness/deepseek/build-role-presets.mjs --check` exits 0.
- No reference to `registry.mjs`, `HARNESS_STATE_FILE` or `engineering-harness/state.json`
  remains under `config/harness/deepseek/`.
- `node --test tests/harness/*.test.mjs` is green at the adapter base revision
  (measured 13/13 PASS at `15bb972f`).
- Every adapter artifact referenced in a handoff resolves and matches its SHA-256, or the
  check is reported `NOT_RUN`.
- No adapter process has written `artifacts/harness-state/checkpoints.sqlite`; `state.mjs show`
  still returns the lead's newest version.

## The adapter must NOT duplicate

- the workflow catalog or any check id (`workflow-catalog.mjs:428-472`);
- input schema validation and default normalization (`workflow-catalog.mjs:484-501`);
- the status taxonomy and exit codes (`workflow-runner.mjs:9`);
- evidence write, read and digest verification (`workflow-runner.mjs:205-249`);
- diagnostic projection instead of raw log text (`workflow-runner.mjs:92-112`);
- the command environment allowlist, process-group kill and output caps (`workflow-runner.mjs:24-89`);
- the local execution lock (`workflow-runner.mjs:251-265`);
- state schema, transitions, dependency and ownership rules (`state-contract.mjs`);
- the checkpoint store and its SQLite schema (`state-store.mjs:104-112`);
- benchmark acceptance parity and evidence verification (`benchmark.mjs:244-288`);
- the role definitions (`.codex/agents/*.toml`) or the harness specification text.
