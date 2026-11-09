# Phase gates v1.1 — desktop game and official portal

| Gate | Entry | Required proof | Signoff |
|---|---|---|---|
| **G0 Audit/ADR** | archive + current repository | repo HEAD/ledger read-only reconciliation, target Windows hardware, Unity/license/OS/CI plan, ADR-003, one writer/domain | A0+architect |
| **G1 Rust + Unity boot** | G0 approvals | Rust deterministic game receipt/replay, scoped ticket→direct WSS, Unity pinned editor+Windows release build, C# proto, URP shader pilot on real GPU, Next site basic shell | A1+A2+A5+A3 |
| **G2 Native district** | G1 + approved blockout/rig | compiled Windows player city AOI, E interact, M map, click-to-move, expressions/ear/tail, NPC animation, Low/Balanced/Ultra first 10m traces, no dual-owner | A5+A4+A7 |
| **G3 Walk-in games** | G2 + venue/schema | café enter/sit/reconnect, card game hidden projections, Pet Arena PvE, Rust receipts/rewards, teleport saga, native HUD, end-to-end traces | A1+A2+A5+A6+A7 |
| **G4 Windows closed beta** | G3 + provenance | real 30–60m native profiling, signed installer/payload and rollback, site download and Core Web Vitals, account switching/privacy/adversarial tests, human visual/fun signoff | A0+A3+A5+A7+A2 |
| **G5 Ports optional** | G4 & hardware/owner approval | macOS/Android/iOS tested on **real** devices per platform; failure does not block Windows | A0+A5+A7 |
| **G6 Official desktop release** | G4 + release/legal/security approval | staged operational rollout, hash/signature/CDN verified, support & status page, incident drill, backup/reward restore, monitored canary and explicit public signoff | A0+SRE+security |
| **G7 Scale after evidence** | G6 and measured saturation | Rust zone ownership epoch/fencing failover, capacity/cost data, new district/play-mode tests | A1+A2+A7 |

**Stop immediately** on duplicate settlement, unauthorized game state, leaked card hand, split-brain room, broken signing chain, or repeatable device crash in supported tier. Browser FPS failure is *not* a blocker for native city, but official website download/auth failures are release blockers.
