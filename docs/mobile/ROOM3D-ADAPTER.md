# Shared3D room adapter — N06-11 technical slice

Status: IN_PROGRESS, not final art, native authenticated gameplay or physical
performance acceptance. This extends the original local studio with a real
RoomSnapshot consumer. Existing playable routes stay on Pixi by default.

## Entry points and rollback

The explicit web route `/worlds/sdk-sandbox/room3d` uses the existing signed
session/catalog/compatibility and singleton room-owner path. It does not install
a world or bypass a closed-world policy. `NEXT_PUBLIC_VLP_ROOM_3D=1` optionally
switches only the normal SDK-sandbox route; other worlds keep their existing
renderer. Next public flags are fixed at build time. Reset/rebuild the flag or
use the normal route with the default build to retain Pixi/v1 behavior.

The native local preview can use `VITE_VLP_ROOM_3D=1`; the independent
`VITE_VLP_SCENE3D_STUDY=1` retains the close-up studio. Native authentication is
still N10-03 work. An empty native room draws no visitors and opens no gameplay
socket. No local simulated visit or inventory grant is presented as real.

## Presentation, not authority

`sceneEntities` moves unchanged from Pixi into world-sdk, preserving the old
Pixi export. Both renderers use the same strict public projection, visible peers
plus the existing self fallback, v1 palette/outfit defaults and motion checks.
Occupancy/held-seat totals never create extra animals. No private inventory,
relationship/session/queue data or URL becomes a model input.

`RoomProjection` tracks accepted snapshots and their monotonic receive time;
old versions in the same context cannot rewind the scene. Real context changes
clear previous actors. Existing RoomRecovery tickets remain the authority for
late account/transport responses; the renderer does not create a second owner.
Committed paths interpolate with the existing150ms step and unchanged floor.
Reduced motion snaps to the committed endpoint, without granting an early seat
or bypassing the server's active-walk restriction.

One server tile maps to0.5metres. Manifest walls/tables/counters/planters/stages,
seat coordinates and north/south facing drive room geometry. An orthographic3D
camera fits that floor with bounded orbit/pinch/zoom. Raycasts submit the same
validated move/seat callbacks. Held/occupied seats, seated self, unfinished
walks and solid/outside/fractional tiles do not emit a candidate intent. No
position or seat changes locally after a click; the snapshot must confirm it.

## Resource and lifecycle policy

The original24bone animal and groom are shared with the studio; models remain
technical art below the reference quality bar. Gameplay never uses LOD0. Low,
Balanced and High permit2/4/8near LOD1 animals, respectively; all other visible
animals use LOD2. Self remains readable, with stable distance ranking to reduce
LOD churn. This preserves every authorized actor rather than silently dropping
people to meet a budget. It does not establish a supported100actor workload.

Low DPR≤1/no shadows, Balanced DPR≤1.25 and High DPR≤2 use the previously locked
tiers. Only near bodies cast live character shadows; attachments/far bodies do
not multiply the shadow pass. Reconnecting opacity uses per-instance material
clones, preserving shared coat resources for other actors. Actor clones, rigs
and groom/cache references are released on removal, context replacement or
invalid projection. Scene-level room assets, controls, listeners and animation
callbacks are released on exit or partial initialization failure.

Document and native suspension stop animation and disable pointer actions;
native/recovery suspension clears current actor presentation. Context loss
shows the existing DOM graphics fallback and preserves independent safety,
seat/leave and recovery controls. Context restoration reuploads the current
presentation; it cannot authenticate or restore an old visit. Diagnostic canvas
attributes contain bounded resource/count/quality data and public seat/spawn
screen positions, not account identifiers or credentials.

## Verification and limits

`pnpm test:scene3d-room` is implemented: actual Next/HTTP/signed-session/
PostgreSQL/Socket.IO cases run separately in desktop and Chromium mobile
profiles. It verifies anonymous entry, delayed outbound seat intent, real
seat/floor raycasts and ACK motion, graphics loss with usable DOM actions,
transport recovery, account switch, reduced motion, resize and teardown.
The CI browser inventory includes the new spec with the existing source/test
isolation guards. Actual run outcomes are in the dated audit, not inferred
from this command's existence. Browser GPU identity/errors and selected images
are captured separately from functional assertions.

Use `VLP_EMULATOR_ROOM3D=1 pnpm mobile:emulator:scene3d --apk <local-debug-apk>`
with the task-owned AVD for the native empty-room/context probe plus the existing
studio/lifecycle checks. It deliberately does not select a USB device. Native
auth, physical Android,20actor GPU/loading/resource qualification and N10-04's
long duration remain separate gates. Neither browser emulation nor a short
AVD measurement establishes physical frame/thermal/battery acceptance.

Final fur/silhouette, rig/cloth/serve anchors, modular creator/thumbnail fidelity,
polished Deadline/Maid scenes and N06-09 owner-review status are still open.
N14 remains conditional on Mac/Xcode/iPhone availability. Public deployment,
store distribution, migrations and release/distribution gates are unchanged.
