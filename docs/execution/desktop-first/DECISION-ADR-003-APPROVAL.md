# VL-002 — Desktop First architecture approval record

Date: 2026-11-10. Implementation baseline: `100d64f` on
`codex/desktop-first-backend`. This execution record supersedes historical
web-first scheduling without editing the supplied plan/checksum baseline.

## Approval provenance

The owner-provided repository instructions name **VirtualLife v1.1 Desktop First**
as the active plan, assign Agent 1 A0/A1/A2 and Agent 2 Unity/Desktop/frontend,
require new Rust namespaces and default-off activation, and put Pet Arena PvE
before new Lodge gameplay. The owner's continuation instruction authorizes
implementation of that plan. This is the recorded product/architecture acceptance
of ADR-003, entered by Agent 1, not a forged handwritten or cryptographic signature.
Independent architecture countersignature is the source-bound Agent 2 review of
the VL-002 handoff. Until that review is approved, VL-002 remains unverified.

References: [owner instructions](../../../AGENTS.md),
[ADR-003](../../plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First/01-architecture/ADR-003-DESKTOP-FIRST.md),
[migration playbook](../../plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First/01-architecture/MIGRATION-PLAYBOOK.md).

## One writer per domain

| Domain | Sole writer | Integration boundary |
|---|---|---|
| Existing room IDs, seating, visits and legacy travel | Existing Nest `RoomAuthority`/`RoomService` | Keep the schema-scoped singleton guard; Rust cannot join or write these room IDs |
| Existing Lodge journal and private projections | Existing Nest journal host | Preserve encrypted state, receipts, versions and recovery; no in-place Rust conversion |
| Account/session/device credentials, social/privacy/block/report/moderation | Existing Nest services | Future Rust grants use a new audience, session binding and policy-generation contract; never raw browser credentials |
| Existing platform currency/progression ledger | Nest ledger and its authorized workers | Future Rust proposes an event; Nest validates and applies one inbox/ledger effect |
| New native world namespace `vl-native-aurora-v1` | One Rust runtime process initially | Reserved namespace only; no registry installation, admission or runtime flag enabled here |
| New native game state/receipts/outbox | Rust in a separately owned game schema | Existing numbered migrator owns DDL; Rust role has no platform-ledger writes or automatic schema creation |
| Rendering, input prediction, camera, animation and HUD | Unity Windows client | Sends semantic intents; cannot author positions, outcomes, damage or rewards |
| Official account/news/download website | Next.js portal | No simulation loop; downloads require actual signed release artifacts |

The new namespace is an execution allocation, not a claim it exists in source.
Existing Android native tickets are not Windows/Rust grants. No client selects its
server-side authority. One Rust replica is the starting deployment shape; fencing,
ownership transfer and autoscaling require their own later acceptance.

## Source and N06 handoff

VL-001's source audit and independent review preserve 209 legacy files, 105 supplied
plan files, 75 vNext evidence records and all 47 SQL migrations. N06-04 remains
`IN_PROGRESS` in the archive, with failed required browser frame budgets and open
art/loading findings. Its final `071bcbb` checkpoint is recorded separately in
`N06-04-LOD-LEASE-CHECKPOINT.json`; it is optional web compatibility and outside
the Windows critical path. Do not erase, promote or claim that work as Unity proof.
Agent 2 receives source ownership only through coordinator path reservations.

## Cutover and rollback

New native worlds start disabled and isolated from all existing world IDs.
Before any activation, verify tickets/revocation, receipt replay/collisions,
recipient privacy, reward inbox and compatibility against exact source contracts.
Legacy RoomAuthority cutover is outside this foundation and requires VL-072 owner
approval, epoch fencing and restore/reconciliation evidence.

For a failed native candidate: stop new native admissions, drain/abort or recover
the new namespace according to its durable protocol, and keep legacy Nest worlds
on their current owner. Roll back only binaries compatible with committed schema,
rules and content versions; otherwise drain safely before replacement. Preserve
receipts and audit evidence. Do not run destructive down migrations, copy private
cards into logs, or silently route native commands to a legacy Nest game writer.

## Explicit exceptions and gates

No Windows hardware, Unity editor/license, rig/brand rights, signing, CDN or human
art/UX qualification is asserted. No public deployment, purchase, paid licensing,
store submission or production-data operation is authorized by this record.
Mobile/macOS remain conditional. Baseline tasks with leftover browser hard gates
need an explicit reviewed execution overlay before their acceptance; do not modify
the immutable `TASKS.json`, `STATE.json` or `FILE-MANIFEST.json` to hide the mismatch.
