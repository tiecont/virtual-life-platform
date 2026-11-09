# Desktop performance and web scope Go / No-Go decision

## The decision is NOT “website impossible”
Native is the **primary quality target now**. Web can do good stylized 3D, but maintaining full desktop fidelity in the browser is not a contractual requirement. A web open-world client is optional only when (a) user benefit is real, (b) N06 source reuse cost is low, (c) quality on tested browser GPU/memory is acceptable, and (d) no duplication of gameplay authority.

## Measurement benchmark rig
Three fixed replay routes: Aurora Plaza Noon 10m, Café enter/sit/card 10m, Pet Arena dusk with bursts 10m. Use released or release-like Unity player build, repeat ≥3 passes after initial shader warmup + cold start measurements separately. Hardware tiers named, OS/driver/content hash recorded; add throttled CPU/low-memory scenarios and high activity with NPC/20 player proxies as *scenario labels*, not fabricated live throughput.

## Desktop gate G4 (provisional)
- Balanced 1080p 60Hz: p95 frame ≤16.7ms and p99 measured, 1% lows recorded and severe hitches audited; real 30m run plus driver/crash monitoring.
- Entry tier: 30fps sustained or label unsupported with transparent requirements; UI legible, camera controllable, no hidden-card leaks from graphics stream.
- Shader variants loaded without runtime freezes at café/Pet transitions; measured VRAM with background apps; no unbounded prefab instantiation or audio/video decoder memory.
- Latency: local control prediction immediate, Rust 10–20Hz tick with p95 tick budgets, reconnect from 0/1/3% packet loss, canonical seat/teleport/reward.
- Product: 5+ fresh-user moderated playtests, no blocking confusion on map M, sit/stand, Pet Arena return, account auth.

## Official website gate (provisional)
- p75 LCP≤2.5s/INP≤200ms/CLS≤0.1 on tested pages with real-user/synthetic correlation, mobile 4G and reduced-motion tested; no 3D WebGL/Unity runtime required for main routes.
- Secure HTTPS downloads, correct signed artifact + SHA256, Windows OS detection and manual platform choice, no stale version, no fake metrics, support/terms/privacy discoverable.
- 24h post-release staging/canary monitoring before widening users; owners approve thresholds based on baseline.

## If visual quality doesn't meet goals
1. Profile CPU vs GPU vs asset IO; do not reflexively migrate to Unreal or spend CPU on Rust shader optimization (irrelevant).
2. Simplify world content/scene size, add LOD/occlusion, reduce transparents/shadowcasters, profile face/hair shaders and texture memory; tune shading by measured profiles.
3. Only if same art/animation slice cannot meet **aesthetic + performance** quality after controlled optimizations, run an Unreal/HDRP comparative spike *with a named stop condition*. Do not build a second production client by default.
