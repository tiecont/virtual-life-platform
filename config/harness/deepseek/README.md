# DeepSeek Harness adapter (Aetheria)

Native DeepSeek-Harness composition for Aetheria: 12 agent presets generated from the
canonical role contract, four profile overlays that choose tool presentation, and three
probes that measure what the adapter actually reaches.

Status: everything in this directory is new and **untracked** at revision `15bb972f`
(`git status --porcelain` reports `?? config/harness/`). Verified on branch
`harness/deepseek-adapter` in the worktree `/home/tiecont/Projects/Aetheria-deepseek-adapter`
with launcher `dsh` 0.1.0-rc.8, app bundle `@deepseek-ai/dsh-web-app` 0.2.0-rc.2 and
Node v26.9.0. Every command in this file was run in that worktree unless it is marked
unverified; the hashes of the generator and the generated overlay pin the two states the
tables depend on.

## Purpose and the single-source-of-truth rule

The adapter configures DeepSeek Harness; it does not define Aetheria's engineering
contract. Three artifacts stay authoritative, and this directory only projects them:

| Authoritative source | Owned by | Projected here as |
|---|---|---|
| `.codex/agents/*.toml` (11 role files) | shared-core integration owner | `roles.patch.yml` preset rows |
| `scripts/engineering-harness/workflow.mjs` | shared core | referenced from preset instructions |
| `scripts/engineering-harness/state.mjs` | shared core; **the lead is the only state writer** | referenced from preset instructions |

Rules that follow from that:

- Never restate a role, its description or its instructions in this directory. Edit the
  `.toml` and regenerate. The generator copies `name`, `description`,
  `developer_instructions` and `model_reasoning_effort`; it does not invent role text.
- Never re-implement workflow or checkpoint logic in a preset. Presets tell the agent to
  call the canonical core: `workflow.mjs search|describe|run|evidence|list` and
  `state.mjs init|show|recover|update` (exact usage: `node scripts/engineering-harness/state.mjs --help`,
  which reports `storage: artifacts/harness-state/checkpoints.sqlite`).
- `roles.patch.yml` is generated and says so in its first line. Hand edits are lost on the
  next regeneration; the `--check` gate exists to catch drift.

Companion documents in this directory: `COMPARISON.md` (adapter versus canonical shared
core, with migration requirements) and `ROLE-TOOL-MATRIX.md` (what each preset grants
versus what is enforced). This README is the entry point and does not duplicate their
tables.

## Inventory

