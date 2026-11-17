# Icarus White/Gold Study

Editable Blender source and a rigged GLB for the owner-supplied Icarus visual
target. The imported FBX and study shader are under
`apps/unity-client/Assets/VirtualLife/ArtStudies/Icarus/`. This folder is not a
runtime content import or a completed Limited character.

The study replaces the initial crimson costume with pink hair, white/gold dress,
shaped face and eyes, layered feather wings and a recurve bow. Back and side
details absent from the reference are proposals. It still needs more refined
anatomy, hair, clothing, feather detail and art review to approach the reference.

## Rebuild And Inspect

Use the pinned Blender 4.5 LTS and the existing licensed Unity 6000.3.14f1.
Pass a new output directory for each run; source files are not overwritten.

```sh
blender --background --python-exit-code 1 --python scripts/art/build-icarus-blockout.py -- --output artifacts/icarus-study-new --reference specs/pet-arena/references/icarus/owner-battle-reference.png
node scripts/unity-native-prepare.mjs
```

After reviewing and copying the exported FBX to the maintained Unity study path:

```sh
VL_ICARUS_RENDER_OUTPUT="$PWD/artifacts/icarus-render-new" "$UNITY_EDITOR" -batchmode -projectPath "$PWD/apps/unity-client" -logFile "$PWD/artifacts/icarus-render-new.log" -executeMethod VirtualLife.Editor.IcarusStudyRender.Render -quit
python3 scripts/art/verify-study-preview.py artifacts/icarus-render-new
ffmpeg -framerate 20 -i artifacts/icarus-render-new/frame-%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart artifacts/icarus-render-new/icarus-study.mp4
node --import tsx scripts/pet-asset-check.mjs --limited-v31 assets/characters/icarus/white-gold-study/bindings.json
```

The renderer needs an actual graphics device; do not add `-nographics`.
It checks imported mesh/bone/material budgets and actual vertex displacement for
all five clips. The 22-second study video contains idle8s, normal4s and signature10s
at their authored speed, using a fixed camera. Intro15s and rage6s are present in
the rigged exports and checked for deformation. This is Editor URP rendering,
not standalone-player performance qualification or Timeline/Cinemachine work.

Source/GLB has 29,376 triangles. Unity imports 27,564 after its mesh cleanup;
both counts are in the current LOD0 budget. The armature has 74 bones and uses
three vertex-color materials. UVs are preliminary and overlap; there is no
production unwrap or baked 2K albedo/normal/ORM/emissive set. Five authoring clips
do not constitute all16 canonical gameplay action bindings. The draft manifest
intentionally reports missing clip/VFX/audio/prefab/controller/portrait and
reduced-motion bindings. `--require-complete` must fail until those exist.

No FIRE_ZONE graph, sound design, reduced-motion acceptance, measured frame-time
budget, rights approval, source merge or publication is implied by these files.
OFFLINE_ONLY / NO_GO_PUBLIC. Logs and generated inspection facts stay in ignored
`artifacts/`.

## Provenance And Live Editing

`bindings.json` binds exact bytes of the maintained Blender source, GLB, FBX,
Unity MP4 and import settings. The import settings pin the generator, geometry
helper, Unity renderer, shader, FBX importer and owner reference by SHA-256.
Geometry and five motion studies were authored procedurally by Codex using
Blender's bpy API. The screenshot is an owner-supplied appearance reference;
it is not a licensed production texture or proof of third-party rights.
`front.png` is an actual Unity frame, not a concept illustration.

MCP for Blender 2.3.0 was also tested against the live Blender 4.5.16 GUI:
addon protocol 16 handshake, scene inspection, rig/frame selection and actual
front/side/back and animation viewport captures succeeded. This connection
allows iterative bpy edits and visual inspection. It does not itself create a
finished anime model. No external generator or asset library was enabled.
