# Client platform matrix and deployment model

| Target | Product tier | Runtime | 3D/graphics | Launch priority | Shipping gate |
|---|---|---|---|---|---|
| Windows 10/11 x64 | **Full VirtualLife game** | Unity native | URP anime shaders, profiles Low/Balanced/Ultra | **P0** | signed installer, tested drivers, input/chat, real perf, reconnect |
| Website desktop/mobile | **Official release & account portal** | Next.js | lightweight motion/poster/video, optional map/image gallery | **P0** | fast LCP, SEO, WCAG, secure download/auth |
| macOS Apple Silicon | Native game candidate | Unity | Metal-compatible shader profile after build/test | P1 conditional | Mac build hardware, notarization, performance & input tests |
| Linux (Proton / native) | Research | Steam/compatibility pilot | driver-specific | P2 conditional | sufficient players/compatibility benchmarks |
| Android/iOS | Native game candidate | Unity | URP mobile profile + touch + thermal | P2 conditional | physical hardware, safe area, store/privacy certification |
| Browser city-light teaser | Optional micro experience | existing Three.js | fixed scene / controlled materials, no world parity | P3 | explicit product-value and performance pass |

## Core separation
- **Game client**: local avatar controller, prediction/interpolation, camera, VFX, animation, menus, map, downloadable cosmetics assets. Never stores trusted wallet/match outcomes.
- **Official site**: marketing/updates/store information/account management/download links, no continuous game state authority. Can open installed app using allowlisted deep link with **no raw auth secrets**.
- **Native launcher**: only if desired for executable update/patch, signed artifacts, safe rollback; not the 3D renderer.
- **Server game**: Rust always single authoritative truth for both native and any optional browser client.

## Source contracts shared across clients
Protocol Protobuf + content IDs + avatar cosmetics schema + activity semantics + map place IDs; share *data formats and tests*, not runtime shading or per-platform layout.
