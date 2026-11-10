# VL-005 — Preserve optional web compatibility and graphics fallback

The existing browser client remains a compatibility surface. Windows Unity is the
primary new product; this audit does not build another browser gameplay client,
remove old functionality or accept failed legacy performance gates.

The coordinator reserved only this audit directory after the N06 source handoff.
[SOURCES.json](SOURCES.json) records fourteen actual renderer, adapter, shell and
test hashes. Every file matches the final N06 source
`071bcbbdc63ea28ba43dc7e11b68869793019da0` byte-for-byte. This task changes no
renderer, frontend, protocol, DB or legacy ledger source.

## Current rendering and authority boundary

`packages/game-client/src/WorldRoomPanel.tsx` loads Pixi lazily by default.
`apps/portal-web/app/components/WorldRoomPanel.tsx` enables the sandbox Three
renderer only through its existing explicit loader or
`NEXT_PUBLIC_VLP_ROOM_3D=1` sandbox switch. Dedicated `/room3d` routes supply an
explicit Three loader. Classic Deadline/Maid room routes and their Pixi source
remain intact. The existing CommonJS/ES-module renderer adapter accepts the
actual factory shape without importing another game's authority.

RoomSceneHandle receives an authoritative room snapshot. Nest remains the sole
legacy room writer; neither Pixi nor Three invents seat ownership, confirmed
departure or a server outcome. On renderer failure or WebGL context loss, the
shared shell marks graphics unavailable while keeping the DOM room controls and
server connection independent. Seat/leave actions still wait for real server
confirmation. Graphics recovery repaints the canonical snapshot.

The existing failure path retains the accessible DOM interface; it does **not**
automatically start a second Pixi renderer when a Three context fails. The
preserved classic Pixi routes are the separate 2D compatibility path. This record
does not claim an automatic 3D-to-2D hot swap or parity of every feature under a
missing GPU. Focus, privacy and activity controls stay in the shared shell; the
fresh browser check exercises the concrete seat/recovery/leave flow below.

## Preserved measurements and open findings

[BASELINE.json](BASELINE.json) summarizes the immutable N06 final checkpoint and
binds its original hash. These are historical measurements, not new benchmarks:

- 68 units in 16 files; 40 browser cases; 120 exact authored model stream matches.
- Ten required desktop/mobile quality frame results all fail the unchanged
  33.4 ms p95 gate; their final observations range from 100 to 250 ms. Both mobile
  High rows remain unsupported diagnostics, including their failed draw-call gate.
- All eighty external-GC cycles remain. Four final heap growth comparisons pass
  the original 16 MiB floor: +1,605,512 / +1,423,660 / +2,125,180 / +990,728 bytes.
  Peaks and samples remain in the source checkpoint; zero references/canvases
  after teardown do not prove absence of a browser/driver leak.
- The separately asserted Linux AMD diagnostic remains separate. It neither
  replaces the required default Chromium/SwiftShader result nor qualifies Windows.
- Art/readability, controlled loading and human/owner acceptance remain open.
  N06-04 remains `IN_PROGRESS`; no archived status is promoted here.

The original checkpoint and private index references remain in
`N06-04-LOD-LEASE-CHECKPOINT.json` and `LEGACY-EVIDENCE-ADDENDUM.json`. This audit
does not delete raw samples or reinterpret a passing resource counter as a passed
frame budget.

## Fresh verification scope

The four focused existing unit files exercise Pixi projection/seat validation,
scene manifest bounds, Three projection/room geometry and rejection of foreign or
duplicate state. Their actual result is recorded in [CHECKS.json](CHECKS.json).

The existing `scene3d-room.spec.ts` context-loss scenario is selected alone for
desktop and mobile browser emulation. It loses the real WebGL context, checks the
graphics-failure notice and disabled camera action, claims seat-2 via DOM controls,
checks the real HTTP snapshot, restores graphics, then leaves and checks the real
room snapshot is null. It uses a disposable local PostgreSQL/API and the rebuilt
Next application. Unique run/report directories preserve previous captures.
These checks are browser compatibility evidence, not physical mobile, Windows,
performance, full accessibility or final-art acceptance.

## Scheduling and rollback

The reviewed Desktop First decision and crosswalk keep optional browser graphics
outside the Windows critical path. Source/evidence can inform future art and
protocol work, but browser passing/failing frames cannot satisfy a Unity GPU gate.
Baseline tasks VL-027/033/058 still need their explicit reviewed execution overlay
before reaching leftover browser acceptance/gates; this audit does not rewrite
the immutable graph or secretly bypass the live scheduler.

Future browser source changes require a coordinator reservation and fresh source
checks. Keep the existing Nest owner and classic compatibility routes. Roll back
an optional teaser through reviewed source/config changes, preserving authoritative
room/seat state and the DOM control path. No deployment, registry/store operation,
new production flag or public publication is performed here.