| File | What it is / does | Evidence |
|---|---|---|
| `build-role-presets.mjs` | Generator and drift checker. Reads `.codex/agents/*.toml`, maps reasoning effort (`high|xhigh`→high, `medium`→medium, `low|minimal`→low), emits 12 `@deepseek-ai/dsh-agent-preset` rows as a JSON document body (JSON is valid YAML). 9,384 B, sha256 `463073aa…`. | ran `--check`; read the source |
| `roles.patch.yml` | Generated overlay: 12 presets, 17 plugin slots each, orders 5 and 10–20. 63,657 B, sha256 `4c81a0e3…`. Emitted as **bare entry rows** — see limitation L1. | parsed all 12 rows |
| `profiles/native-baseline.patch.yml` | Sets `tools.mode: native`. Control arm for benchmarks and the documented rollback posture. | `--dump-config` shows `mode: native` |
| `profiles/ptc-engineering.patch.yml` | `tools.mode: ptc`, `maxParallelSubCalls: 8`; `ptc-runtime` `timeoutMs: 180000`, `maxTimeoutMs: 600000`, `maxOldGenerationSizeMb: 512`, `maxOutputBytes: 67108864`. | `--dump-config` shows the same four runtime keys |
| `profiles/ptc-hardened.patch.yml` | `tools.mode: ptc`, `maxParallelSubCalls: 4`, `ptc-runtime` 120000/300000/512, and `permission` `defaultPreset: workspace-write`. For programs over untrusted input. | `--dump-config` shows `defaultPreset: workspace-write` |
| `profiles/bench-provider.patch.yml` | Points an OpenAI-Responses-compatible provider (`thay-phong`, model `deepseek-flash`, `contextWindow: 1000000`) at the bench profile. Carries only the credential **name** `apiKeyEnv: THAY_PHONG_API_KEY`; no key material. | read the file; no secret values present |
| `ptc-probe.mjs` | Measures what program code can reach: environment variable **names and counts**, `child_process` availability, filesystem reachability, heap limit. Exported `probe()`/`assess()`; CLI entry runs the native baseline. | ran `--no-net`: `context: native`, Node v26.9.0, 81 environment variables, `childProcess: true`, `heap.limitMb: 4192` |
| `ptc-presentation-bench.mjs` | Native-versus-PTC A/B over headless one-shot workloads; measures system-prompt bytes, tool-schema bytes, tool-result bytes, steps, PTC sub-calls and wall time from recorded session logs, then writes `artifacts/engineering-harness/bench/{report.json,summary.tsv}`. | read the source; **not run** (L2) |
| `hardened-sandbox-probe.mjs` | Positive and negative sandbox tests with synthetic fixtures: expects denial outside the workspace and success inside it, and writes `<cwd>/.sandbox-probe-inside.txt` plus fixtures under `--root` (default `/tmp/aetheria-sandbox-probe`). | read the source; **not run** (L8) |
| `profiles/` | The four overlays above. | listed |

## Generated role presets

Twelve presets: one CTO plus the eleven specialists from `.codex/agents/*.toml`. All are
`@deepseek-ai/dsh-agent-preset` rows whose row id is `preset-<preset id>`; the value a
profile selects is the row's `config.id` (left column below).

| Preset id (`config.id`) | Order | Source | `model_reasoning_effort` in .toml | Effort applied to the row? |
|---|---|---|---|---|
| `aetheria-cto` | 5 | built in (delegating) | high (in generator) | no |
| `aetheria-architect` | 10 | `.codex/agents/architect.toml` | high | no |
| `aetheria-art-pipeline` | 11 | `.codex/agents/art_pipeline.toml` | medium | no |
| `aetheria-backend` | 12 | `.codex/agents/backend.toml` | medium | no |
| `aetheria-devops` | 13 | `.codex/agents/devops.toml` | medium | no |
| `aetheria-documentation` | 14 | `.codex/agents/documentation.toml` | low | no |
| `aetheria-frontend` | 15 | `.codex/agents/frontend.toml` | medium | no |
| `aetheria-performance` | 16 | `.codex/agents/performance.toml` | medium | no |
| `aetheria-qa` | 17 | `.codex/agents/qa.toml` | medium | no |
| `aetheria-rust-runtime` | 18 | `.codex/agents/rust_runtime.toml` | high | no |
| `aetheria-security` | 19 | `.codex/agents/security.toml` | high | no |
| `aetheria-unity` | 20 | `.codex/agents/unity.toml` | medium | no |

"Effort applied" is **no** for every row: a preset row carries only
`config.{id, order, plugins}` and no model or reasoning field (L4).

The 17 plugin slots every preset shares, in order: `persona` (Aetheria prefix/suffix),
`agent-instructions` (`maxBytes: 65536`), `tool-bash`, `tool-fs`, `tool-fs-search`
(`sampleOverCapGlobResults: false`), `tool-jobs`, `skill-filesystem`, `tool-skill`,
`command-goal`, `tool-goal`, the `planning` group (`plan-mode`), the `compaction` group
(`compaction-basic`, `command-compact`, `tool-result-pruner` with 8192/4096/1024),
the `delegation` group (`tool-subagent-control`, `list-agents`, `tool-subagent` **disabled**,
`tool-subagent-fork` **disabled**, `workflow-ptc` provider `spawn`, `tool-workflow`),
`tool-ask-user` **disabled**, `tool-todo` (`allowParallelInProgress: false`),
`tool-web` (`fetch: true`, `searchTimeoutMs: 60000`), `present`.

