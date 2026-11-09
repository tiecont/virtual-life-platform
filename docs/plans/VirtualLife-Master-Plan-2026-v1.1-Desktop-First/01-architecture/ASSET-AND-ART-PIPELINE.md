# Unified asset and art pipeline v1.1 — native first

**Source-of-truth** Blender `.blend`, approved licensed textures/animations, rig v1, morph targets/pose names, seat/hand IK anchors, content IDs and release provenance. Every asset has owner/licensing info.

**Windows Unity primary:** import into FBX/Unity rig, URP face/hair/eyes material set, Blender scale/axis validated, compressed textures appropriate for Windows profile, Addressables per district/venue/cosmetics/Pet/FX, content hash/CDN. Use GPU skinning/LOD, SRP Batcher, variants and occlusion/streaming tested on actual compiled build.

**Web official:** only approved photography/screenshots/trailer/WebP/AVIF responsive art and text; optional glTF/GLB lite preview as a separate user-valued feature, not automatic download of whole Unity city scene. **Mobile future:** ASTC and thermal-budgeted URP variants, not a direct desktop asset copy.

**Visual QA:** 1m/6m/20m expressions, no clipping ears/headgear/tail/chair, café hand IK/card visibility, sunlight/sunset/night/rain, palette, accessibility contrast, profile quality transitions, loading hitch/VRAM. Key-art from existing ZIP is reference concept, not a production rendering/texture license.

See `CONTENT-SHIPPING-AND-STREAMING.md` and `UNITY-URP-RENDERING.md`.
