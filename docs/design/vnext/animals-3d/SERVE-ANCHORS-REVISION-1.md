# Serving prop and paw anchors — technical revision1

N06-11 partial slice,2026-11-08 (Asia/Ho_Chi_Minh). Original procedural tray/cup geometry is added to the existing rigged-cat study. The character body,groom,face,skin weights,UVs,indices and morph streams remain byte-identical to the Git-archived prior model at5d53cf7 for all three tested detail tiers. No external mesh/image/font/audio,media-rights signoff,owner art approval or final visual acceptance is assigned.

The serve pose now carries a shallow tray with a ceramic cup/handle and coffee surface. A rigid contact frame derives from both posed paw supports. Its endpoints follow the paws during breathing,parent yaw and nonuniform parent transforms; the tray disappears for idle/walk/sit. It adds no bones,texture,authority,gameplay action or v1 appearance field. Posing in the local studio grants no worker role or server service outcome.

The prop batches vertex-coloured opaque geometry into one main-pass draw,plus an applicable shadow pass. This deliberately uses a shared study material response; it is not final authored wood/ceramic material fidelity. Geometry/material disposal is owned per avatar and idempotent. Complete visible-model accounting includes the prop during serve; hidden retained buffers are still included in scene resource inventory.

| Tier | Existing base | Serve prop | Serve base total | Existing groom | Locked base ceiling |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 2744 | 240 | 2984 | 1300 | 3500 |
| Balanced | 9144 | 384 | 9528 | 5600 | 10000 |
| High | 18008 | 640 | 18648 | 18000 | 28000 |

Actual unit assertions check both paw contact endpoints through breathing and parent transforms,pose visibility,original ceilings,full triangle accounting and exactly-once disposal without destroying another avatar's lease. Browser desktop/landscape and owned Android AVD show the actual prop for all three detail tiers and retain native Back/rotation,context recovery,DOM controls and recreate cleanup. These are functional technical-study checks; the unchanged reference-quality gate is not met by this prop.

Developer inspection of the actual browser/native images: the tray/cup now makes the serve silhouette readable and stays in front of the apron with both hands underneath. The simple single-material treatment,faceted tray edge,flat apron,character anatomy and sparse/bright fur still fall below the cinematic look-development reference. Full Deadline/Maid scene polish,final cloth/fur/rig/serve animation transitions,camera/thumbnail review,modular creator and owner visual review remain open. No body/groom detail reduction is used to pay for the prop.

The unchanged20actor workload keeps its original seated/walking/idle mix; serving props are hidden in that profile but retained-buffer/disposal accounting includes them. Isolated owned AVD Low/Balanced observed limits pass at≈16.8ms external RAF p95,geometry4730704/4742376bytes and20complete recreates. High still exceeds the mobile draw cap as a predeclared desktop-tier diagnostic. This workload does not measure20simultaneously serving characters or physical30minute performance. Browser software-GPU/studio timing diagnostics and old failures remain separate; no FPS acceptance is inferred from screenshots or functional exit0.

One attempted workload wrapper build lacked the pinned JDK/SDK environment,and its prematurely started verifier used the old studio APK and failed. Both are retained. A pinned Gradle build plus exact packaged workload-marker/asset/hash proof preceded the accepted isolated AVD run. The original locked budgets and prior frozen workload evidence are unchanged.

Current source: `packages/scene3d/src/serve-prop.ts`,integration in `animal.ts` and debug-only serving diagnostics in `study.ts`/the shared scene port. The existing studio/browser/native verification now checks prop visibility and bounded detail. Raw evidence lives under private `artifacts/vnext/n06-11/serve-v1/`; the vNext checkpoint supplies the actual source SHA,commands,hashes and acceptance limits.

Next exact action: implement a controlled cold/warm p75 loading and external heap/GC measurement harness before running it; preserve current budgets and label the procedural-art scope. Continue final fur/silhouette/cloth/camera and full scene polish,then qualify available physical Android separately. Whole N06-11 remains IN_PROGRESS;N06-07 still requires its full acceptance,and iOS remains N14 conditional.
