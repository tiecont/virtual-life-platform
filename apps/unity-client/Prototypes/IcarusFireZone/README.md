# Icarus FIRE_ZONE URP preview

VL-171 / VL-105. DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC.

## Open the preview

From the repository root, stage a standalone project and open the printed path
with Unity 6000.3.14f1. The stage copies the white/gold review prefab, controller,
FBX, materials, URP 17.3.0 assets and their existing `.meta` files. It adds the
built-in Particle System module to the staged project only.

```sh
node apps/unity-client/Prototypes/IcarusFireZone/prepare.mjs
```

Select **Aetheria → Icarus → Create Preview Scene** and enter Play mode. Test
Summon, Normal, Rage and Signature in Normal and Reduced. Next recorded snapshot
plays back the second active turn and then the expiry snapshot. Restart fixture
replays from turn 40. Off freezes the study pose and clears cosmetic effects.
The persistent 16-cell outline and the enemy warning stay visible in all modes.

| Layer | Presentation |
| --- | --- |
| Charge | URP procedural solar ring. Summon expands it below the model. Bow cues charge near the study's right hand. |
| Trail | `TrailRenderer` with an alpha-feathered URP strip follows a cue-specific arc for Normal, Rage and Signature. Reduced omits the trail. |
| Impact | Solar ring and billboard embers with cue-specific size, color and particle count. Reduced uses a stationary ring and four low-speed embers. |
| Marker | Static per-cell perimeter mesh with its own material. The fixture shows rows 4–7 and columns 3–6, zero-based, in turns 40 and 41. |

The review Animator maps Summon to `intro`, with the other three cues using the
existing same-named actions. `hand.R` is the review rig's grip proxy. Production
socket alignment, full animation timing and deformation clearance remain separate.

## Authority integration

`FireZoneProjection.Apply` consumes an already validated, complete presentation
snapshot for one match. Pass the authoritative revision, turn and optional zone
payload after the normal receipt and scope checks. Feed the server's anchor and
first active turn into `FireZone`. A snapshot with no zone clears the marker.
Out-of-order revisions and regressed turns leave the current marker intact.
Use a new projection when switching match scope. Time, cue playback and motion
preferences never advance the turn. The local fixture is the sole input in this
preview. The existing public contract and native client own any future live
transport mapping for `pet-v3-fire-icarus` / `FIRE_ZONE`.

## Verification

Use the printed staging path for `$PROJECT` and the installed pinned Editor for
`$UNITY_EDITOR`. The verifier loads the existing assets and checks the pipeline,
shader import, renderer material bindings, board size and marker lifetime in
all three modes. Inspect the Game view for animated effects and board readability
on a graphics-enabled Editor.

```sh
"$UNITY_EDITOR" -batchmode -nographics -projectPath "$PROJECT" \
  -executeMethod Aetheria.IcarusPrototype.PreviewScene.Verify -quit \
  -logFile "$PROJECT/verify.log"
```

`Verification/ProjectionChecks.cs` is a standalone console regression. Compile
it with `Assets/Prototype/FireZoneProjection.cs` under a C# 9 or later compiler.

Reuse the maintained isolated FBX audit for candidate rig and animation checks.
It measures bone weights, binding paths and sampled skinned displacement for
each canonical action at each LOD. The historical review FBX carries five study
clips, so it cannot fulfill the sixteen-action and three-LOD candidate contract.
Point the audit at a candidate FBX with its existing `.meta` beside it.

```sh
UNITY_EDITOR="$UNITY_EDITOR" \
  node scripts/art/icarus-unity-audit.mjs --model /absolute/path/to/candidate.fbx
```
