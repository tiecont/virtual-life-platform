# VirtualLife desktop-first roadmap — critical path and quality gates

Plan follows **evidence-gated order** rather than invented ship dates. Distinguish Windows playable alpha / closed beta / public official release. G0–G4 **desktop game**; G5 optional mobile/mac ports; G6 official launch; G7 only measured scale-out. Parallel development only for bounded files and stable interfaces.

| Stage | Goal | Must prove | Agent lanes |
|---|---|---|---|
| **G0 / Foundation audit** | review legacy archive + actual repo HEAD; accept ADR-003, hardware/test PC & rights | old verified ledgers untouched, one writer/domain, build/legal/device/resource capability signed | A0/A2/A5/A7 |
| **G1 / Rust+Unity boot** | Rust sim + receipts, pinned Unity project, network C# SDK, animated shader proof; Next official portal shell | real Rust→Unity roundtrip / proto fixtures, shader spike on target GPU, website no game-state authority | A1/A2/A3/A4/A5 |
| **G2 / Walkable Aurora District** | fully native city with 1 expressive anthro rig + AOI, camera, NPC activity, quality tiers, M-map | actual Windows player runs 10min scripted walk no severe stutter, animations pass clipping visual review, click-to-move server validated | A1/A4/A5/A7 |
| **G3 / Walk-in activities** | café+seat+card-table; M teleport; Pet Arena roam→PvE match-3; full event loop+reward | 2 users seat race, reconnect, private card hands, rewards single settlement; native client renders final state | A1/A2/A5/A6/A7 |
| **G4 / Closed beta Windows** | shaders polish, performance, accessibility, Windows package/patch path, security/chaos, web marketing complete | device matrix p95/p99, 30-60m soak, signed installer & rollback, human fun/art reviews, live auth/account switch, site download proof | A0/A2/A3/A4/A5/A7 |
| **G5 / Ports conditional** | macOS/Android/iOS or browser-lite feasibility | real Mac/phone hardware and tailored render/integration, owner re-prioritizes; failure does not block Windows | A0/A4/A5/A7 |
| **G6 / Official release** | production infra, release site/download, legal/account, canary and support | signed artifacts, CDN integrity, supported GPU drivers, incident and refund/support/privacy contacts, rollback drill, approval | A0/A2/A3/A5/A7 |
| **G7 / Live expansion** | add districts/venues/games and scale Rust ownership | load and product metrics demonstrate demand, epoch fencing and durable recovery prove safe scale-out | A1/A2/A4/A6/A7 |

## Critical path
`VL-001 → VL-002 → VL-077/078 → VL-080 → VL-082 + VL-012/081 + VL-025/026 → VL-085/086/084 → VL-087/095 → VL-089/090 + VL-091 → VL-096 → VL-099 → VL-102 → VL-070`. The website lane `VL-079→VL-083→VL-092→VL-098` runs alongside, not blocking G1/G2 but required for official publication.

## Vertical slice quality floor
One authored district (not infinite open world), two distinct avatars sharing rig, café with two tables, one playable card mode, one Pet Arena PvE enemy/pet, one teleport edge, 1 interactive NPC schedule, ambient client-only crowd. Camera movement and facial expressiveness get polish **before** adding more districts. Avoid gacha, creator economy, raids, large-scale crowds until real playtests.

## Team/time reality
High-polish 3D visuals require art/animation/technical art labor even with strong agents. First G2 production art and device benchmark may reveal that scope/time are infeasible; reduce **amount** of content (number of streets/Pets/outfits) before sacrificing gameplay correctness or frame consistency. Dates to be scheduled only after repo HEAD, team capacity and test hardware audit.
