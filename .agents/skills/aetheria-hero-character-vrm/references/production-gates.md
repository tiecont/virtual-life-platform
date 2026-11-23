# Production Gates And Delivery

Paths are relative to the repository root. Prefer existing character sources,
specifications, contracts and helpers over parallel manifests or services.

## Inputs And Budgets

Read `specs/pet-arena/art-direction.md`, applicable catalogs/animation profiles
under `specs/pet-arena/v3.1/data/` and the character's own art direction. Older v2
creature briefs are not Icarus's appearance or triangle budget. New explicit owner
references govern appearance; canonical identity and gameplay remain unchanged.

If present, read the local kit at
`/home/tiecont/Downloads/aetheria-soulbound-cinematic-kit/`, especially
`docs/08-3D-RENDERING-AND-VFX-PIPELINE.md` and character data. This machine-local
path is optional elsewhere. Describe missing inputs and use repository sources
where possible; never claim an absent kit was read.

The Limited kit targets Blender 4.x LTS, meters and Y-up export, LOD0
26,000-29,500 triangles, 68-82 bones by character, at most three materials and
2048x2048 texture sets. Icarus uses 74 bones. Candidate LOD1 is 14,000-16,500
triangles; LOD2 is 6,500-8,000. Use current per-character contracts for required
LODs. Game budgets do not constrain high-poly sculpts; never raise them to pass a
draft. Use the Unity/URP versions pinned in the active project.

## Stages

| Gate | Output | Required Observation |
| --- | --- | --- |
| G0 Reference brief | Hashed references, primary appearance target, proportions/materials/motion and hidden-view proposals | Conflicts resolved; inferred views labeled as proposals; current acceptance state explicit |
| G1 Design views | Consistent front/side/back views, face and material details | Same identity/costume across views; likeness checked before topology polish |
| G2 Base mesh | Editable model with useful separate components | Correct anatomy, head/body balance, hair masses, costume and appendage attachment from multiple views |
| G3 Detailed model | Face, hair, costume, ornaments and appendages | Reference-level focal detail and convincing construction under neutral light, including close-ups |
| G4 Game asset | Retopology, UVs, bakes, painted textures/masks and required LODs | Deformation loops and shading correct; UV mirrors documented, no accidental overlaps/seams; detail survives export; budgets measured |
| G5 Rig/skin | Skeleton/controllers, weights and required facial/secondary controls | No unweighted vertices or broken joints; extreme shoulder/elbow/wrist/hip/knee/wing poses inspected; no visible hair/cloth penetration in required actions |
| G6 Animation | Named actions and transitions from the actual contract | Distinct actions, expressive timing/follow-through, valid loops/contacts and visibly moving geometry |
| G7 Unity | Imported model/materials, prefab, Animator, VFX and requested cinematic setup | Actual licensed Editor/player inspection; correct shaders/textures/scale/bindings; gameplay authority unchanged |
| G8 Delivery | Source/export/runtime assets, provenance, previews and validation | Reopen/reimport delivered files; inspect final footage; report visual/technical/rights/performance states separately |

G1 can use Blender design studies when no image generator is available. Three
angles of an inadequate mesh do not pass the visual design gate.

## Animation And Render Verification

The kit's `idle`, `intro`, `normal`, `rage`, `signature` are five authoring clips,
not the full gameplay contract. Read `limited_animation_profiles.json` and the
current schema for canonical action bindings; preserve distinct roster profiles.
Inspect anticipation, impact, recovery and loop boundaries of every required
clip, including hands, hair, cloth and wings. Record actual times and duration.

Synchronous Unity Editor rendering can show stale skinned poses even when bone
transforms or CPU vertex displacement change. Advance the rendering loop properly
or bake each sampled pose explicitly; check import transforms and scale. Verify
nonblank frames, full framing and motion in the body regions affected by the
action. Camera/particle movement alone cannot prove character animation.

Render neutral front/side/back, a turntable, focal close-ups and representative
action footage with VFX off/on. Keep comparison cameras stable and wing tips/feet
in frame. Inspect both frames and the encoded video. Check reduced motion
separately. Performance claims require measured frame time, memory, loading/
shader cost and named device; an Editor MP4 is not Windows player qualification.

Use existing commands where their implementation is present on this branch:

```sh
pnpm build:packages
node --import tsx scripts/pet-asset-check.mjs
node --import tsx scripts/pet-asset-check.mjs --limited-v31 path/to/bindings.json --require-complete
```

Inspect CLI support before using Limited options or a renderer from another
branch. Locate/reconcile an existing pipeline PR when needed; do not claim an
unsupported command passed. Draft preflight can exit 0 with all art missing:
read binding status, missing list and acceptance fields. Full character delivery
requires complete bindings plus actual visual/import/render checks. Do not weaken
assertions or substitute dummy assets to clear a gate.

## Delivery Contract

Preserve established character paths and importer GUIDs. Full requested delivery
includes:

- Editable `.blend` with required model/sculpt, UVs, rig/actions and packed or
  included textures; reopening must not depend on workstation-only paths.
- Required `.fbx`/`.glb` exports and material texture sets (Albedo, Normal, ORM,
  EmissiveMask where used), with channel packing, color spaces and provenance.
- Actually authored Unity materials/shaders, prefab, controller/clips, LODs,
  VFX and requested Timeline/Cinemachine dependencies.
- Existing manifest bindings with actual source/export/import/runtime hashes,
  character ID, design revision, reference hash and rights state.
- Real stills/motion previews covering the required actions. Confirm encoded
  media using `ffprobe` or equivalent. A stretched still is not animation;
  requested audio/reduced-motion variants remain missing until files and
  bindings exist.

Keep generated reports and intermediate renders in ignored `artifacts/`; only
intentional maintained previews accompany source assets. Record actual source
SHA/checks, honest self-review, open gates and next action in the existing task.
Offline delivery, rights clearance, hardware acceptance and publication are
separate states; never imply an unperformed approval or check.
