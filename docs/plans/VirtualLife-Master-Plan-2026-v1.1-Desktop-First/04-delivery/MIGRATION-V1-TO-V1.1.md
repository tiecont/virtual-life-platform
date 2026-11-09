# Migration/crosswalk — web-first v1.0 → desktop-first v1.1

## Do not falsify progress
This package copies v1.0 files, preserves IDs VL-001..076, adjusts **future task descriptions** (their v1.0 `STATE.json` was all TODO) and adds VL-077..110. This is a plan revision, **not execution**. The supplied `Archive.tar.gz` older plan ledgers Nxx/PA/Lodge are immutable here; verified N05 room authority, N15 encrypted game journal and N06 slices remain valid until compatibility regression proves otherwise. Current repo HEAD has NOT been audited.

## Scope changes
| v1.0 plan | v1.1 plan | What coordinator does |
|---|---|---|
| Full Aurora City browser scene in G2 | Unity Windows Aurora City in G2 | recast VL-027/029/030/031/033/034 to native, accept a new Unity CI pipeline |
| N06 web renderer spike as core path | N06 existing web technical work as *compatibility and optional teaser* | don't cancel active N06-04 unilaterally; checkpoint owner then isolate from native work |
| Unity optional G5 mobile pilot | Unity **Windows** G1/G2; mobile remains G5 gated | reserve native client/URP build artifacts first |
| Website as playable game shell | official marketing, account/download, documentation/preview | create portal route with responsive video poster, no gameplay authority |
| Web card/Pet UI overlay | Unity in-world card/Pet HUD for Windows | Rust rules/privacy unchanged, new C# generated proto and native QA |
| Web 30m perf as G4 core gate | 30–60m **compiled Windows player** GPU/driver test | browser Core Web Vitals tested for marketing/portal only |
| Web launch as official release | Windows signed installer + website portal release | patch/signing, content CDN, rollback and canary added |

## Legacy owner compatibility
- **N06-04** in progress in archive: keep source owner until handoff; reuse art/asset/page shell and web dashboard. N06-09 web qualification may continue to fulfill original plan separately; it is **not** prerequisite for desktop scene unless a shared API contract requires it.
- **N05 existing NestJS RoomAuthority** remains authoritative for legacy room IDs. New Rust native world uses separate world ID namespace and feature flags. Epoch + single-writer cutover only after G7/verified tests.
- **N15 Lodge TypeScript rules/encrypted journal** remain read/restore compatible; Rust adapter via golden fixtures; private cards cannot become public projections.
- **Pet Arena PA-001..020** remain TODO under their original plan; map implementation effort to new Rust game engine & Unity client but do not double-claim verification.

## Required change-control record
Coordinator writes `DECISION-ADR-003-APPROVAL.md` only after explicit owner acceptance; record repo SHA, affected paths, brand licensing, devices, branch reservations and agent worktree handoff. If any v1.0 VL task was actually started after archive creation, reconcile its state **before** mutating source. Roll back through source-control/plan ledger, never delete old evidence.
