# ADR0133 — Renderer spike and integrated qualification

Date:2026-11-08. Status:Accepted for implementation sequencing;no release approval.

## Evidence and problem

The existing architecture07 says N06-11 is a technical rig/fur/room vertical slice and allows promotion into N06-07/04 after actual browser plus packaged Android WebView evidence. The N06-11 module says physical Android is checked separately and labelled technical assets cannot close N06-09. N06-07 builds the creator,N06-04 integrates full worlds,N06-09 qualifies those integrated visuals,and N10-04 requires N06-04/N06-09 before its full physical gameplay spike.

Recent handoffs nevertheless described full creator/world art and the downstream physical spike as prerequisites to completing N06-11. That interpretation stalls the dependency graph:the work needed to obtain integrated evidence cannot start until the same evidence already exists. Preserve those historical records and failed measurements;correct the sequencing prospectively.

## Decision

N06-11 completion means the source-bound **technical renderer spike** is implemented and reviewed:shared authoritative-snapshot adapter/camera,rigged idle/walk/sit/serve,fur/LOD/material/anchor study,cache/disposal/context recovery and accessible failure controls. Browser and packaged owned-AVD functional checks must actually pass. Rig/geometry/texture/draw/resource ceilings must be evaluated against their unchanged applicable tier budgets. Loading/frame/heap measurements must be implemented,executed and retained,including failed observations and environmental limitations. A completed spike records a justified renderer decision;it does not certify the integrated product or every measured platform profile.

Only after that evidence is complete may N06-11 become VERIFIED and unblock the existing N06-07 dependency. This ADR alone is not evidence or a status transition. A technical asset remains labelled as such. Creator Save/Cancel,modular animal catalog,full Deadline/Maid gameplay and visual polish remain their own tasks and require their own actual tests.

All numeric budgets remain unchanged. The retained cold-loading and initial AVD frame failures are open qualification findings,not waived passes. N06-09 must measure/review the actual integrated creator/world build on its target platforms. N10-04 retains the real Android30minute/20enter-leave/10background/thermal/battery requirements. N14 retains separate Apple access/device qualification. No emulator/software GPU replaces those gates. Native process/cache/GC evidence is separate from HTTP context cache measurements.

N12/public/mobile distribution and safety/privacy/owner gates remain fail closed. This decision does not change platform-support inventory,release flags,authority,appearance persistence or manifest dependency edges. Existing Mxx and vNext evidence prefixes remain immutable. A renderer regression cannot be hidden by this sequencing correction:record it,fix functional/resource failures before spike completion,and carry unmet integrated performance/visual findings explicitly to downstream qualification.

## Verification and rollback

Before changing N06-11 state,record the current source/model/material hashes,actual browser/packaged-AVD functional matrix,unchanged budget comparisons,disposal/GC facts and reviewer findings. Validate the task DAG. Keep the prior renderer/appearance path as the default rollback until integrated acceptance warrants promotion. A later release decision must bind its own tested binaries/devices;it cannot cite spike VERIFIED as physical or final-art approval.
