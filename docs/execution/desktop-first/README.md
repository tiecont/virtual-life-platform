# Desktop First Source Reconciliation - 2026-11-10

Owner accepted the supplied VirtualLife v1.1 Desktop First plan and assigned
Agent 1 A0/A1/A2 coordination/backend work. Agent 2 owns Unity/Desktop/frontend.
The planning package's 110 baseline TODO entries and checksum manifest remain
unchanged. Actual execution is in its `.agent-runtime/`; only the coordinator
writes live state and path reservations. VL-001 needs independent review before
any dependent source task is READY.

## Source And Ownership

Audited baseline: `071bcbbdc63ea28ba43dc7e11b68869793019da0`. Work proceeds on
`codex/desktop-first-backend` in `/home/tiecont/Projects/virtual-city`. Two concurrent
documentation commits, `8e2dbbb` and `bffe7e9`, were retained; they update the
legacy LOD checkpoint and do not change audited backend or migration sources.
The audit records source hashes separately from the observed HEAD.

One production `new RoomAuthority` exists in `apps/platform-api/src/app.ts`.
It acquires a schema-scoped PostgreSQL advisory lock and fails closed on loss;
this is a singleton deployment guard, not distributed world ownership. The
existing RoomService uses global serialization; do not copy that design into
new Rust rooms. The separate `worker.ts` has no RoomAuthority composition root.

Existing identity owns cookie/CSRF/session revocation. Native auth contracts are
Android-only; they cannot be reused as Windows support claims. New Rust ticket
audience, replay/revocation and content/protocol compatibility require VL-012/013
evidence. Nest remains the legacy world writer until an explicit fenced cutover.
New Rust Aurora IDs must be separate and default OFF; no second writer may commit
for a legacy room. Unity predicts/presents but never commits damage or rewards.

PostgreSQL has 47 numbered SQL files ending at `0047_game_journal.sql`.
`city_schema_migrations` checksums and its transaction/advisory-lock migrator
remain unchanged. No new migration number is reserved by VL-001; no Rust
auto-migrator is authorized. VL-003 must reserve the next available number after
rechecking the journal. Existing encrypted Lodge state, receipt/outbox and
account/session checks remain in Nest until separately verified migration work.

No tracked Rust workspace, C# game source or Unity ProjectVersion exists.
`cargo`, `rustc`, `rustup`, `dotnet` and `Unity` were unavailable on PATH.
Linux/AMD browser evidence is not compiled Windows player evidence. Hardware,
Unity terms/license, Windows runner and signing remain unqualified.

Sibling source audit was read-only: Deadline `f9475b4caa65813e9351aaa4598663df538116a3`
has tracked/untracked web changes; Maid `33180a920505a6e0f3998dbf0367be0b72727710`
has an untracked application tree. Both use pnpm 11.28.5. Neither repository was
changed or certified by this audit. Seven extant worktree attachments plus one
prunable historical attachment were inventoried, not removed.

## Evidence Crosswalk

| Old source | Preserved state | New use and remaining proof |
|---|---|---|
| Mxx root ledger | 151 task entries unchanged | Historical baseline only |
| vNext Nxx | 77 tasks: 44 VERIFIED, 2 external, 18 TODO, 12 deferred, 1 IN_PROGRESS | N05 ownership/identity ports inform Rust integration; no VL status copied |
| N06-04 | IN_PROGRESS; latest source `071bcbb` | VL-005 compatibility handoff; optional web work outside Windows critical path |
| Lodge | 25 tasks: 4 VERIFIED, 20 TODO, 1 deferred | N15 encrypted journal/fixtures inform Rust migration; no active Lodge scheduler |
| Pet Arena | 20 TODO | New Rust/Unity PvE requires independent PA/VL acceptance; PvE precedes new Lodge gameplay |
| New VL graph | 110 baseline TODO | Live coordinator state, actual source and independent reviews required |

[LEGACY-INDEX.json](LEGACY-INDEX.json) maps all 209 original files to
`docs/legacy-plans/2026-11-10/`; every relocated byte matches the recorded Git
revision. All 75 vNext evidence records retain their original serialization.
[INPUT-MANIFEST.json](INPUT-MANIFEST.json) locks all 105 supplied plan files,
including its baseline state and archived input. Added runtime files are outside
that checksum baseline; the supplied validator may warn about the increased count.

[N06-04-LOD-LEASE-CHECKPOINT.json](N06-04-LOD-LEASE-CHECKPOINT.json) and
[LEGACY-EVIDENCE-ADDENDUM.json](LEGACY-EVIDENCE-ADDENDUM.json) hold the final
in-flight measurement without modifying any old ledger. Actual checks: 68 units,
120 exact authored stream matches, 22 creator plus 18 room browser cases, full
build/types/lint, and 80 external-GC recreates. Four final heap deltas are
+1,605,512 / +1,423,660 / +2,125,180 / +990,728 bytes, all below the unchanged
16 MiB floor. Default Chromium required frame p95 remains 100-250 ms and fails
33.4 ms; the full command exits 1. Separate asserted AMD required profiles pass
8.3-13.4 ms, but never replace the failed workload or certify Windows. Mobile High
remains unsupported. Art/readability/loading/owner findings remain open.

The new private LOD index contains 251 files, SHA256
`fd8ed10aacc59c8a1be9fce834917906b8ba4796ae64e8104beaf5739ae155eb`.
Prior frozen indices and 58 protected inputs/47 SQL were checked. Two previously
known auxiliary Lounge HTML losses remain explicit; no replacement was invented.
Retained Docker remains tested `67ff2d4` at `https://localhost:3443`; no update,
public deployment, registry push, store action or production data change occurred.
Owner `.idea/` and `infra/botkeep-ca.pem` remain unread and unstaged.

## Verification And Handoff

`node docs/execution/desktop-first/verify-adoption.mjs` reproduces hash/ledger,
migration/source and singleton-constructor checks. Private index availability is
reported separately so a clean checkout does not imply access to raw local logs.
Current executed checks and their log hashes are in `VL-001-CHECKS.json`.
Backend regressions cover 11 unit cases and 23 real-PostgreSQL cases, including
SIGKILL, competing owner/takeover, encrypted private state and idempotent receipts.
These are scoped fresh checks, not blanket requalification of 48 historical tasks.

Agent 2 reviews the exact committed source/handoff hash under `.agent-runtime/reviews/`.
After approval Agent 1 uses the scheduler to verify VL-001, then reserves VL-002
and VL-003 according to priority. Owner adoption supplies product direction;
independent architecture signoff, formal one-writer matrix and licensing/signing
gates remain explicit. No Rust gameplay source is scaffolded before dependencies
are VERIFIED. Plan semantic issues, including VL-027's leftover browser acceptance,
must be resolved in a controlled overlay rather than editing the imported baseline.
