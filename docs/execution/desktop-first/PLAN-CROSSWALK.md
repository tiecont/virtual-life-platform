# VL-009 — Existing plan crosswalk and handoff

Date: 2026-11-10. This is the execution decision after reviewed VL-001/002;
historical ledgers and the supplied Desktop First baseline remain immutable.

| Ledger/source | Preserved status | Current routing |
|---|---|---|
| Mxx original | 151 entries, unchanged | Historical product contracts; do not rerun as a new scheduler |
| vNext Nxx | 44 VERIFIED, 2 external, 18 TODO, 12 deferred, 1 IN_PROGRESS | Existing APIs/authority/privacy remain the live compatibility source |
| N06-04 | IN_PROGRESS; final source `071bcbb` | Archived web work plus separate final checkpoint; optional Windows-independent compatibility lane |
| Lodge | 4 VERIFIED, 20 TODO, 1 deferred | Preserve encrypted journal and old ownership; new gameplay follows Pet Arena PvE |
| Pet Arena | 20 TODO | New Rust PvE + Unity evidence; no copied verification or new Lodge scheduling before PvE |
| VL runtime | Live `.agent-runtime/live-state.json` | Sole coordinator writer, exact commit/artifact/review hashes, dependency-gated reservations |

`LEGACY-INDEX.json` maps all 209 original paths to their byte-identical archive.
`INPUT-MANIFEST.json` binds all 105 supplied baseline files. The reproducible
`verify-adoption.mjs` compares legacy SQL/source/checkpoint bytes and the 75 vNext
records. Source preservation is not fresh acceptance of every old feature.

Agent 1 owns A0/A1/A2, live state, numbered migration coordination and new Rust
source. Agent 2 owns frontend/Unity/visual work and independent reviews of Agent 1
handoffs. Active branch/worktree/path ownership lives in coordinator-issued
reservations. Current separate paths cover architecture/inventory, Rust foundation,
security, this crosswalk and the desktop runner decision. Do not start a successor
while its prerequisite is in review or blocked. Review rejection reopens the same
reservation and preserves all attempts rather than overwriting evidence.

N06 source handoff is `N06-04-LOD-LEASE-CHECKPOINT.json` and
`LEGACY-EVIDENCE-ADDENDUM.json`: 80 final GC samples remain, final heap comparisons
pass, default required browser frame budgets fail, and art/loading findings remain.
No optional browser result qualifies a Unity Windows player. No renderer source,
Unity project, migration SQL or production state is changed by this decision.

The owner keeps CachyOS development, supported Ubuntu Unity Linux CI, Windows
functional build/test CI and physical-GPU Windows self-hosted performance evidence
separate; details and unresolved baseline web-gate exceptions are recorded in
`DESKTOP-EXECUTION-DECISION.md`. Mobile/macOS remain conditional. Legacy cutover,
public release, paid resources, signing and production operations require their
own actual evidence/owner gates.
