# Procedural3D technical candidate — revision1

N06-11 is IN_PROGRESS. This new runtime candidate does not change the historical
N06-10 concept provenance, source audit or immutable pre-measurement budgets.

Original source-authored inputs: `packages/scene3d/src/animal.ts` generates a
24bone cat, continuous blended limb surfaces, coat vertex colours, deterministic
surface groom cards and a small fibre normal texture; `room.ts` generates the
wood grain, cafe geometry and props. `study.ts` owns the WebGL2 camera, lights,
quality/lifetime and recovery. No downloaded mesh, groom, texture, remote decoder
or model URL is consumed. The reference raster remains a design reference only.
This authorship account is not owner art approval or release media signoff.

Actual source-bound geometry inspection with the visible apron:

| Tier | Whole base triangles | Groom triangles | Visible model draws, no shadows | Geometry bytes |
|---|---:|---:|---:|---:|
| Low | 2424 | 1300 | 4 | 794112 |
| Balanced | 7864 | 5600 | 12 | 2873520 |
| High | 15128 | 18000 | 12 | 6993840 |

These are actual single-character geometry counts, not20actor/frame/texture/RSS
qualification. Cache references return to0 after disposal. Unit tests count all
visible base geometry for casual/apron, check normalized rig/groom weights and
finite deformed poses, and share body/groom across20independent skeletons.
Original body-only LOD overflow and later whole-model overflow were detected
before reduction and remain preserved failures.

Actual revision1 browser review on1440×1000/844×390 uses Chromium SwiftShader.
Functionality passes, including context loss/restoration and four recreate
cycles per profile. It is software-GPU evidence, with no physical performance
acceptance. Ear/eye layering and full-character counts are improved; the current
groom still shows sparse speckling and limbs have a pointed/tube-like silhouette.
The room materials/lighting are a simple corner study. Serve has an arm pose but
no held tray; sit/feet/cloth still need anchor review against a production rig.
This candidate is visibly below the reference's fur/silhouette/composition bar.

Owner art approval:false. Final production asset approval:false. Exported
glTF/animation clips:NOT_CREATED. Cat/dog/rabbit modular catalog:NOT_IMPLEMENTED.
Authoritative3D room snapshot/intent adapter:NOT_IMPLEMENTED. Creator Save and
native session:N10-03/N06-07 pending. N06-09 final visual acceptance and physical
Android budget qualification remain separate, open gates. Follow
`docs/mobile/3D-STUDY.md` for the implemented opt-in study and emulator commands.
