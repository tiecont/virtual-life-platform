# Character, architecture, animation and cinematography art bible

## City
- A sunny school-town with elegant white stone, turquoise/mint rooftops, soft lilac signage, bakeries, Sakura blossom pockets, fountain sparkle, grass and wind-reactive flags. Foreground movement (pedestrians + cafés), middle ground (bridges/trams), background (academy ridge/sky airship) create perceived city life.
- Shapes readable and paths navigable; one purposeful architectural motif (rounded arch+star window), no visual noise. Global illumination feeling via baked/real-time light blend, shadow quality tiers, reflection probes, color grading gentle.
- Time-of-day dynamic crossfade where suitable, but low-end should not spend runtime cycles on high-end GI. Avoid photoreal/surreal fur mismatching anime materials.

## Avatar
- Cute-to-elegant anthro silhouette; ears and tail respond to emotion, eyes catchlights, spring motion, blink, shoulders and hand expression. Skin/fur materials match world lighting; groomed strands reserved for close-up/premium; efficient planes and normals for mid/low.
- Facial acceptance close-up at 1m, mid at 6m, far at 20m; ear/hat collision clearance, tail-chair gap; a little over-animated secondary motion at hero scenes, restrained during chat/board readability.
- Color-coded cosmetics not tied to species combat power. Outfit modular clipping checks per rig; no unreviewed exposure in SFW public spaces.

## Game scenes
- Café uses warm honey ambient, polished counter and small hand interactions, moving shadows on floor; seat animation with IK, camera composition sees face+table.
- Card lounge uses crisp table mats, high readable contrast, spectator silhouettes, hands private to owner, close card camera with world retained in background; overlays can reduce 3D scene update to save GPU.
- Pet Arena uses solar azure/iris VFX and cinematic attack camera short duration, clear tactical gems, boss telegraph UI, no seizure-inducing flashes. Disable optional postprocessing on low tier.

## Content pipeline
Blender source layered collection, custom identity-only emote rigs, versioned export, shaders authored for glTF/PBR and Unity URP separately, visual golden screenshots and material parity. Scanned asset restrictions as in `01-architecture/ASSET-AND-ART-PIPELINE.md`. Key art is a concept goal, not proof that runtime can render it.
