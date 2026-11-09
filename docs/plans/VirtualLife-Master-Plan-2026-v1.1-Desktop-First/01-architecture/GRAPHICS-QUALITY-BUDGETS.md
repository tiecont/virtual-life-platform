# Desktop rendering budgets / profiling gates (targets, not observed specs)

## Real hardware requirement policy
No official minimum or recommended GPU until **VL-077/078** lock 3 Windows test PCs with named CPU/GPU/RAM/driver/SSD; measure actual compiled player. The following tiers are *hypotheses* and must be revised by profiler—not marketing claims.

| Profile | Target frame | CPU+GPU budget | Default resolution | Visual levers | Example test purpose |
|---|---|---|---|---|---|
| Low | ≥30 FPS sustained | p95 frame time ≤33.3 ms | 900p dynamic | no screen-space extras, half crowd/particles, shadows low, facial near only | integrated/entry GPU pilot |
| Balanced | ≥60 FPS sustained | p95 frame time ≤16.7 ms | 1080p | medium shadows, baked GI/probes, dynamic render scale when necessary | recommended PC pilot |
| Ultra | 60 FPS target / optional 90–120 cap | p95 ≤16.7ms at 1440p on premium benchmark | 1440p | high avatar face/foliage, polished bloom, high LOD | premium discrete GPU pilot |
| Photo | quality first (not combat) | optional lower FPS | native/max reasonable | more NPCs/DOF/high materials after recording safety | still/photo mode optional |

**Also record:** p99, 1% lows, GPU time vs CPU time, shader compile hitch, asset streaming hitch, VRAM residency, crashes, stable 30min memory, 60min soak and GC/allocation spikes. Do not combine percentiles from different scenes or machines.

## Proposed hard-stop release criteria (set numerical baselines after device audit)
- Windows Balanced compiled build at 1080p 60Hz real: >=95% measured frames within 16.7ms **after warmup** over scripted 10min city route; severe >100ms hitch count/10min explicitly budgeted and reviewed (goal zero beyond known loading transition).
- Low game playable at 30fps with input and text readable; render quality downgrade doesn't affect hitboxes or social privacy.
- No unrecoverable GPU/device crash in test matrix; no 30m runaway memory or repeated GC >50ms spikes under normal city walk.
- Worst-case café→card→Pet flow completes even when High assets evicted/reloaded, no white screen/invalid animator/double load.
- No acceptance for raw average FPS screenshots; require sample counts and matched camera route.

## Measure with controlled script
`device.json` (CPU/GPU/driver/OS/VRAM), `build.json` (Unity editor/hash, content hash, quality, resolution, flags), `route.json` (timed camera/scene/network simulation), `profile.csv` per frame, `result.json` p50/p95/p99, crash/GC/VRAM metrics, image/video capture hashes. Asset and protocol versions included.

## Input/network comfort budgets
Input-to-local-motion should feel immediate (client prediction, no waiting for server RTT for visual move). Remote motion interpolated from server at ~10–20 Hz initial social city tick; camera locally refreshed at display Hz. Move cheating validation server-side, correction path smooth. Distinguish local visual latency from authoritative ACK p95; network jitter tests 40/80/150ms and packet loss 0/1/3% on repeatable scenarios.
