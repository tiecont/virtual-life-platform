# Visual and interaction QA matrix

## Scene review checklist
| Scene | Must see | Negative cases |
|---|---|---|
| Aurora Plaza | clear spawn/paths, lively NPC/crowd/café sign, map HUD | no washed text, no overdraw stutter |
| Near avatar | expressive eyes, morphs/blinks/tail pose, fabric | ear/hat clipping, tail penetration, eyes uncanny |
| Café | table affordance, sit pose feet/hands aligned, reaction emote | conflicting seats, chair-slide animation |
| Card table | world remains visible but cards have high contrast/turn indicator | private hand exposed to spectators |
| Pet Arena | gems/skill VFX/3-Pet identity clear, boss tell | flashes during reduced motion, ghost damage |
| M-map | pins/POI preview/travel locked, readable at 100% & 200% | wrong focus, unknown destination, spoofed availability |
| Weather/evening | legible signs and shadows, calm ambience | bloom clipped, dark face, high GPU cost |

## QA deliverables
Capture annotated screenshots and 15–30s clips at actual browser/device including quality tiers; golden image baseline original approved art, not key-art generation as target shader; frame/timing telemetry accompanies reviews. Human art signoff required for final visual gate, tests alone insufficient.
