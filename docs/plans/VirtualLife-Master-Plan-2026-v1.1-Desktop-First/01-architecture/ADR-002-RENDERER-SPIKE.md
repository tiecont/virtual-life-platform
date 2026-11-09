# ADR-002 — Renderer feasibility benchmark (desktop-first revision)

**Original web renderer comparison is no longer a blocker for VirtualLife Windows native.** Preserve existing N06 Three.js evidence, but treat browser 3D as optional teaser/compatibility, not equal-quality open world.

## Primary spike Unity URP vs alternatives
Same **art source**: 1 city block noon/dusk, 1 cat/fox rig with 12+ facial targets, 20 visible agents of mixed LOD, 1 café table and pet VFX. Compile Windows x64 Release player in pinned Unity 6.3 LTS URP; compare shader quality and measured CPU/GPU p95/p99, VRAM, CPU main thread, hitches, content load and art review. Track Low/Balanced/Ultra profiles. Unity HDRP/Unreal 5 **only** if data shows URP cannot reach accepted quality within available budget, and comparisons use the same scene/artist input.

## Web optional teaser decision
If product needs a web interactive map/avatar preview, benchmark existing Three.js scene with glTF/GLB lite LOD on target browsers against simple poster/video marketing. Keep only if load, GPU and maintenance are worth it. Never perform a full Babylon rewrite without a specific product need. No source race with active N06-04 owner.

## Output
Approved render profile source + decision report with actual device JSON, Unity graphics settings, shader variant logs, screenshots/golden hashes, simple fallback options. Check `PERFORMANCE-GO-NOGO.md`.
