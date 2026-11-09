# Scope and what “smooth” means in VirtualLife v1.1

**Desktop native first.** Actual benchmark determines requirements, not the reference videos. All thresholds below are **proposed objectives**, not measured results.

| Tier | Target (test device TBD) | FPS hypothesis | Render/experience strategy |
|---|---|---|---|
| Windows Entry | identified low tier PC | sustainable 30fps / p95≤33.3ms | simplified shadows, crowds, postFX, expression distance |
| Windows Balanced | identified midrange discrete GPU PC | 1080p 60fps / p95≤16.7ms | designed target for art/performance balance |
| Windows Ultra | identified high end GPU PC | 1440p 60fps optional higher | richer face/hair/foliage and filmic lighting but no mandatory RT |
| Website | desktop/mobile browsers | p75 LCP≤2.5s, INP≤200ms, CLS≤0.1 | SSR static content, poster-first media, lightweight motion; no AAA world shader |
| Mobile native candidate | real Android/iPhone in G5 | 30fps sustained with thermal cap | reduced resolution and quality, no client-parity promise |

Perf measures: Rust tick overrun, ACK latency, AOI fanout; Unity compiled player GPU/CPU p95/p99/VRAM/frame hitches; site RUM/browser web vitals, CDN download rate/failures. Client game FPS and site Web Vitals are **different metrics** and cannot be exchanged.

Gates: **G0** audit/ADR desktop/platform agreement → **G1** Rust + Unity scaffold/network + portal shell → **G2** playable desktop Aurora Plaza → **G3** walk-in card/Pet → **G4** signed Windows closed beta and performance/security → **G5** optional ports → **G6** official desktop release/site → **G7** scale with evidence.
