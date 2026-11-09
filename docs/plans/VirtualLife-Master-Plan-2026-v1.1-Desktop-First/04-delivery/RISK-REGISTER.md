# Risk register update: desktop-first v1.1

| Severity | Risk | Trigger | Owner | Mitigation/Stop |
|---|---|---|---|---|
| Critical | split-brain authority legacy Nest/Rust | same world ID writable twice | A0/A1/A2 | separate ID namespace, epoch/fencing, no shared owner cutover until G7 |
| Critical | unauthorized/duplicate rewards | concurrent retry or outbox failure | A1/A2 | game receipt idempotency and platform ledger unique inbox |
| Critical | private card leak | client/server projection bug | A2/A6 | recipient scope and negative spectator tests |
| Critical | unsigned malicious installer/update | bad manifest/signing chain | SRE/security | Authenticode, signed manifest, protected secrets, artifact hash/rollback |
| High | desktop looks beautiful but can't hold 60fps | hair/foliage/transparent VFX cost | A4/A5/A7 | compiled Windows profiling, quality tiers, optimize one scene before content sprawl |
| High | Unity shader variant explosion | too many quality keywords | A5/A4 | stripped variants, log/CI cap, warmup/cold load tests |
| High | avatar body clipping during sit | mixed rig/seat anchors | A4/A5 | golden sitting IK, rig contract/fit checks |
| High | overloaded content patches or disk | invalid CDN catalog/chunk resume | A5/SRE | content signature/hash and atomic patch/download failure tests |
| High | user confusion with site vs app | web landing resembles playable city | A3/Product | explicit Windows download CTA, no fake 3D web play button |
| High | art scope exceeds resources | more species/districts requested | A0/A4 | narrow content, preserve quality core, change-control for assets |
| High | user data leaked in crash logs | token/private card data included | Security | scrub token/hand, opt-in diagnostics, retention policy |
| High | parallel agents edit Unity scene/project settings | scene prefab and shader collisions | Coordinator | one writer/shared file reservation; isolated variants/prefab lanes |
| Medium | Mac/mobile port slows Windows | shared shader/asset constraints | A0/A5 | ports G5 conditional, separate quality profile and product gate |
| Medium | media-heavy website slow | loading 4K trailer on mobile | A3 | responsive poster-first video, p75 real Web Vitals |

Each risk requires real owner/trigger/evidence before closing. See `04-delivery/PERFORMANCE-GO-NOGO.md`.
