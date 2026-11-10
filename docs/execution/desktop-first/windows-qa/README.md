# VL-007 Windows QA audit — physical matrix pending

`acceptanceMet` is **false**. No three named physical Windows test PCs or owner
agreement are available in the supplied evidence. The read-only local inventory
is Linux, and is recorded separately in [OBSERVED-HOST.json](OBSERVED-HOST.json).
It supplies no Windows player, GPU-tier, Unity-license or performance verdict.

Run `node scripts/desktop-hardware-audit.mjs` for a fresh local inventory. It
reads OS/CPU/RAM, available Linux DRM PCI IDs/driver versions and executable
paths. It does not execute editors, install tools, read secrets or provision a
runner. Unknown model, VRAM, SSD and driver facts stay unknown. PATH checks are
not a whole-machine software search or license audit.

| Candidate slot | Physical device name | Windows / CPU / GPU / VRAM / RAM / SSD / driver | Owner agreement |
|---|---|---|---|
| Entry / Low | Not supplied | All pending | Pending |
| Balanced | Not supplied | All pending | Pending |
| Premium / Ultra | Not supplied | All pending | Pending |

These slots are test purposes, not advertised minimum/recommended hardware.
Each actual device needs a dated OS build, CPU model, GPU model and driver,
dedicated/shared VRAM, RAM, SSD model/free space, physical-machine confirmation,
capture operator and agreement record. Record thermal/power/background-app
conditions. Do not turn the current Linux host into a named Windows tier.

The initial route and metric specification follows the supplied
[performance gates](../../../plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First/04-delivery/PERFORMANCE-GO-NOGO.md)
and [graphics budgets](../../../plans/VirtualLife-Master-Plan-2026-v1.1-Desktop-First/01-architecture/GRAPHICS-QUALITY-BUDGETS.md):

| Route ID | Scenario | Each pass | Repeats |
|---|---|---|---|
| `aurora-plaza-noon` | Plaza traversal, meaningful NPC/20-player proxy workload | 10 minutes | At least 3 after warmup |
| `cafe-seat-card` | Enter café, sit/stand and private-card flow | 10 minutes | At least 3 after warmup |
| `pet-arena-dusk` | Arena transitions, combat VFX bursts and return | 10 minutes | At least 3 after warmup |

Cold start and shader warmup are separate captures; do not silently remove their
samples from a measured run. Route scripts/replay hashes are **not implemented**
by this inventory. They must be bound to the actual Unity scene/build/content
before qualification. Also record a real 30-minute run and 60-minute soak,
crashes, shader/asset hitches, CPU/GPU timing, VRAM residency, GC/allocation and
memory trends. Preserve the per-frame raw capture hashes. Balanced targets
p95 ≤16.7 ms at 1080p; Low targets ≤33.3 ms at 900p. These are provisional plan
targets, not observations. Record p99 and 1% lows even when p95 fails. Do not
aggregate percentiles across different routes, machines or phases.

`node scripts/desktop-hardware-audit.mjs --frames capture.json` provides a strict
measurement-intake/statistics helper. Input has `schemaVersion:1`, nonempty
`runId`, `deviceId`, `os`, `gpu`, `driver`, one listed `routeId`, one `phase`
(`cold-start`, `warmup` or `measured`), exact `buildSha256`/`contentSha256`, and
positive finite `frameMs` samples. It returns nearest-rank p50/p95/p99, total
sampled frame duration, frames over 16.7 ms, severe hitches over 100 ms and 1%
low FPS computed from the slowest ceil(N×0.01) frame durations. It always states
`MEASUREMENT_SUMMARY_NOT_QUALIFICATION` and `acceptanceMet:false`. Imported JSON
alone cannot prove the capture's device, provenance or Unity runtime.

Official-site QA remains a separate browser lane: record page/version/browser,
viewport, network profile, reduced motion and p75 LCP ≤2.5 s / INP ≤200 ms /
CLS ≤0.1 with real-user/synthetic correlation. This audit does not install RUM or
claim Web Vitals measurements. HTTPS download integrity, keyboard/account flow
and signed artifact checks remain separate acceptance evidence.

Next exact action: obtain the three actual Windows profiles and owner agreement,
then qualify Unity editor/runner and implement the hashed scene routes. Until
then retain this task as externally blocked rather than accepting hypothetical
hardware or synthetic statistics as physical player evidence.
