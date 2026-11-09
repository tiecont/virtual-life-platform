# Unity URP stylized rendering blueprint — anime city and kemonomimi avatar

## Visual principle
High-polish stylized anime **without cloning existing games' shaders/assets**. Bright fantasy-campus city: blue-sky color design, crisp silhouettes, soft warm bounce, controlled shadows, lively storefronts; clear expression closeups, eyes and ears/tail emotional cues; table cards always readable.

## Layered graphics approach
| Layer | Pipeline recommendation | Budget discipline |
|---|---|---|
| Character faces | URP custom face shadow map/mask for cheek/nose plane; shape-preserving ramp, eye highlights, controlled specular, 12–18 expression blendshapes | clamp closeup light cost; no additional full-screen face pass |
| Hair/fur | stylized anisotropic highlight approximation, gradient/specular ramp, hair cards and near-only finer cards | no photoreal per-strand groom outside hero shots |
| Character outlines | depth/normal edge lines or inverted hull by LOD where needed | prevent doubled cost on crowds; outline skipped at far LOD |
| Outfit/fabric | PBR/anisotropic-lite where needed; GPU skinning; animations via rig+blend tree | zero physics when off-screen/far |
| Buildings | PBR/stylized materials, baked lighting/probe volumes, instancing | shared atlas, HLOD, fewer material variants |
| Foliage, cloth banners | vertex shader wind, GPU instancing, LOD | non-interactive wind **client-side**; Rust does not track leaf vertices |
| Weather/day-night | sun/sky rotation schedule, baked/probe variants and selective dynamic shadows | avoid universal dynamic GI requirement |
| Pet VFX | particle pooling, dissolve, hit-timings, brief camera shake optional | reduced motion/flash safety; never hide tactical board |
| Café | warm localized area light illusions, probes, hand IK, contact shadows where affordable | don't spawn dozens of real-time shadowcasters |

## Render performance techniques
- URP SRP Batcher; static batching and GPU instancing where compatible; GPU Resident Drawer pilot after correctness/perf test; SkinnedMesh & expression LOD by distance; frustum/occlusion culling.
- Shader Graph for iteration + audited HLSL shader functions for critical face/hair; **shader keyword budget** and stripping with variant logs. Check missing variants under Low/Balanced/Ultra, avoid build-time shader explosion.
- Addressables + asset mip streaming; prewarm needed shader variants for next zone; asynchronous texture/mesh upload with measured hitches.
- One *approved* tone mapping/color grade per lighting scenario; don't let every map artist choose incompatible bloom/luminance. Avoid unreadable UI on sunrise/backlit environments.
- Dynamic resolution and optional postprocessing on low tier; shadows/foliage/particles/LOD/transparent overdraw are first downgrade levers.

## Three canonical golden scenes
1. **Aurora Plaza Noon**: 20 (placeholder, must be measured) visible avatars, storefront life, animated signs, trees/wind, 3 distant crowds, camera orbit.
2. **Lumi Café Sunset**: enter, chair sit, tail collision, face expression on conversation, drinks hand IK, board-game overlay.
3. **Pet Arena Dusk**: run to challenge kiosk, battle camera, match-3 UI, hit VFX, particle flashes, exit back to world.

## Measurable acceptance
Screen/video + stats captured from **compiled Windows player** on published hardware/driver list. Record FPS distribution, CPU/GPU frame time p95/p99, frame hitch >50ms and >100ms, VRAM, texture/draw/triangle counts, shader variant count/load, GC alloc per frame, player loading. Visual reviewer separately grades color harmony, shadows, hair, face, legibility, no ear/tail/chair clipping. Numbers in `GRAPHICS-QUALITY-BUDGETS.md` are target hypotheses, not verified claims.

## Reference
- Unity URP GPU optimization: https://unity.com/how-to/gpu-optimization
- Shader stripping and variants: https://docs.unity.com/en-us/engine/6000.3/manual/materials-and-shaders/built-in/shaders-in-universalrp/shader-stripping/check
