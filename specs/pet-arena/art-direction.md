# Pet Arena Battle Art Contract

Candidate art direction for VL-121, read with [v2.md](v2.md) and the
[114-species catalog](catalog.md). All art remains MISSING and DRAFT_ONLY.
These briefs specify work to author; they are not rendered previews, production
assets, rights clearance or measured performance. The sole backlog remains
`config/development-plan.json`.

## Shared Visual Language

Sculpted storybook creatures with convincing joints, broad readable planes,
hand-authored material breakup and restrained luminous accents. Preserve each
catalog silhouette at portrait, board-side and distant camera scales. Avoid
existing franchise character proportions, costumes, markings and signature poses.
Use anatomy, habitat and role to differentiate species rather than recoloring one
base mesh. Evolution at levels 30/60 retains identity and does not imply new stats.

Use a three-value silhouette test before detail: dark body mass, mid-value surface,
small bright focal feature. Element is conveyed by shape, texture, motion and a
symbol as well as color. Rarity adds craftsmanship and presentation detail, not
an automatic damage modifier. Keep eyes and anticipation readable against the map.

| Element | Body / Surface / Accent | Shape And Material | Motion And Impact |
| --- | --- | --- | --- |
| Normal | `#78665A` / `#D3D9D5` / `#E7B86F` | Soft overlapping pouches, woven fur, asymmetric crests | Weight shifts, short elastic steps, dust scuffs |
| Fire | `#6C253B` / `#E46542` / `#FFD482` | Kiln ceramic, singed silk, ember seams | Breathing embers, folded-flame anticipation, crisp sparks |
| Water | `#155D72` / `#74C6BF` / `#F2DCC0` | Fan membranes, wet enamel, translucent edges | Fin ripples, fluid compression, clean splash ribbons |
| Grass | `#315943` / `#A6BC6C` / `#E5A7A0` | Veined leaf plates, seed joints, velvet moss | Unfurling arcs, spring tension, sparse petal impacts |
| Electric | `#3C4948` / `#E0C246` / `#75E1DB` | Coil crests, conductive whiskers, lacquered shell | Staccato charge, branching strokes, brief contact flash |
| Ice | `#456B87` / `#C0E5E6` / `#D39DBF` | Frosted facets, felt underlayers, curved icicles | Measured skating, brittle shards, cold mist near feet |
| Fighting | `#8B3E4F` / `#D1B494` / `#B4D0BB` | Braced limbs, wrapped tendons, worn stone cuffs | Clear footwork, compression, directional impact lines |
| Poison | `#623F73` / `#A1BE68` / `#E99EAE` | Porous caps, droplet sacs, iridescent skin | Slow pressure swell, readable droplet bursts, low haze |
| Ground | `#79544A` / `#C99A64` / `#7AC3AD` | Terrace plates, sediment bands, chalk-lined joints | Settling weight, stepped earth displacement, grit |
| Flying | `#607A83` / `#D9E4DC` / `#D79A72` | Lace membranes, reed spars, sculpted feather planes | Lift and glide, long wind ribbons, sharp downstroke |
| Psychic | `#69507A` / `#C29DAC` / `#96D6C8` | Mirrored seeds, nested arches, satin surfaces | Controlled orbit, delayed echo silhouettes, focused pulses |
| Bug | `#536346` / `#C29B48` / `#92BCC4` | Segmented wax armor, silk knots, amber insets | Articulated scuttle, wing tremor, silk tension releases |
| Rock | `#56585C` / `#A5A1AA` / `#DBA171` | Basalt strata, chisel edges, mineral grains | Heavy pivot, cracked-ground accents, contained fragments |
| Ghost | `#42535E` / `#A6BDB8` / `#D6AE6E` | Bell shells, folded shrouds, negative-space limbs | Suspended drift, trailing cloth, quiet echo rings |
| Dragon | `#4A6870` / `#AF766E` / `#D9CF8B` | Glass ridges, interlocking scales, flexible spines | Whole-body coils, crest opening, sweeping force |
| Dark | `#353A42` / `#897A94` / `#D9A599` | Ink mane layers, matte hide, pale edge markings | Grounded stalking, flowing mane, directional shadow cuts |
| Steel | `#526B6A` / `#BFC7BD` / `#CC8269` | Riveted plates, brushed metal, ceramic bearings | Mechanical follow-through, brief glints, contact sparks |
| Fairy | `#816375` / `#E4BFC9` / `#B1D8AB` | Bell petals, woven ribbons, glazed seed pearls | Buoyant arcs, chiming rings, petal-like splinters |
| Light | `#708B83` / `#E6E2BF` / `#DC9F76` | Split prism arches, pearly facets, opaque cores | Refracted fans, deliberate alignment, bounded rays |

Dark and Ghost must remain readable in their own maps. Light is a material and
shape language, not a fully white emissive body. Element VFX never covers legal
swaps, health values, enemy warnings or the selected target.

## First Seven Authored Briefs

These briefs retain the species, forms and shared loadouts in catalog-v2.json.
They introduce no Pet-specific gameplay code.

