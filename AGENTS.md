# Repository Instructions

Read README.md and config/development-plan.json before changing code. Run
`pnpm plan:status` to see every task whose implementation dependencies are met.

One agent executes all features. No agent assignment, reservation, second-agent
approval or phase-wide signoff is required before implementation. Work on any
ready task; keep actual code/contract dependencies. Hardware, media rights,
signing and release qualification apply to their own acceptance and deployment,
and must not delay unrelated source work. Never claim a check ran when it did not.

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
