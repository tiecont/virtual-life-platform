# Crosswalk: original archive → VirtualLife desktop-first v1.1

**Source:** user-supplied `Archive.tar.gz` (09 November 2026), not a live repo audit. Three groups: `platform-vnext` (77 task entries: 44 verified, 1 in progress `N06-04`, 2 externally blocked, 12 deferred, 18 TODO); `LANTERN-LODGE-PHASE-2` (25 entries, N15-01..04 verified); `vlp-pet-arena-plan-v0.1` (20 tasks TODO). Their states are **read-only** to this package.

| Legacy area | Archived status and constraints | Action in desktop-first v1.1 |
|---|---|---|
| N05-01..06 RoomAuthority | existing VERIFIED state/ownership | KEEP NEST owner for legacy room namespace until G7 fencing/cutover. New Aurora worlds Rust only. |
| N06-04 active web/3D | IN_PROGRESS at snapshot | Ask running agent for SHA/worktree/handoff before shared source edit; may finish its own criteria, but no full browser renderer requirement for new Windows product. |
| N06-09 web qualification | pending in legacy priority path | Complete under original plan if owner chooses; not a **necessary** dependency for Windows native G2/G4 unless shared auth/DTO changes need regression. |
| N06 existing avatar/Three slices | verified evidence and content | Preserve/reuse contracts, rig and assets; project may keep optional web teaser, avoid rewrite of checked-in source solely to follow ADR. |
| N10/N11/N14 mobile conditional | native originally later and device gated | **Desktop Windows native is a NEW product decision**, not automatic activation of old mobile tasks. G5 mobile remains gated by real devices/licenses. |
| N15 Lodge board + encrypted journal | N15-01..04 VERIFIED | Rust board rules must match golden fixtures and encryption/replay; keep legacy read/restore and no hidden-card leakage. |
| Pet Arena PA-001..PA-020 | all TODO in snapshot | New game must use Rust authority and **Unity Windows presentation**; PA-017 PvE acceptance still needs independent proof, not VL task status alone. |
| N04/N07 external ops | external/infra gates | Do not assert staged production or signing/CI complete without real credentials, on-call and deployment evidence. |

## Supersession
The **v1.0** overlay assumed full web-world as first playable visual. **v1.1** uses Unity Windows from G1/G2 and official Next.js website for publishing. This is a product/roadmap change; it does **not** invalidate any old acceptance by decree. One coordinator must reconcile real HEAD and live branch state before moving actual work.

## Protocol & game state boundary
Shared content IDs and proto compatibility. `legacy_room_<id>` remains Nest RoomAuthority while `vl_aurora_<id>` is Rust-authoritative from creation; never same room/game ID simultaneous writers. Game reward receipts Rust → durable outbox → Nest platform inbox; no Unity direct inventory/ledger update.

## Files/branches cannot overlap casually
Current source worktree, package locks, DB migrations, generated proto, Unity ProjectSettings, Next shell, release signing are hot files requiring owner reservation and review. Reference `04-delivery/MIGRATION-V1-TO-V1.1.md` and `AGENT-EXECUTION-ORDER.md`.
