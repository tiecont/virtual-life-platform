# Synthetic cafe performance baseline

M07-06 local verification only. Budget configuration is `config/scene-performance.json`; full measurements and resource timing entries are in `docs/agent/evidence/m07-06-performance/`. Linux7.2.9-2-cachyos, Node26.9.0, pnpm11.28.5, Ryzen7 4800HS/16 logical CPUs/24,573,251,584bytes RAM. Actual authenticated PostgreSQL/HTTP/Socket.IO cafe, production web build, Chromium desktop and iPhone13 emulation with CPU4x and simulated40ms/12Mbps download.

| Metric | Local regression budget | Desktop actual | Mobile actual |
|---|---|---|---|
| Canvas with authoritative self ready, one run | <12,000ms | 2,169.6ms | 2,328.9ms |
| Loaded JS decoded | <3,145,728bytes | 2,086,490 | 2,086,490 |
| Loaded JS encoded | <1,048,576bytes | 592,035 | 592,035 |
| Atlas decoded | <524,288bytes | 415,243 | 415,243 |
| Warm second-page atlas transfer | 0bytes | 0 | 0 |
| Idle renders over1s | 0 | 0 | 0 |
| rAF p95 gap during approved walk | <100ms | 33.4ms/84samples | 16.8ms/130samples |
| Post-forced-GC heap growth,3 SPA remounts | <20,971,520bytes | 955,424 | 975,676 |

The atlas is5,303 encoded bytes in the desktop HTTP observation (415,243 decoded). Its URL contains a SHA-256 revision and its response actually carries `public, max-age=31536000, immutable`. A new page in the same browser context reuses it with zero transfer. Provenance remains separately revalidatable. The generator reproduces the SVG, full checksum and bundled URL metadata together. No downloaded artwork is introduced.

The pure scene-model entry imports zero Pixi modules in an actual Node require/cache check. The renderer is a separately exported, dynamically loaded client entry; private deep imports are still rejected. Generation-only SVG code is outside runtime frame metadata. This establishes load separation; no before/after route-transfer improvement is claimed from the earlier all-chunk disk byte inventory. The profile includes all JS completed by canvas-ready, including observed prefetch resources.

Idle work is event-driven. Walking renders approved segments locally and stops; no server frame broadcasts. The lifetime test really leaves the room, navigates to Identity and returns three times in the same JS realm, checks zero owned canvases away and one avatar/canvas on return, then compares forced-GC JS heap. The estimated atlas source pixels alone are1,572,864bytes; this is not total GPU memory.

These short local samples are regression evidence. CPU throttling does not reproduce physical low-end hardware. rAF scheduling cadence is not measured GPU throughput. Forced GC excludes GPU/total browser memory and cannot certify absence of leaks. Canvas-ready is one observation per profile, not a p95. No production CCU or device/FPS promise follows. Physical Safari/mobile, sustained performance and public release remain M22/M23 gates. Original starter sprites have provenance; cafe layout remains a synthetic fixture and media/release approval is false.
