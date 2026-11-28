# Repository Instructions

At the start of an implementation session, inspect `git status --short --branch`,
`git worktree list` and the relevant branch and PR revisions. Read README.md
and the relevant entries in `config/development-plan.json` before editing code.
From the lead checkout, run `node scripts/engineering-harness/state.mjs list`
and `recover RUN_ID` for any relevant unfinished checkpoint. Verify the
workspace revision and pending work against live source. Then run
`pnpm plan:status` and choose the highest-priority ready work consistent with
the owner's objective. Use `--milestone M3`, `--workstream D3-A` or
`--summary` for focused reads.

Use `$aetheria-engineering-harness` for execution, workflow evidence and
recovery. For substantial work, checkpoint the task IDs, acceptance and
independent file scopes in the existing SQLite store. One agent executes by
default. Delegate only when explicitly requested, with isolated worktrees and
one writer per file scope. Use model aliases only when available. The Main
Agent owns integration and is the only writer of the canonical backlog.
Workers return `summary`, `revision`, `files`, actual `checks` and
`limitations` through the existing handoff contract.

Only GPT-6 Luna and GPT-6.1 Terra may run execution-only assignments. This
covers tests, builds, lint and experiments with supplied inputs and cases when
the deliverable is the resulting output. Choose reasoning effort for the case.
Apply this rule to the lead and every worker. If neither model is available,
queue the run. Assign diagnosis or implementation separately when a result
requires engineering judgment. Sol and Astra may take those engineering tasks.

For delegated work, use Fast (2× speed) when the interface supports it.
Choose reasoning effort independently for each assignment according to its
complexity. If speed selection is unavailable, keep the task-appropriate
reasoning effort and report the actual settings when asked.

Run relevant local checks, seek independent review when available, integrate
accepted changes and update the backlog with exact-source evidence. Record all
unmet acceptance and owner gates. Checkpoint outstanding work before stopping
and continue the next unblocked task within the session budget.
Character production requires explicit owner review at each H1-H4 gate before
the next dependent art stage. Other ready work needs no reservation. Work on any
ready task; keep actual code/contract dependencies. Hardware, media rights,
signing and release qualification apply to their own acceptance and deployment,
and must not delay unrelated source work. Never claim a check ran when it did not.

For flagship or Limited S humanoids and key NPCs needing high-likeness faces,
expressions, VRM Humanoid rigs, and Unity art delivery, read and apply
`.agents/skills/aetheria-hero-character-vrm/SKILL.md`; invoke it as
`$aetheria-hero-character-vrm`. For detached accessories, standard/common Pets,
weapons, environments, and props, read and apply
`.agents/skills/aetheria-standard-asset-3d/SKILL.md`; invoke it as
`$aetheria-standard-asset-3d`. These are the only canonical Aetheria 3D skills.
Keep ordinary gameplay/code work outside them. Skill installation does not imply
an accepted art benchmark or asset.

Use feature/module/layer folders for application source. Keep entrypoints and
framework routes where the framework expects them. Domain code contains pure
rules; application code coordinates use cases; infrastructure handles external
systems; presentation handles HTTP, sockets and views. Do not create empty layers
or duplicate services. Retain the existing stack, protocol and database journal.

New Rust gameplay remains default-off. Nest RoomAuthority remains the only legacy
room writer. Pet Arena PvE precedes new Lodge gameplay; mobile is conditional.
Keep authentication, authorization, privacy, consent, moderation and release gates.
Source implementation and green CI do not authorize production deployment,
purchases, signing, media licensing, destructive migrations or public dating.

## Noninteractive Linux desktop sessions

For the lead and all workers, launch Unity through the installed Editor binary
matching `apps/unity-client/ProjectSettings/ProjectVersion.txt`. On this host the
Editor is under `$HOME/Unity/Hub/Editor/<version>/Editor/Unity`. For Editor tests
and Linux builds, set `UNITY_EDITOR` to that executable and run the repository
validation script. It starts the Editor directly in batch mode. The Unity CLI's
Auth Broker path has triggered a desktop password prompt via `systemd-creds`
on this workstation. Skip the CLI and Hub launcher for these operations.

