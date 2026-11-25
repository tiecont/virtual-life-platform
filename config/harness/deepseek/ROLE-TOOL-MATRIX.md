# Role-based tool authorization matrix (DeepSeek adapter)

What each generated DeepSeek preset actually grants, and — separately — whether that
grant is **enforced** or merely **composed**. Do not read the first column as a security
guarantee: enforcement is the second column's problem.

Source of truth for roles: `.codex/agents/*.toml` (canonical, shared-core owner).
Generated presets: `config/harness/deepseek/roles.patch.yml` (12 = 1 CTO + 11 specialists).

## Capability matrix

Legend: **YES** included · **NO** not included · **RO** read-only by sandbox · **—** not applicable.

| Preset | fs read | fs write | bash | spawn child | network | delegate | workflow.mjs | state.mjs write | paid MCP |
|---|---|---|---|---|---|---|---|---|---|
| `aetheria-cto` | YES | YES | YES | YES (via bash) | YES | **YES** | YES | YES (lead only) | NO |
| `aetheria-architect` | YES | YES | YES | YES | YES | **NO** | YES | NO | NO |
| `aetheria-backend` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-rust-runtime` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-unity` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-frontend` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-art-pipeline` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-qa` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-security` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-devops` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-performance` | YES | YES | YES | YES | YES | NO | YES | NO | NO |
| `aetheria-documentation` | YES | YES | YES | YES | YES | NO | YES | NO | NO |

## What is actually enforced today

| Control | Mechanism | Status |
|---|---|---|
| Specialist cannot delegate | `tool-subagent` + `tool-subagent-fork` rows set `disabled: true` in generated presets | **COMPOSED** — not run-verified (needs harness restart) |
| Specialist cannot interview the human | `tool-ask-user` row `disabled: true` | **COMPOSED** — not run-verified |
| Parallel todo claims | `tool-todo` `allowParallelInProgress: false` | **COMPOSED** |
| Lead-only state writes | convention + canonical `state.mjs` single-writer rule | **ENFORCED by canonical core** (distinct-workspace guard observed rejecting a second claim) |
| Concurrent write isolation | canonical "distinct workspaces" guard | **ENFORCED at the state layer**, but **BLOCKED at the runtime layer**: DSH native subagents are in-process and share the parent cwd, so two write workers cannot be given distinct workspaces. Serialize write claims or integrate sequentially. |
| Filesystem confinement | `sandbox-policy` `mode` | **NOT ENFORCED** — measured: reads outside workspace and credential-store reads succeed |
| Network denial | none observed | **NOT ENFORCED** — measured: TCP connect succeeds |
| Child-process denial | none observed | **NOT ENFORCED** — measured: `sh -c` succeeds |
| Paid-service mutation (Meshy) | not in any preset; `meshy-task` is offline-read-only | **COMPOSED** — and no Meshy call was made |

## The honest conclusion

Tool *availability* is scoped correctly by preset composition: a specialist preset
simply does not contain the delegation tools, so it cannot fan out. That is real and
maintainable, and it is what bounds fan-out.

Tool *authorization* at the OS level is not provided by this configuration. Every
specialist that keeps `tool-bash` can read outside the workspace, spawn processes and
reach the network. Since `@deepseek-ai/dsh-sandbox-policy` `workspace-write` did not
confine those on this host, the adapter must not be described as sandboxed.

Mitigation actually available:

1. Do not run untrusted input under any DeepSeek profile on this host.
2. Prefer read-only roles for review work and serialize writes.
3. Use `ctx.tools.restrict(filter)` (present in `@deepseek-ai/dsh-tools`) from a small
   provider plugin if per-call narrowing is required. That is programmatic narrowing of
   *registry* tools; it does not confine direct filesystem, process or network access,
   which is a separate surface.

## Correction (after independent security review)

The delegation rows above were **wrong as first written**. Disabling tool-subagent and
tool-subagent-fork removes two tool *names*, not the delegation *capability*:
tool-workflow runs a JavaScript workflow whose agent(prompt) helper starts subagents,
and workflow-ptc calls subagents.start. The generator now disables workflow-ptc **and**
tool-workflow for all 11 specialists as well (5 disables each, verified), leaving
fan-out only on the CTO preset (3 disables). "Specialist cannot delegate" is now a real
configuration difference, not prompt text.
