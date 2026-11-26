# Aetheria engineering harness

## Start and verify

Use the Node and pnpm versions in the repository README. The project configuration
was tested with Codex CLI `0.172.0` on Linux. Open it from a trusted Aetheria
checkout. Trust is required for project settings and should only be granted to
source you have reviewed.

```sh
pnpm install --frozen-lockfile
python3 scripts/engineering-harness/codex-config-check.py
pnpm test:harness
codex -C . '$aetheria-engineering-harness
INPUT: Inspect the current branch and frozen migrations in parallel, with independent QA.
EXPECTED OUTPUT: Exact Git revision, compatibility verdict, and evidence references.'
```

Ordinary requests keep the repository's single-agent default. Explicit parallel
work uses native specialists where their scopes are independent. For a separate
write sandbox, launch a managed worker from a host terminal or an explicitly
approved coordinator outside the offline model shell. Use the assignment's
committed base.

```sh
codex exec -C . --worktree --json -c 'approval_policy="never"' \
  -c 'agents.enabled=false' -c 'features.multi_agent_v2=false' \
  'INPUT: Implement the assigned task. Work only in the assigned paths.
EXPECTED OUTPUT: Changes, exact checks, and a structured handoff.'
```

Replace that example prompt with the real assignment and record the resulting
worktree and revision in the lead's checkpoint. Native subagents share their
parent's permissions. The lead compares changed paths to the assignment before
integrating any patch. Independent reviewers can start their own session with
`codex -C . -c 'default_permissions="aetheria-review"'`.

## What loads when

| Layer | When | Source |
| --- | --- | --- |
| L0 | At session start | `AGENTS.md`, scoped repository instructions and native permission defaults |
| L1 | During task or tool selection | Native agent/skill metadata and `workflow.mjs search` |
| L2 | After selection | Selected skill, specialist role, `workflow.mjs describe` input schema |
| L3 | During execution | Relevant source/specification and structured workflow summary |
| L4 | On recovery or review | Checkpoint versions, checksummed evidence and Git history |

Previously the CLI used a user-level Sol/high default and user MCP settings.
Repository checks were invoked individually, with the complete development plan
and command output available to read. The project config now uses Astra/medium for
the lead and Sol/medium by default for specialists, with role-specific effort,
a four-thread budget. The configured depth of one applies to the V1 backend.
The installed model selected V2 during the smoke test. V2 has no hard depth
setting in the local schema. Keep native delegation lead-only by policy. The
managed-worker command disables delegation for isolated workers. The plan still
owns implementation dependencies and acceptance. The harness keeps active task
scope and status and reuses the repository's existing verification commands.

