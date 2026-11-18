# Icarus White/Gold Study

Editable Blender source and a rigged GLB for the owner-supplied Icarus visual
target. The imported FBX and study shader are under
`apps/unity-client/Assets/VirtualLife/ArtStudies/Icarus/`. This folder is not a
runtime content import or a completed Limited character.

The study replaces the initial crimson costume with pink hair, white/gold dress,
shaped face and eyes, layered feather wings and a recurve bow. Back and side
details absent from the reference are proposals. It still needs more refined
anatomy, hair, clothing, feather detail and art review to approach the reference.

Revision 06 reshapes hair into unequal curved clumps with thin turned edges,
asymmetric bangs and swept locks. It shortens the visible neck, narrows the jaw,
reduces the iris/pupil size and adds nose/cheek color. Feather vanes curve
consistently on both wings and use white shafts. Five wider folded trains replace
the straight costume tapes. Unity uses three light bands and soft facial shading.
These changes improve the study but do not meet the supplied illustration's
finish and likeness. The face remains generic, hair reads as thick strips,
feather roots look tubular and the dress lacks the reference's soft draping.

Visual status: `ARTIST_HANDOFF_REQUIRED`, `SINGLE_AGENT_SELF_REVIEW`.
The style target remains `UNVALIDATED_TARGET`. Two meaningful visual repair
passes were inspected this run; the remaining focal construction/sculpt/painting
gap warrants an artist handoff rather than more procedural decoration. No artist
was contacted and no external generation or spending was used.

The preview explicitly bakes every sampled animation pose before URP rendering.
The previous synchronous skinned-render path could display a stale pose even
when vertex deformation checks passed. This revision replaces that footage;
frame checks now inspect nonblank content and framing throughout each clip.

## Rebuild And Inspect

Use the pinned Blender 4.5 LTS and the existing licensed Unity 6000.3.14f1.
Pass a new output directory for each run; source files are not overwritten.

```sh
blender --background --python-exit-code 1 --python scripts/art/build-icarus-blockout.py -- --output artifacts/icarus-study-new --reference specs/pet-arena/references/icarus/owner-battle-reference.png
node scripts/unity-native-prepare.mjs
```

After reviewing and copying the exported FBX to the maintained Unity study path:

```sh
VL_ICARUS_RENDER_OUTPUT="$PWD/artifacts/icarus-render-new" VL_ICARUS_PACKAGE_OUTPUT="$PWD/artifacts/Icarus-Review-new.unitypackage" "$UNITY_EDITOR" -batchmode -projectPath "$PWD/apps/unity-client" -logFile "$PWD/artifacts/icarus-render-new.log" -executeMethod VirtualLife.Editor.IcarusStudyRender.Render -quit
python3 scripts/art/verify-study-preview.py artifacts/icarus-render-new
ffmpeg -framerate 20 -i artifacts/icarus-render-new/frame-%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart artifacts/icarus-render-new/icarus-study.mp4
node --import tsx scripts/pet-asset-check.mjs --limited-v31 assets/characters/icarus/white-gold-study/bindings.json
```

The renderer needs an actual graphics device; do not add `-nographics`.
It checks imported mesh/bone/material budgets and actual vertex displacement for
all five clips. The 49-second video contains idle8s, intro15s, normal4s, rage6s
and signature10s at authored speed with a fixed camera, then a 6-second neutral
turntable. Frame checks inspect body motion separately from the moving-camera
segment. This is Editor URP rendering,
not standalone-player performance qualification or Timeline/Cinemachine work.

Exact source/import triangle counts are recorded in the import settings and
the VL-149 task: 29,392 source and 29,016 Unity-imported triangles. Both stay in
the current LOD0 budget. The armature has 74 bones and uses
three vertex-color materials. UVs are preliminary and overlap; there is no
production unwrap or baked 2K albedo/normal/ORM/emissive set. Five authoring clips
do not constitute all16 canonical gameplay action bindings. The draft manifest
intentionally reports missing canonical clip/VFX/audio/prefab/controller/portrait and
reduced-motion bindings. `--require-complete` must fail until those exist.

No FIRE_ZONE graph, sound design, reduced-motion acceptance, measured frame-time
budget, rights approval, source merge or publication is implied by these files.
OFFLINE_ONLY / NO_GO_PUBLIC. Logs and generated inspection facts stay in ignored
`artifacts/`.

## Unity Review Assets

`ArtStudies/Icarus/Review/` contains an actual saved prefab, three vertex-color
materials and an Animator controller. The `Action` integer selects idle0,
intro1, normal2, rage3 or signature4. Root motion is off. The package exporter
includes the FBX, shader, material and animation dependencies. Import the package
into a Unity 6000.3.14f1 project with URP 17.3.0; assign a URP pipeline in the
destination project. There is no runtime scene registration or gameplay script.

These review assets appear in `bindings.json` for byte provenance but are not
bound to the canonical character prefab/controller/material slots: they lack
the full production shader/texture and sixteen-action contract. The draft's
55 missing canonical bindings remain explicit.

## Provenance And Live Editing

`bindings.json` binds exact bytes of the maintained Blender source, GLB, FBX,
Unity MP4, review assets and import settings. The import settings pin the
generator, geometry helper, Unity renderer/package helper, shader, Unity metadata,
neutral views and owner reference by SHA-256.
Geometry and five motion studies were authored procedurally by Codex using
Blender's bpy API. The screenshot is an owner-supplied appearance reference;
it is not a licensed production texture or proof of third-party rights.
`front.png` is an actual Unity frame, not a concept illustration.
`portrait-detail.png` and `signature.png` are additional Unity inspection
renders; `side.png` and `back.png` expose the proposed hidden views. They do not
fill canonical portrait/clip bindings. The signature study
now raises both arms using the bone's transformed world axis, rather than
twisting them around their length.

MCP for Blender 2.3.0 was also tested against the live Blender 4.5.16 GUI:
addon protocol 16 handshake, scene inspection, rig/frame selection and actual
front/side/back and animation viewport captures succeeded. This connection
allows iterative bpy edits and visual inspection. It does not itself create a
finished anime model. No external generator or asset library was enabled.
