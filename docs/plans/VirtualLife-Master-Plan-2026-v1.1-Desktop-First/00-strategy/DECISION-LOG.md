# VirtualLife architectural decision log — proposed until owner signs

| ID | Proposed decision | Rationale | Evidence gate |
|---|---|---|---|
| D01 | App and logo name **VirtualLife** | one coherent recognizable brand | trademark/asset provenance review |
| D02 | Bright fantasy-campus city + modern anime anthropomorphic avatar | approachable, youthful, expressive social world | art bible/golden screenshots approved |
| D03 | Rust for every **new authoritative game/world sim** | correctness, isolation, replay, performance | G1 game loop+DB tests |
| D04 | NestJS platform control/async; legacy RoomAuthority unchanged until cutover | avoid conflicting owners and breaking verified history | G7 fencing cutover |
| D05 | Unity 6.3 LTS + URP Windows **primary client** | native GPU/animation pipeline while keeping cross-platform candidate | compiled Windows scene benchmark |
| D06 | Next.js as **official website**, no mandatory full-world web parity | fast discoverability/download/account and room for cinematic marketing | Web Vitals + download proof |
| D07 | One Blender source rig and shared content/proto contracts | cut art duplication across potential devices | source hash/rig golden tests |
| D08 | M map + POI previews + click-to-move + server 2-phase teleport | navigation is a game mechanic, not arbitrary coord hack | stuck/path/seat/reconnect tests |
| D09 | Café/maid café/card/game venues are walk-in and consentful SFW | embodied social participation | state machine + accessibility pass |
| D10 | Single modular Rust deploy at first (per-zone actor models) | simpler ops; scale after real load | tick/partition benchmark |
| D11 | PostgreSQL transactional receipts and outbox/inbox | correct rewards and replay on restarts | duplicate/crash/rollback suite |
| D12 | Pet Arena combines roam world + match-3 tactical battles | novel game mode anchored in city | PvE playtest and telemetry |
| D13 | Optional Tauri/Rust launcher, signed Windows installer baseline | release needs reliable patching; avoid premature complexity | release gate and honest cost review |
| D14 | Unity mobile/macOS ports only after Windows passes | avoid sharing poor performance and too much surface | real physical device/licensing checks |

D05/D06 **supersede** v1.0 web-first renderer path as product critical path, not historical N06 work acceptance.