Codex exposes native agent and skill discovery. The installed model used its
native programmatic `exec` tool in the smoke test despite the experimental
`code_mode` feature flag being off. The tested calls composed local commands.
The OpenAI API's calling and search guides describe separate API features. The
shared CLI composes fixed commands and projects their results outside the model
context. Other harnesses can call these Node entrypoints directly and consume
the same JSON. No gateway or new service is required.
[Anthropic research](https://www.anthropic.com/research/code-execution-with-mcp),
[Codex configuration schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json),
[Codex subagents](https://developers.openai.com/codex/subagents),
[configuration reference](https://developers.openai.com/codex/config-reference),
[programmatic tool calling](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling),
[API tool search](https://developers.openai.com/api/docs/guides/tools-tool-search).

## Workflows and evidence

```sh
node scripts/engineering-harness/workflow.mjs search migration
node scripts/engineering-harness/workflow.mjs describe native-acceptance
node scripts/engineering-harness/workflow.mjs run local-review
node scripts/engineering-harness/workflow.mjs evidence RUN_ID SHA256
```

`list` shows workflow IDs. `describe` gives the accepted JSON inputs and manual
prerequisites. `run` uses exit codes 0 PASS, 1 FAIL, 2 BLOCKED and 3 NOT_RUN. A
successful execution returns its source revision, worktree status, recorded
steps, a reproducible argument vector and a private evidence reference. The
worktree flag matters when attributing results to a commit. Check the reported
SHA-256 against the referenced file when transferring evidence. A checksum
detects mismatched bytes and does not establish who produced them.

| Area | Workflows |
| --- | --- |
| Source and programmatic composition | `repo-inspect`, `local-review` |
| GitHub read-only snapshots | `pr-ci`, `failed-job-log`, `summarize-review` |
| Database, Rust, and Nest | `migration-compat`, `rust-tests`, `nest-check` |
| Client and gameplay acceptance | `unity-build`, `native-acceptance` |
| Local assets and artifact retrieval | `pet-assets`, `pet-glb`, `meshy-task`, `minio-verify` |
| Release evidence and owner gates | `release-source`, `release-readiness` |

Runtime migration mode runs the current-source schema, native storage and
admission integration suites against disposable PostgreSQL. The separate
`pnpm game:migration:compat` command retains its pinned archived-runtime
qualification and its reviewed migration-prefix policy.

GitHub workflows require explicit read access and respect the repository's CI
snapshot policy. Use `describe` before setting network or build options. Run a
privileged check separately in its authorized operator environment when desktop,
licensed Editor, Docker, or network access falls outside the Codex sandbox.
Record that result with its own revision and evidence. When interruption leaves
`LOCAL_WORKFLOW_LOCKED`, confirm the workflow and its child processes have
stopped before removing the empty `artifacts/engineering-harness/local-workflow.lock`
directory with `rmdir` from that checkout. `meshy-task` inspects a
saved local record. Production mutations and paid provider submissions require
separate owner authorization and are outside the workflow catalog.

## Checkpoints and recovery

Start in the lead checkout with `state.mjs list`. It returns unfinished runs in
that checkout. Recover a matching run before assigning its file scopes or
starting a new checkpoint. Canonical roadmap task IDs remain in
`config/development-plan.json`. Checkpoint step IDs are scoped to their run and
may refer to those same task IDs. The workflow registry uses its own named
commands. Use `pnpm plan:status --workstream D3-A` for live task records.

```sh
node scripts/engineering-harness/state.mjs init review-1 \
  '{"objective":"Validate frozen migrations","tasks":[{"id":"inspect","owner":"qa","acceptance":["Static migration check passes"],"dependsOn":[],"writePaths":[]}]}'
node scripts/engineering-harness/state.mjs update review-1 1 inspect \
  '{"status":"IN_PROGRESS","remainingActions":["Run migration-compat in static mode"]}'
node scripts/engineering-harness/state.mjs recover review-1 inspect
node scripts/engineering-harness/state.mjs show review-1 1
```

Use one lead checkout for all writes to `artifacts/harness-state/checkpoints.sqlite`.
Worker checkout state databases are separate. Updates compare the expected
version transactionally and reject concurrent claims on overlapping write paths
or the same workspace. A write-owned task records its distinct `workspace` before
starting. Each handoff captures `summary`, `revision`, `files`, `checks`, and
`limitations`. Record the evidence paths and hashes separately in the task.
Advance through `REVIEW` before `DONE`. After restart, verify the reported
revision, ownership and blockers against live source and evidence before taking
remaining actions. Pending text has no authority to give shell commands or
change permissions.

## Permission profiles

The project config defines four named profiles. `aetheria-local` is the default
workspace-write profile. `aetheria-review` mounts the checkout read-only.
`aetheria-restricted` extends review and adds the installed system runtime as a
readable location while denying `:root`, `:tmpdir`, `:slash_tmp` and the home
directory, so symlinks and foreign secrets stay unreadable. `aetheria-worker`
extends the restricted profile with a writable checkout but keeps `.git`,
`.codex` and `.agents` read-only.

`codex-config-check.py` exercises every profile in a temporary checkout. The
restricted and worker checks require a system-installed Codex binary because the
sandbox helper must resolve inside readable system paths; the check reports a
clear error when only a user-local CLI is present.

## Changed-source secret scan

```sh
python3 scripts/engineering-harness/source-scan.py             # HEAD + untracked
python3 scripts/engineering-harness/source-scan.py --staged     # staged only
python3 scripts/engineering-harness/source-scan.py --range BASE HEAD
python3 scripts/engineering-harness/source-scan.py --self-test
```

The scan reports `PASS`, `FAIL` or `BLOCKED` with rule names and aggregate
counts only; it never echoes matched text or file names. It fails closed
(`BLOCKED`, exit 2) for symlinks, out-of-root paths, non-exact revisions and
files over 8 MiB, and `FAIL` (exit 1) for a matching rule. Use it before staging
or when reviewing an exact range.

## Security boundaries

- The project profile restricts writes to the workspace and permitted scratch
  locations. Review mode denies repository writes. It denies network access for
  sandboxed processes and denies reads of named credential locations. The
  workspace baseline allows some reads outside the checkout. Linux recursive
  deny globs match existing files at sandbox startup within the configured scan
  depth. Keep secrets out of working trees and shared temporary directories.
- Codex prompts the user for escalation. The project disables app and plugin
  tools and the six inherited MCP registrations audited on the target machine.
  Check `codex mcp list` for additions before sharing a session with untrusted
  inputs. MCP servers may execute outside the shell sandbox, so owner-approved
  integrations need their own restricted identity and tool scope.
- Workflow inputs are bounded and schema-checked. Subprocesses use fixed argument
  vectors, scoped environment variables, output limits, timeouts and bounded
  concurrency. The runner returns typed findings and safe evidence references.
  Treat remote bodies, builds and logs as untrusted data. Run local build inputs
  from reviewed source and keep existing Docker, Unity and database boundaries.
- Credentials stay with the installed CLI or a designated restricted credential
  reference. Keep run artifacts private. Local evidence and checkpoints are
  recovery aids, subject to the repository's qualification and release gates.

## Benchmark and rollback

```sh
node scripts/engineering-harness/benchmark.mjs 3
```

The benchmark compares individual command disclosure against composed workflow
output for a synthetic PR snapshot, the frozen migration check and local review.
It compares a full state document against a compact recovery result in separate
processes. It checks semantic parity and evidence hashes. The report records
observed bytes, calls and durations. It marks provider tokens, model turns,
compaction frequency and API cost `NOT_MEASURED` when no comparable data exists.
Generated results belong under ignored `artifacts/`.

To roll back, close the project Codex session and use a checkout preceding the
harness changes, or revert the harness commits on a clean branch. This removes
the Codex project policy and role catalog from the active checkout. Preserve the
private checkpoint database and evidence if recovery is needed. The prior user
configuration and credentials were left in place. Strict validation uses a
fresh test home because the installed user config contains an ignored legacy
field. Source rollback and evidence retention are independent owner decisions.