Regenerate and verify:

```bash
node config/harness/deepseek/build-role-presets.mjs           # rewrite roles.patch.yml
node config/harness/deepseek/build-role-presets.mjs --check    # verify in sync
```

Observed `--check` output (exit 0):

```json
{
  "result": "IN_SYNC",
  "presets": 12
}
```

On drift the check exits 1 with
`roles.patch.yml is out of date; run the generator without --check` and writes nothing.
Regeneration (without `--check`) was **not** run by this documentation task: it rewrites
`roles.patch.yml`, which is outside a single-file documentation scope.

Changing presets requires a harness restart; a preset is fixed per agent at composition
time (stated in the generated header, consistent with the preset registry's "existing
Agents retain the composition they already use").

## Exact profile-selection commands

`dsh --help` (0.1.0-rc.8) documents the two levers used here: `--profile <name>` selects
the profile under `$DSH_HOME/profiles`, and `--patch <path>` is an "extra patch-list
overlay applied after the profile layer (repeatable)". Two properties matter when writing
an overlay:

- A patch **replaces the targeted row's whole `config`**, so restate every key that row
  owns (documented in the `dsh-web-app` README).
- New rows need `insert:`; a bare row is interpreted as an edit of an existing id (L1).

The commands below use the headless profile `bench` that exists on this machine
(`~/.dsh/profiles/bench`, bundles `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`).
Substitute any headless profile.

### Headless: choose presentation with an overlay

```bash
# native Function Calling (control arm / rollback posture)
dsh --profile bench --patch config/harness/deepseek/profiles/native-baseline.patch.yml "<task>"

# PTC: run_code plus generated SDK
dsh --profile bench --patch config/harness/deepseek/profiles/ptc-engineering.patch.yml "<task>"

# PTC with the OS sandbox as the enforcing layer
dsh --profile bench --patch config/harness/deepseek/profiles/ptc-hardened.patch.yml "<task>"

# Provider overlay, when the profile's default provider is unusable
dsh --profile bench --patch config/harness/deepseek/profiles/bench-provider.patch.yml "<task>"
```

Each of these was verified to compose, with
`dsh --profile bench --patch <overlay> --dump-config`:

| Overlay | Observed in the composed tree |
|---|---|
| `native-baseline.patch.yml` | `mode: native` |
| `ptc-engineering.patch.yml` | `mode: ptc`, `maxParallelSubCalls: 8` |
| `ptc-hardened.patch.yml` | `mode: ptc`, `maxParallelSubCalls: 4`, `defaultPreset: workspace-write` |

`--patch` is repeatable, so overlays compose left to right; a later overlay wins on a
key it restates. Verified both ways: `--patch native-baseline --patch ptc-engineering`
composes `mode: ptc`, and the reverse order composes `mode: native`. The overlays only
change tool presentation and permissions — none of them installs the Aetheria presets.

### Headless: choose presentation with the environment variable

The headless bundle's `tools` row is `mode: !!js process.env.DSH_TOOLS_MODE`
(`@deepseek-ai/dsh-headless/cordis.patch.yml`), so the process-wide switch is:

```bash
DSH_TOOLS_MODE=native dsh --profile bench "<task>"
DSH_TOOLS_MODE=ptc    dsh --profile bench "<task>"
```

`--dump-config` prints the expression unevaluated, so it cannot confirm the resolved
value; the accepted values are `native`, `ptc` and `both` (per `@deepseek-ai/dsh-tools`
and the `dsh-web-app` patch comment). The end-to-end behaviour of the variable was
**not** verified by a live headless run here — only its presence as the row's value and
the plugin default beneath it (see next section). Prefer the explicit overlay when the
result must be unambiguous.

### Desktop: preset switch is configuration data, not a flag

The interactive desktop session boots the `desktop` profile
(`~/.dsh/profiles/desktop`; bundles `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`,
`@vastai/tripo-dsh`). Its user layer is `cordis.patch.yml`; `cordis.yml` is the empty
root and says "Edit cordis.patch.yml, not this file". The preset choice is the
`agent-preset-registry` entry:

```yaml
- id: agent-preset-registry
  name: "@deepseek-ai/dsh-agent-preset-registry"
  config:
    default: standard
    selectedDefault: ptc
```

To select an Aetheria role instead, set `selectedDefault` to the preset id from the table
above (for example `aetheria-documentation`) and restart the app. `selectedDefault` is the
registry's user default that new sessions resolve over the deployment `default`
(registry README); recovery after restart resolves that id's current definition and
rejects a missing definition, so the preset must actually be composed into the profile
before you name it. Two preconditions, both currently unmet:

1. The desktop profile must contain an `insert:` of the preset rows. `roles.patch.yml`
   cannot be applied as checked in (L1); a correctly `insert:`-wrapped overlay passed as
   `--patch` does compose 12 `preset-aetheria-*` rows into the `desktop` profile (verified
   by `--dump-config`), but the desktop app boots its user layer rather than a
   documentation-supplied `--patch`, and no in-repo command installs the rows into that
   user layer.
2. Selecting an `aetheria-*` id in the running GUI is therefore **unverified**. The only
   verified desktop value is the current `selectedDefault: ptc`, which names the shipped
   `ptc` preset (`@deepseek-ai/dsh-web-app/presets/ptc.patch.yml`).

## Native versus PTC

| Aspect | Native (default) | PTC |
|---|---|---|
| Model-facing surface | every visible tool's name, description and parameter schema | only `run_code` plus a generated TypeScript SDK |
| How a tool is called | model calls the tool directly | program calls an SDK binding; registry dispatches a sub-call |
| Sub-call concurrency | not applicable | `maxParallelSubCalls` (8 engineering, 4 hardened) |
| Intermediate values | become tool results in conversation history | execution-local; only the outer `run_code` result is size-capped |
| Runtime caps | none beyond the process | `ptc-runtime`: `timeoutMs`, `maxTimeoutMs`, `maxOldGenerationSizeMb`, `maxOutputBytes` |
| Mount requirement | none | needs a composed `ctx.ptcRuntime` with an SDK renderer; a preset selecting PTC without it refuses to mount |
| How it is selected | the default when `mode` is unset: `@deepseek-ai/dsh-tools/lib/index.js:2705` reads `config.mode ?? "native"`; the plugin README table lists `mode` default `native` | opt-in via overlay, preset, or `DSH_TOOLS_MODE` |

PTC is a context-efficiency and protocol boundary, not a sandbox: what program code can
reach is decided by the OS sandbox policy for the session (the probe's own conclusion,
and the reason `ptc-hardened.patch.yml` exists).

### Measured reason native is the default

The A/B run recorded in `artifacts/engineering-harness/bench/RESULTS.md` in the main
checkout (`/home/tiecont/Projects/Aetheria`; bench output is git-ignored and absent from
this worktree) — 2 reps per cell, 12/12 runs exit 0, provider
`thay-phong/deepseek-flash`, headless `bench` profile — found:

- Fixed per-request overhead is **21,112 B native versus 28,357 B PTC (+34%)**: native
  tool schemas 18,516 B versus the generated SDK 21,632 B (+17%). PTC moves the catalog
  from the request's `tools` array into the system prompt; it does not remove it.
- PTC did **not** win the large-output case: on `bigfilter` native carried 107 B of tool
  results against PTC's 913 B, because the native toolset already has a shell and the
  model filtered with a one-line `node -e`. PTC's marginal benefit collapses when a
  shell is available.
- PTC was slower: `bigfilter` 24,243 ms versus 14,249 ms (+70%); other workloads within
  noise. It also needed no fewer orchestration steps.
- In the live desktop PTC session the recorded system prompt was 96,207 B, of which the
  SDK declaration block was 73,512 B (76%) across 178 declared bindings.

Those are the artifact's numbers, not a re-measurement here: the checked-in bench script
cannot reproduce them from this checkout (L2). The recorded recommendation is native for
routine single-command work, PTC for composition-shaped work (several results joined
before one answer, or deterministic multi-step validation in code).

## Rollback

1. **Drop a `--patch`.** Overlays are per-invocation arguments; nothing is persisted.
   Re-run the command without the flag. `DSH_TOOLS_MODE` is likewise per-process.
2. **Revert the desktop preset.** Set `selectedDefault` back to `ptc` (the verified value
   before this work) in `~/.dsh/profiles/desktop/cordis.patch.yml` and restart the app.
   If someone inserted `preset-aetheria-*` rows into that user layer, delete those rows;
   the file is user-private (`0600`) and not in Git, so keep a copy before editing. The
   deployment `default: standard` is unchanged.
3. **Remove the adapter worktree.** From a checkout that lists it
   (`git worktree list` shows `/home/tiecont/Projects/Aetheria-deepseek-adapter 15bb972f [harness/deepseek-adapter]`):
   `git worktree remove /home/tiecont/Projects/Aetheria-deepseek-adapter`. Confirm that
   absolute path first. It needs `--force` while untracked files exist, and at the time
   of writing the only untracked entry was `config/harness/` itself. Probe output
   (`.sandbox-probe-inside*.txt`) appears at the worktree root when
   `hardened-sandbox-probe.mjs` runs, so check `git status` before removing.
4. **Regenerate instead of hand-reverting presets.** If `roles.patch.yml` drifts, rerun the
   generator; do not patch it by hand. No other adapter state exists: the probes write
   only `artifacts/` (ignored) and the checkpoint database is the lead's.

## Known limitations

- **L1 — the generated overlay installs nothing.** `build-role-presets.mjs` emits the 12
  rows as a bare entry list, but new rows need `insert:`. Verified:
  `dsh --profile bench --patch config/harness/deepseek/roles.patch.yml --dump-config`
  prints `patch: entry "preset-aetheria-cto" not found` (and one such line per preset),
  exits 0, and composes zero presets. Passing the identical rows as
  `- insert: <rows>` via `--patch` does compose them (12 `id: preset-aetheria-*` rows in
  `--dump-config`), on both the `bench` and `desktop` profiles. The fix is one line in
  the generator's emit; it was out of scope for this documentation task, so the
  generator is documented as defective, not as working.
- **L2 — the bench cannot reproduce its own results here.** `ptc-presentation-bench.mjs`
  hardcodes `PROVIDER_PATCH = <repo>/config/harness/profiles/bench-provider.patch.yml`,
  but the file lives at `config/harness/deepseek/profiles/bench-provider.patch.yml`;
  its header and `ptc-probe.mjs`/`hardened-sandbox-probe.mjs` headers cite
  `scripts/engineering-harness/{bench,ptc-probe}.mjs`, and neither exists in this
  worktree (`scripts/engineering-harness/` has `benchmark.mjs`). The bench was not run.
- **L3 — machine-specific constants.** The bench pins the app bin at
  `/opt/DeepSeek Harness/resources/app/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js` and
  reads session logs from `~/.dsh/sessions/--home-tiecont-Projects-Aetheria--`. Running it
  from another checkout or home directory finds no sessions.
- **L4 — reasoning effort is computed but not applied.** `toReasoningEffort()` maps the
  `.toml` value and prints it in `roles`, but preset rows carry no model/effort field, so
  all 12 presets inherit the profile's model default.
- **L5 — no test covers this adapter.** `node --test tests/harness/*.test.mjs` (13 pass,
  0 fail) exercises the canonical workflow and state modules only; a search for
  `roles.patch`, `build-role-presets` or `deepseek` finds no test reference. The
  `--check` drift gate is the only adapter-level check.
- **L6 — the probe CLI prints facts, not a verdict.** `assess()` (which returns the
  security verdict) is exported but not called by the CLI entry; `node .../ptc-probe.mjs`
  prints the raw facts object only.
- **L7 — overlay edits are whole-config replacements.** Any patch on the `tools` row
  overwrites that row's entire `config`. Verified: `--patch ptc-engineering --patch
  native-baseline` composes `mode: native` and **no** `maxParallelSubCalls`, because the
  native overlay's `config` does not restate it. Combine presentations by restating every
  key, or a later overlay silently drops keys from an earlier one.
- **L8 — `hardened-sandbox-probe.mjs` was not run.** It writes
  `<cwd>/.sandbox-probe-inside.txt` and fixtures under `--root`; running it in the
  worktree would create files outside this task's single-file write scope. Its PASS/FAIL
  behaviour under each profile is therefore unverified.
- **L9 — the desktop switch is user-scope, not repository state.** No repository command
  changes a running desktop session's preset; it is a hand edit plus restart, and the
  GUI coverage of `aetheria-*` presets is unverified (see above).
- **L10 — untracked status.** Nothing described here is committed at `15bb972f`;
  `git status` shows `?? config/harness/`. Review the directory, do not assume it is
  protected by version control.

## Credential exposure and rotation (human-controlled gate)

A Meshy credential was exposed in a transcript during Wave 1. Treat it as compromised.

- **Rotation is a human action.** No agent in this adapter rotates, revokes or prints a
  credential. Stop and ask the owner.
- Procedure: revoke the exposed key at the provider, issue a new one, write it to
  ~/.dsh/mcp-secrets.json (mode 600) under meshyApiKey, re-run the secret scan, and
  confirm a clean result before any further Meshy use.
- Until rotation completes, **do not invoke Meshy**. No Meshy call is made by this
  adapter; the shared catalog's meshy-task is an offline read-only projection.
- Scan rule: report file paths and rule names only, never a matched value. Two known
  false positives: a code-span identifier in COMPARISON.md and the literal
  SYNTHETIC-NOT-A-REAL-KEY fixture in hardened-sandbox-probe.mjs.

## Corrections after independent QA and security review

These supersede the stale lines above and the earlier L1/L8/L10 claims.

- **Delegation control (was HIGH/FAIL).** Disabling tool-subagent alone did NOT remove
  the delegation capability: tool-workflow runs JavaScript whose agent(prompt) helper
  starts subagents, and workflow-ptc calls subagents.start. The generator now also
  disables workflow-ptc and tool-workflow for all 11 specialists (5 disables each,
  verified), while the CTO preset keeps them (3 disables). Fan-out is lead-only now.
- **roles.patch.yml now installs.** Emitted under insert:; verified that
  --patch roles.patch.yml --dump-config composes all 12 preset rows with zero errors.
  L1 closed.
- **Hardened profile measured (was unverified).** Under ptc-hardened with
  sandbox-policy.mode: workspace-write, the probe still ALLOWED reads outside the
  workspace, child-process creation and outbound network; writes outside the workspace
  were redirected into an isolated temporary view (absent from the host). Verdict:
  read/network/process confinement NOT enforced, write confinement PARTIAL. Do not
  describe this profile as a sandbox. L8 closed with a FAIL.
- **Probe no longer reads the real credential store.** It previously opened
  ~/.dsh/.credentials.yaml to test denial, loading a real secret into memory in the very
  profile where denial fails. Removed; synthetic fixtures only; it now also removes its
  own workspace artefacts.
- **Adapter is committed** on branch harness/deepseek-adapter. L10 closed.
