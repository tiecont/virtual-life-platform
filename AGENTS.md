# Repository Instructions

Read README.md and config/development-plan.json before changing code. Run
`pnpm plan:status` to see every task whose implementation dependencies are met.

One agent executes by default. For explicitly requested multi-agent work, the
lead assigns independent file scopes in isolated worktrees and alone integrates
changes and edits the backlog. Use model aliases only when available.
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

Keep the checkout focused on source, tests, assets, build/runtime configuration,
and the maintained backlog. Do not add session diaries, review transcripts,
generated evidence or archived plan packs. Put fresh logs under ignored artifacts/.
Historical plans and evidence remain in Git at archive/pre-cleanup-2026-11-10.
The historical-release fixtures are test inputs, not the active work plan.

Before merge, run relevant checks and actual CI against the committed source.
Record verification in the task entry with source SHA and actual command outcomes;
label self-review honestly. Merge through a green PR; never bypass failed checks.
Preserve owner changes and untracked files. Do not commit secrets or local IDE data.

Session report: task IDs, changed areas, actual checks, commit/PR, remaining risks,
and next exact action. Do not imply background progress after ending a session.
