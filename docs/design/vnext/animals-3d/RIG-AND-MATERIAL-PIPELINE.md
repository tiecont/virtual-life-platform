# Shared animal rig, material and asset pipeline — design revision1

These are authored-production requirements, not existing meshes/catalog IDs or tests already run. Three-dimensional presentation keeps the existing server floor/seat/intent semantics and identity/entitlement ownership.

## Starter character scope

| Part | Planned visible alternatives | Compatibility/authoring rule |
|---|---|---|
| Species | cat,dog,rabbit | Shared humanoid posture/48bone ceiling, species-specific head/muzzle/ears/tail and groom; never a gameplay role or hidden Lodge alignment |
| Body/head | petite,classical,tall body; round/cheeked/slender head | Authored meshes or bounded morph targets with matched skin/UV/seams, cosmetic footprint only |
| Coat/markings | short/plush coat,solid/tabby/patch patterns,palette | Direction/length/masks separate from color; shared UV zones, no texture Cartesian explosion |
| Eyes/brows | rounded/almond contours,iris palette,expression | Cornea/iris depth and controlled highlight; blendshape lids must close without breaking groom or exposing sockets |
| Muzzle/nose/mouth | shortcat,longdog,softrabbit compatible variants | Species allowlist, jaw/whisker anchors and smooth visible transitions |
| Ears | pointed/rounded/foldedcat; upright/floppydog; tall/loprabbit | Head attachment normals/skin match; bounded ear chain and headwear exclusion/remap rules |
| Tail | species-appropriate curled/plush/short variants | Shared rear anchor, bounded chain; sit/serve curves avoid seat/outfit intersections |
| Tuft/hair | short forelock/swept tuft/none | Distinct grooming region, compatible ear/headwear masks; no arbitrary freeform mesh scaling |
| Outfit/accessories | casual/cafe-apron starter-compatible outfit,hats/glasses/bag | Existing server equip/ownership remains; skin weights/clipping masks/hat clearance authored, no preview entitlement grant |

The actual ID catalog/server schema is N06-07 work. All groups require real visible differences and a shared composer in creator/world/thumbnail. V1 profile palette/outfit remains immutable data during fallback; a supported3D default projection can render a legacy selection without persisting it as a new selection. Asset versions and renderer capability are separate from account identity and backend protocol.

## Rig and animation

Canonical root/hips/spine/chest/neck/head/jaw, paired upper/lower limbs/paws, ears and tail chains fit the budget with≤4weights per vertex. Species appendage options use named anchors and audited bind poses, not arbitrary asset URLs. Morphs must preserve attachment normals and operate within exported bounds. Camera-facing billboards are not a substitute for3D anatomy in final avatars.

Author idle/breath/blink,walk/turn,sit/stand and serve/retract. Runtime supports existing idle/walk/sit/serve states; additional blend clips are local presentation. Use in-place locomotion driven by server motionPosition/floor projection; root motion never changes authority. Validate feet against floor, paws against carried cup, hips against seat height, tail/ears against clothing and chair. Serve occurs only on confirmed outcome, not a client-invented reward/action. Transition durations are visual and cannot extend server deadline or delay safety/leave.

Minimum review matrix: all3species×idle/walk/sit/serve×4cardinal game views plus continuous creator orbit; body extremes, tallest ears/headwear, thickest tail/seated, apron/serve,paw/cup and account/travel/reconnect. Test pairwise catalog coverage and explicitly listed extreme combinations; do not pre-render the full Cartesian product. Mark missing assets/poses as missing, not PASS.

## Materials and fur

Author base-color/masks in sRGB and normal/roughness/direction data in linear space. Coat has root-to-tip tint/length/direction and groom-clump breakup. Use groom cards/cutout and anisotropic response at close range, reduced cards/normal detail at distance. Compare alpha-test/coverage and alternative shell/fins overdraw in the actual target, including both camera sides, background contrast,motion/shimmer and shadows. No unbounded particle/strand simulation baseline. Do not render identical soft plastic on fur,cloth,wood and eyes.

Gameplay LOD1/2 preserves face/species silhouette and coat pattern; close-up LOD0 preserves groom direction and strand silhouette. Explicitly report what was reduced and keep the same saved appearance. A low tier is a3D visual-quality tier, not a secret pixel fallback or deleted cosmetic. KTX2/mesh compression is a candidate until actual export/decoder/GL capability tests; bundle vetted decoders locally with hashes and CSP, never fetch remote code from appearance inputs.

Environment uses authored warm wood/cloth/plants/windows and coherent scale/lighting. Begin with baked indirect/ambient/contact shading plus one bounded shadow light; mobile avoids unconditional high-cost screen-space effects. Raised3/4 game camera makes floor/seat/task targets clear. Close-up creator can use a separate light rig/camera while sharing model/material version. Reduced motion keeps a clear settled pose and disables decorative camera/breath/sway effects as appropriate.

## Authoring/export and ownership

Original source mesh/groom/UV/weights/animation must have author/tool/revision/provenance. Blender authoring/export is a candidate workflow; Blender is absent at this audit, so no `.blend`,GLB or groom export exists yet. Do not claim installed tooling or assign third-party licenses. Generated raster concept has its own provenance and cannot supply skinning/groom/rig assets.

Export glTF2/GLB with validated transforms,units,axes,named bones,anchors,bounds,animation ranges,texture color spaces and material mapping. Store model/material/rig/catalog/content revisions,raw/export hashes and authored rights/review status. A technical importer rejects unsupported extensions,unbounded counts/texture sizes,external URLs and missing critical nodes before allocating expensive GPU resources. Dynamic free user uploads are outside this scope.

Renderer startup/abort/context-loss/dispose/cache lifecycle has explicit reference accounting for geometry,materials,textures,image bitmaps,decoders,shadow/render targets and animation mixers. Suspend stops animation/render work without granting membership; identity/epoch changes drop prior projections. Release old renderer resources before loading a fallback or new world, keeping transient overlap inside the total texture budget. No in-renderer credential storage or authority decisions.

## Quality gate and honest limits

Compare runtime close-up/game camera to the concept using anatomy/silhouette,groom,seams/LOD shimmer,eyes/PBR,lighting,foot/paw/seat anchors,animation transitions and HUD readability. Save screenshots/video with source/asset/GPU/quality tier and the actual issues. No automated screenshot count can prove owner thinks the art is beautiful.

N06-11 proves the bounded interactive technical slice and real resource/performance measurements; temporary geometry is labeled and never closes final art gate. N06-07 handles authoritative Save/cancel/retry/entitlement/N−1 projection. N06-04 delivers complete polished Deadline/Maid; N06-09 final3D visuals and device budgets; N06-05 target users. Missing Mac/Xcode/iPhone stays N14 conditional. Failure does not permit changing old budgets,granting assets or rewriting ledger evidence.