```sh
version=$(awk '/^m_EditorVersion:/{print $2; exit}' apps/unity-client/ProjectSettings/ProjectVersion.txt)
env -u DISPLAY -u WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS=unix:path=/dev/null \
  UNITY_EDITOR="$HOME/Unity/Hub/Editor/$version/Editor/Unity" \
  node scripts/unity-validate.mjs tests </dev/null
```

Use a private compositor for rendered player tests. If the installed Editor
cannot use its existing license headlessly, record that failure and continue
independent work. Leave system credential stores and license settings intact.
For Git operations that might authenticate, disable terminal prompting,
graphical askpass and the desktop credential helper for that invocation. Reuse
one authorized Chrome debugging connection throughout a browser-based production task.
If Chrome asks for permission, preserve its consent boundary and continue
independent production work. Reconcile the existing chat before resubmitting.

## Hydrogen for visual and audiovisual production

Use Hydrogen for every workflow previously assigned to Gemini, including 3D
reference plates, jewel art, battle backgrounds, character studies, storyboards
and supported music inputs. Build briefs from the canonical asset identity, its
in-game purpose, approved references and Aetheria's gentle anime-fantasy direction.
Verify available capabilities in the authorized Hydrogen session and record the
actual provider, mode and costs. Reconcile outstanding jobs before resubmission.
If Hydrogen is unavailable, keep the brief and continue independent work.
Obtain owner direction before substituting a different provider. Keep historical
Gemini outputs attributed to the provider that produced them.

## Gameplay Configuration Authority

PostgreSQL is the single source of truth for supported gameplay configuration
and progression. Admin owns validation, draft/published versions, publication,
rollback and audit; Nest owns authorization/allocation/progression; Rust executes
the validated immutable configuration; Unity presents committed results. Rust
must not carry production gameplay balance defaults. Missing or invalid required
configuration fails closed. New gameplay mechanisms require an implemented typed
engine capability, never arbitrary Admin scripts.

Enforceable rules for new gameplay:

- A supported gameplay value is authored in a typed, versioned configuration
  bundle and published from PostgreSQL. Rust owns algorithms, structural engine
  capability and technical safety bounds only.
- The cooperative ruleset `arena8-coop-pve` must load its bundle through
  `CoopRules::load` and fail closed. Do not add a fallback table, a hidden
  default or a numeric balance constant to it.
- Publication must be validated by the engine itself:
  `aetheria-game-runtime --check-gameplay-config <bundle>` prints the content
  digest and exits non-zero on any defect. Do not re-implement the schema in
  TypeScript.
- An active match keeps its original configuration digest and bundle across
  restart; publication affects new allocations only.
- Seed and test bundles are source-controlled inputs (`config/gameplay/`,
  `crates/*/tests/fixtures/`), never a live authority.

Keep the checkout focused on source, tests, assets, build/runtime configuration,
and the maintained backlog. Do not add session diaries, review transcripts,
generated evidence or archived plan packs. Put fresh logs under ignored artifacts/.
Historical plans and evidence remain in Git at archive/pre-cleanup-2026-11-10.
The historical-release fixtures are test inputs, not the active work plan.

Before merge, run relevant checks and actual CI against the committed source.
Record verification in the task entry with source SHA and actual command outcomes;
label self-review honestly. Merge through a green PR; never bypass failed checks.
Preserve owner changes and untracked files. Do not commit secrets or local IDE data.

## Token-Saving CI Rule

Never poll or loop on `gh pr checks` or GitHub Actions, including watch modes.
After a final delivery push, check once that CI triggered. A push, open PR or
triggered CI run is not a completion boundary: continue all unblocked
implementation and local verification while CI runs. Check CI again only after
another final delivery push; before merging in a later session, confirm green CI
for the current source revision. Never skip or weaken security, compatibility,
branch-protection or release gates to make CI pass.

Session report: task IDs, changed areas, actual checks, commit/PR, remaining risks,
and next exact action. Do not imply background progress after ending a session.
