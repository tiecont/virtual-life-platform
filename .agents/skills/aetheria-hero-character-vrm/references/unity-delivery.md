# Unity URP integration and technical acceptance

## Authoring/export

- Existing Icarus sources were authored in Blender 4.5 LTS; preserve that source history. Use Blender 5.3 for new retopology, weight transfer, accessory fitting, normalization and export, and record any explicit owner-approved source migration. Keep source in meters. Blender working Z-up, export FBX with `axis_forward='-Z'` and `axis_up='Y'`, preserve animation action naming, avoid accidental armature scaling. In Unity, measure character height 1.68m without halo/wings and root scale `(1,1,1)`; do not equate exporter checkboxes with verified import dimensions.
- Preserve edit-ready `.blend`; no dangling workstation-only texture links. Segment face/head, hair groups, layered cloth, feather wings, halo and bow. Provide `Weapon_Hand` socket, separate bow grip and arrow release references. Ensure 2 wing roots in upper back with fold, shoulder tests and collision clearance.
- Facial shapes: 5 distinct functional targets (neutral is a state, NOT a blendshape; choose `Blink_L`, `Blink_R`, `Smile`, `Frown`, `Shout` or equivalent actual names) and at least neutral pose. Report activation tests and deltas. Weighted normals on rigid props only where suitable; don't damage face/feather deformation shading.
- PBR source maps, exported runtime texture maps, channel pack (Albedo sRGB; Normal linear normal map; ORM masks linear; Emission mask linear where appropriate), transparency/double-sided feather choices. Bake from high-poly to retopo with seam and normal inspection. Report texel density and texture resolution. Runtime LOD budgets from the existing import contract.

## Icarus locked technical contract at reviewed main

| Property | LOD0 | LOD1 | LOD2 |
|---|---:|---:|---:|
| tris | 26,000–29,500 | 14,000–16,500 | 6,500–8,000 |
| weighted joints | exactly 74 | 48–56 | 28–34 |
| material slots (max) | 3 | 2 | 1 |
| texture max side | 2048 | 1024 | 512 |
| max skin influences | 4 | 4 | 4 |

Current `scripts/art/icarus-import-contract.mjs` expects **Generic**. Rig can use a human-like hierarchy, but Unity `Humanoid` is a different importer contract with Avatar retargeting requirements. A Humanoid migration requires independent tests and owner/CTO decision; do not switch just because a blueprint says 'Unity Humanoid'. All 16 named clips must be unique and deform geometry across 3 LODs.

Wing candidates produced separately are capped at 28,000 triangles at LOD0.
This is an upstream candidate ceiling, not a final assembly budget. Retopology
and baking must bring the full Icarus assembly back within its 26,000-29,500
LOD0 contract and must report wing-only and assembled counts separately.

## Exact Icarus action list

```
idle
world_walk_or_hover
world_follow
emote
summon
normal_sword_hit
rage_sword_100
signature_skill_windup
signature_skill_cast
ultimate_cut_in
ultimate_impact
damage_reaction
defend
status_affected
victory
defeat
```

Visuals are bow actions where appropriate; don't rename protocol keys to bow-suffixed names. Root motion disabled where gameplay authority owns location. No renamed duplicate animation curves. Rig check tests finger/hand and wing contact, pose cross-checks at intermediate frames.

## Unity work (actual Editor required)

1. Reuse `apps/unity-client` pinned Editor `6000.3.14f1` and URP `17.3.0`. Keep existing `.meta` and package references. Before adding VFX Graph, Recorder, Cinemachine, lilToon, spring-bone or cloth dependency, verify compatibility/license and installed package versions; pin additions in committed `Packages/manifest.json` and lock.
2. Reimport source FBX into isolated clean Unity project. Run the repository's `scripts/art/icarus-unity-audit.mjs`; read measured `IMPORT_CONTRACT_PASS` as **geometry/skin/clip evidence only**. Make an actual prefab, Animator controller, animation bindings, modular sockets and LODGroup in the maintained Unity project. Test re-import/reopen without auto-generated placeholders.
3. Author game shaders and lighting **in Unity URP**. Use Shader Graph / a compatible reviewed anime shader with real colored shadow bands, detailed face normals and restrained bloom. Validate mobile/Windows effects per target platform; avoid unsupported or purely decorative package assumptions.
4. Create server-event-bound FIRE_ZONE presentation: windup/bow charge → projectile trail → impact → 4×4 zone decal on the 10×10 board; maintain visible UI/target tiles. Use VFX Graph only if the target renderer/platform supports the intended effect; Particle System/Shader Graph can be a better constrained fallback. Camera choreography via installed Cinemachine or explicit Unity animation; recorded sample via installed Recorder or correct native capture.
5. Provide explicit **reduced-motion** implementation: no sweep/camera shake/large bloom flash, simplified particles but still clear impacted 4×4 zone and target warnings. Unit tests ensure ability never mutates authoritative board state.
6. Render actual moving body/wing/cloth pixels and validate encoded MP4/GIF or image sequence; cameras/particles moving alone cannot count as animation. Inspect representative frames and independent body-region differences. Readable neutral views with VFX off and on.
7. Report named GPU/CPU, device, resolution, mean/P95 frametime, memory, asset load time, shader hitches and player build details. Editor capture alone does not equal Windows qualification. Missing device ⇒ `PERFORMANCE_NOT_TESTED`.

## Commands (run only when dependencies installed)

```
pnpm plan:status
pnpm build:packages
node --import tsx scripts/pet-asset-check.mjs --limited-v31
node --import tsx scripts/pet-asset-check.mjs --limited-v31 path/to/actual-bindings.json --require-complete
UNITY_EDITOR=/absolute/path/to/Unity node scripts/art/icarus-unity-audit.mjs --model /absolute/path/to/icarus.fbx
node scripts/unity-validate.mjs tests
```

Do not claim an audit/Unity/editor command has been executed unless it actually ran, with exact source revision and resulting logs. An `exit 0` draft manifest may still contain missing artwork; read status and missing list. Production delivery includes editable Blender, LOD0/1/2 FBXs, named clips, PBR textures, Unity prefab/materials/shaders/Animator/VFX/Timeline if actually produced, previews off/on/reduced-motion, hashes/import facts, rights, scale and performance verdict. Keep `DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC` until separate approval.
