# Native content streaming, districts, memory and art pipeline

## Authoring and shipping
`Blender source + texture/rig license/provenance` → versioned `avatar-rig-v1`/metric scale/sockets → Unity FBX/mesh/animation imports → approved URP materials/look-dev → Addressables per District/Interior/Avatar/Cosmetics/VFX → CDN immutable hashed remote bundles. Web only receives separate thumbnails / compressed video / light glTF previews when required.

## Districts
- Keep Aurora Plaza compact; blockout walking paths/traffic/café entrances with *occlusion-friendly* geometry. City divided into addressable district cells; prefetch by camera/route/destination and unload distant content with memory watermark.
- Enter café: prefetch interior before door trigger, Rust seat/venue authority stays consistent during transition; preserve on-screen friend/chat and location continuity even if render scene changes.
- Pet District and Pet Arena battle stage can load as activity visual overlays while keeping Rust authoritative activity state; no need full open world cell always resident during intense battle.

## Avatar LOD
Near facial blendshapes/IK/tail-ear animation; mid simplified rig and facial expression presets; far billboard/impostor + basic movement. Headgear, tail and outfits share collision/seat clearance rules; materials batch by shared atlas/variants; high quality close-ups can use selected GPU costs as single-actor hero budget, not every crowd avatar.

## Content integrity
Bundle catalog version, content hashes and signed release manifest; authoritative server validates catalog IDs/entitlements and never trusts client-reported item stats. Automatic screenshot comparisons in noon/sunset/indoor/night. Material variants built in CI on target OS, only necessary shader keywords shipped. Crash safe abort if catalog mismatch.

## Art production checklist
Model: silhouette/body diversity, level footprint, texture limits; rig: animation names/sockets, 12–18 face expression channels, eye highlights, ear/tail physics thresholds; scene: probe/light bake day/night, occlusion, LOD, foliage wind; UI: readable high-contrast card hands/map, low-motion profile. License and provenance attached to each asset, not only folder-level notes.