| Species / Form | Model And Portrait Brief | Animation Signature |
| --- | --- | --- |
| Emberloom / emberloom-base | Woven-wing mothlike spirit; two curved silk wings frame an ember seed body. Ceramic feet and visible wing seams distinguish it from a flat flame icon. Portrait emphasizes the folded wing face frame. | Idle wings breathe asymmetrically; normal snaps one wing forward; rage opens both into a folded flame fan. Healing unfolds warm thread rings toward the resolved target. |
| Ripplefin / ripplefin-base | Compact swimmer with a broad translucent fan tail, opaque pearl core and flexible side fins. Show internal silhouette through membranes without making the whole body transparent. | Idle uses a figure-eight hover; normal compresses then sweeps its tail; rage spreads the fan before a single breaking wave. Healing uses short outward ripples. |
| Terracrest / terracrest-base | Low earth guardian with stepped terrace plates and a tall offset crest, chalk grooves and small exposed joints. Its silhouette reads as layered land rather than a stone cube. | Idle settles small plates; normal drives the crest forward; rage aligns terrace plates into a rising wall. Channel gathers narrow sediment ribbons at the crest. |
| Cloudlace / cloudlace-base | Lace-wing drifter on reed-like spars; substantial central body, ragged membrane cutouts and a long counterbalancing tail. Portrait keeps the eye visible through the wing frame. | Idle makes slow lift corrections; normal cuts a tight wing arc; rage contracts then expands its full wingspan. Disruption sends sparse hooked wind threads. |
| Umbramane / umbramane-base | Four-legged guardian with a layered ink mane, short sturdy paws and pale side markings. Matte hide and separate mane clumps retain a clear body outline. | Idle uses grounded weight shifts; normal commits a shoulder rush; rage lifts the mane in a controlled forward sweep. Siphon has a visible source-to-target direction. |
| Prismhalo / prismhalo-base | Climbing creature with split prism halo branches, articulated gripping limbs and a pearly opaque torso. Halo gaps remain visible at board-side scale. | Idle tests its grip; normal traces one halo edge; rage aligns separated branches into a refracted fan. Channel brightens only the narrow inner facets. |
| Dawnarchon / dawnarchon-base | Large crystalline sentinel framed by a broken dawn arch, with a grounded central body and offset supporting limbs. Boss scale comes from readable mass, not screen-filling particles. | Summon locks arch segments into place; normal drives one segment; rage opens the full arch then resolves one bounded ray. Guard closes the segments into a readable shield. |

For each: deliver editable sculpt/paint sources, front/side/back orthographic views,
neutral-lit turntable, 1024 portrait, 256 battle icon, rig, two candidate LODs and
the full animation set. Candidate triangle budgets are 18k hero / 28k boss at LOD0
and 8k / 12k at LOD1; validate appearance and actual cost before acceptance.
Model imports use meters, Y-up in Unity, a grounded root and a documented forward
axis. No root motion writes the canonical character position.

## Animation And Event Contract

Required semantics are `idle`, `summon`, `normal`, `rage`, `skill`, `combo`, `hurt`,
`defend`, `status`, `defeat`, `victory`. Idle includes breathing. Each semantic has
clip, VFX and audio references, explicitly null until authored. Normal and rage
use distinct clips. Shared rig families may reuse clips only where contact,
silhouette and retargeting have been checked. Facial and appendage motion belongs
to presentation. No clip, Animator callback or particle changes battle state.

Future v2 authoritative events supply stable match/event IDs, actor/target IDs,
action kind, resolved resources/status and a generic visual cue. Unity deduplicates
event IDs, applies the authoritative snapshot immediately and schedules bounded
presentation. Reconnect reconstructs the current pose; it never reissues gameplay
commands to replay a cinematic. Skill/card definitions choose reviewed cues.
These are requirements for VL-116/VL-122, not claims of emitted v2 events today.

Normal attacks target 0.45-0.8 seconds, rage 0.8-1.3 seconds and skills 0.6-1.2
seconds; long finishers are optional and skippable. Reduced motion disables camera
shake, large zooms and strobing; it keeps target, impact and status feedback.
Accelerated/disabled VFX must preserve authoritative outcomes and input deadlines.
Presentation timing is not a reducer input.

## Tile Atlas And Import Pipeline

Author original Sword, Mana, Rage, Heart, Shield and Special symbols, each with a
distinct silhouette and luminance. Start with 128px source tiles, 8px transparent
padding and separate selected/matched/falling/warning/disabled/triggered treatments.
Use one reviewed sprite atlas; validate filtering, packing bleed, alpha edges and
readability at 720p and 1080p. Color alone must not identify a tile.

`PetBattleVisualDraftSchema` defines versioned content-hash bindings, source
provenance, runtime hashes and separately hashed import settings. Every actual
asset must reference its editable source. All rights remain PENDING_REVIEW; the
schema cannot grant rights or publish a Pet. Prefabs/controllers/materials/VFX/audio
and localization use bounded typed IDs, not executable effect definitions.

Run `node --import tsx scripts/pet-asset-check.mjs [draft-manifest.json]` after
building packages. Without a manifest it reports missing assets for the six
priority heroes and boss. With a manifest it checks schema, catalog forms and
actual source/runtime/import-file hashes, rejecting missing/changed files and
paths escaping the workspace. Exit 0 means a valid draft preflight, not production
readiness. Missing bindings remain explicit in the result. Unity import semantics,
rig correctness and rendered quality require the separate Editor/player gate.

The next pipeline stages import immutable reviewed exports into the existing
Unity project, validate GUID/controller/clip/shader bindings, produce real Linux
turntable and combat previews and measure CPU/GPU frame time, memory, loading and
shader hitches on the hardware profile in v2.md. Keep evidence in ignored
artifacts/. Physical Windows URP/IL2CPP, production art review and asset rights
remain separate qualifications. No approved asset store or production publication
is provisioned by this draft contract.
