# QA test matrix desktop-first v1.1

| ID | Target | Tests and negative cases | Evidence |
|---|---|---|---|
| QA-01 | Rust gameplay | deterministic reducer, canonical PRNG, replay, invalid swap, late turn, duplicate receipts, AI/boss stress | fixtures + rust test logs + commit |
| QA-02 | World authority | move speedhack, collision, seat race, NPC interact permissions, teleport failure and restart, duplicate login | packet/replay logs + epoch traces |
| QA-03 | Unity compiled Windows | camera motion, FPS p50/p95/p99, hitch, CPU/GPU/VRAM, GC, shader warmup, 30/60m stability on named GPU/driver | profiler capture, build & content hashes |
| QA-04 | Visual/animation | 3 golden scenes, face morph range, ear/hat/tail/chair clipping, IK drink/cards, day/sunset/night and Low/Balanced/Ultra | approved human screenshot/video from app |
| QA-05 | In-game activities | café sit/stand, friends, hidden card hands, arena move/board/payout, reconnection, account switch/block mid-game | native e2e trace and server receipts |
| QA-06 | Official site | mobile/desktop responsive, video lazy poster, RUM/LCP/INP/CLS, SEO, keyboard/reduced motion, account/sign-in/download funnel | browser RUM/lighthouse + signed URL |
| QA-07 | Windows distribution | clean install, update/downgrade, disk-full, interrupted payload, Authenticode signature, manifest signature and hash | installer video/log/version manifest |
| QA-08 | Security/privacy | CSRF/OAuth PKCE/deep-link secret leak, ticket replay, forged game results, forbidden card projections, reward retry, mod workflows | negative tests+review |
| QA-09 | Release ops | Rust failover/recovery, PG backup restore, outbox reconciliation, CDN rollback, deployment and game version compatibility | signed staging dry-run evidence |
| QA-10 | Port candidates | macOS Metal/Android/iOS GPU thermal/lifecycle/input/safe-area with real hardware if activated | device trace and gate approval |

**Test method:** isolated scene/script route hashes, reproducible builds, meaningful load rather than invented concurrency, OS/GPU driver profile for every frame claim. No sketch, mock trailer or proposed shader counts as a passing runtime test.
