# Provenance — supplied plans and official technology documentation

## User-supplied archive, read-only inputs
- Input: `/mnt/data/Archive.tar.gz` as provided to ChatGPT on 2026-11-09; 234 tar entries, 3 plan groups. Local file path is provenance for this session, **not** guaranteed path after ZIP is downloaded.
- `platform-vnext/state/task-state.json` — 77 tasks; 44 verified, 1 IN_PROGRESS N06-04, 2 BLOCKED_EXTERNAL, 12 deferred, 18 TODO. Legacy verified count is from archive, not independently inspected production source.
- `LANTERN-LODGE-PHASE-2/state/task-state.json` — 25 tasks, N15-01..04 VERIFIED.
- `vlp-pet-arena-plan-v0.1/execution/state.json` — 20 PA tasks, all TODO.
- `DEVELOPMENT-ROADMAP.md` — owner priority web N06-04/09, Pet S1 PA-017, Lodge N16, Pet S2, native deferred.
- `platform-vnext/architecture/00-PLATFORM-ARCHITECTURE.md` — current modular monolith, Nest RoomAuthority, Next React/Pixi/Three and Web-first decisions; states decision for current 2D/social room and new ADR required for continuous 3D.
- `platform-vnext/REVISION-2.4-WEB-FIRST.md` — explicit deferred native scope.
- `LANTERN-LODGE-PHASE-2/architecture/06-LANTERN-LODGE-GAME-ARCHITECTURE.md` — games/session and privacy requirements.
- `vlp-pet-arena-plan-v0.1/02_architecture/module_and_integrations.md` — previous Pet Arena approach.
- Previous assistant architecture review v0.1 reused as an input idea, not an authorized implementation.

**No source repository checkout was audited in producing this ZIP.** Agents must check HEAD, worktrees and current N06 progress. Do not claim new code/bench tests are already done.

## External sources checked 2026-11-09
- Unity 6 release support (6.3 LTS timeline): https://unity.com/releases/unity-6/support
- Unity Web technical limitations (threading/network/cache) current manual: https://docs.unity.com/en-us/engine/6000.7/manual/platform-specific/webgl/intro/technical-overview
- Unity mobile optimization and platform guidance: https://connect-mediagw.unity.com/collection/ship-your-first-mobile-game
- Babylon engine specs: https://www.babylonjs.com/specifications/
- Babylon WebGPU details: https://doc.babylonjs.com/setup/support/webGPU/
- Rust tonic: https://docs.rs/tonic/latest/tonic/
- Tokio task scheduling: https://docs.rs/tokio/latest/tokio/task/
- Khronos glTF registry: https://registry.khronos.org/glTF/
- Khronos KTX registry: https://registry.khronos.org/KTX/
- Apple ARKit blendShapes (a reference for morph-channel naming, **NOT** a requirement to process face data): https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapes
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Socket.IO delivery guarantee background: https://socket.io/docs/v4/delivery-guarantees/

## Art provenance
- `07-visuals/VirtualLife-key-art-concept.webp` originated as a new AI-generated original scene in the current conversation, composed to illustrate product direction; not a copy of any known copyrighted game image. It is a **concept reference**, not a licensed/human-approved 3D production asset or game screenshot.
- `07-visuals/VirtualLife-logo.svg` is a new simple vector design authored as a proposal; text `VirtualLife` and portal/animal-ear/star motif. Register and check trademarks/domains before commercial publication.
- `07-visuals/VirtualLife-city-map.svg` is a new schematic diagram, not a real navigation/collision map. `VirtualLife-ui-prototype.html` references both assets locally and has **no** live backend.

- `99-legacy-readonly/Archive-original-plans-2026-11-09.tar.gz` is an exact byte copy of the user-supplied original plans, SHA256 c78e2a901380ac5b04ce41ea1f87f0cdafe4bb6a659a7ff95ab89e88fda346e2; it is context only, never an executable migration.

## v1.1 desktop-first sources and design provenance
This v1.1 package was derived by copying the actual v1.0 package present in `/mnt/data/VirtualLife-Master-Plan-2026-v1.0`, then **rewriting the new VL planning overlay only** (old N/PA/Lodge ledgers were never opened for writing). The original concept key art, logo SVG/preview and city map assets remain **proposed design assets**, not proof of rendered Unity scenes or approved commercial IP.

New official sources for the stack/performance constraints include Unity LTS support (`https://unity.com/releases/unity-6/support`), Unity URP GPU optimization (`https://unity.com/how-to/gpu-optimization`), shader variant stripping (`https://docs.unity.com/en-us/engine/6000.3/manual/materials-and-shaders/built-in/shaders-in-universalrp/shader-stripping/check`), Unity Web memory (`https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/memory`), Unity Addressables remote content (`https://docs.unity.cn/Packages/com.unity.addressables%402.9/manual/remote-content-intro.html`), Tauri update signing (`https://v2.tauri.app/plugin/updater/`) and Microsoft Windows signing (`https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control`). These references support tools and constraints, not VirtualLife game performance.

The new website HTML and architecture SVG are **original planning mockups only**. No playable source code, user data, cryptographic signing material or externally published installer is included.
