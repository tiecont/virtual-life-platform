# Anthro character system — modular, expressive, optimized

## Avatar design goals
Nhân vật thiên về **kemonomimi và anthro** (có tai/đuôi/face landmarks) stylized: giữ tỷ lệ dễ thương/trẻ trung, silhouette khác biệt nhưng tôn trọng body diversity và không phân biệt loài theo sức mạnh game. Hai profile visual: compact-cute và elegant-adventure, cùng skeleton/hitbox movement chuẩn để giữ compatibility.

## Base rig v1 & part schema
`species` → `baseBody`/head/muzzle/ears/tail/eyeShape/brow/cheekFur/markings/hair/outfit/accessory/colors; whitelist part-by-species/rig, attach sockets for hat, glasses, bag, hair, tail, ears, hands; collision capsule không thay đổi theo phụ kiện.

**Pilot**: 1 skeleton humanoid, 2 species variants (cat/fox), 1 accessory set, 1 outfit set. Later bunny/wolf/bird variants after performance/animation pilot; no automated per-species infinite cloth/eye solution.

## Facial system (recommendation)
- 12–18 curated facial channels for pilot: blink L/R, smile, mouth open, brow inner/outer up/down, eye happy, blush proxy, cheeks, look L/R, jaw/lip shapes; morph targets/blend shapes for web/native with expression presets.
- Emote semantic `wave`, `laugh`, `surprised`, `wink`, `shy`, `happy`, `sad`, `sigh`, `cheer`, `nod`, `sip`, `eat`, `sit`, `high-five`. Blend facial+body animation layer; look-at limited to local targets with privacy.
- Visemes for local preauthored speech/voice-only when safe later; no facial video capture required. Eye blink microanimation seeded local, tail and ears spring secondary with clipping constraints.
- World network sends **emote id, startServerTick, blend params (bounded)**, not 30 morph floats per frame per actor. For NPC local expression timeline, client seed.

## Movement
Walk, run, strafe/turn-in-place, stop, idle variants, obstacle align, foot IK on slopes, hand IK while holding coffee/card, sit/stand from authenticated seat/animation anchor, optional jump only where level permits. Root motion vs server reconciliation: server position authoritative; visual animator blends to target pose.

## LOD tiers proposed
- Near: face 12+ morph channels + near hair/ears/tail/IK; facial detail in close camera.
- Mid: simplified face/animation and tail bones, fewer material slots; no cloth simulation.
- Far: reduced bone count/impostor or static stylized proxy, emotes simplified.
- Mobile: max skin influences, triangle/material/texture budgets defined and profiled; avoid fur strand/groom simulation. Low spec accessibility must still show readable identity/interaction.

## Acceptance
Silhouette readable at phone distance; no ears through headgear/tail through chair during sit; closed-open mouth smooth; blink does not collapse meshes; head look constrained; 30min mobile thermal/animation CPU, web p95 frame time measured. All cosmetics compatible with consent, entitlement, equipment and account rollback from original plans.
