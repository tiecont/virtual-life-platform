# ADR-003 — VirtualLife desktop-first native game, website as official release portal

**Status:** PROPOSED · **Date:** 2026-11-09 · **Supersedes:** v1.0 sections which made web 3D the first full client · **Approval:** product owner + tech architect at G0.

## Context
VirtualLife cần cảm giác tiệm cận những game anime có đầu tư: city exploration, busy NPC life, expression blendshapes, café interiors, cinematic combat, foliage, wind, particles, responsive camera, stable 60 FPS on a representative PC. Browser technologies có thể render nhiều hiệu ứng, nhưng một browser-first target làm tăng rủi ro về bộ nhớ, shader compile/load, threading, asset cache và giới hạn thiết bị. Đạt `web visual parity = native` **không** là KPI.

## Decision
1. **Windows x64 native game build** là release artifact chính; Unity 6.3 LTS **URP** / C# / Blender content pipeline. Target build profile High/Medium/Low/Photo. HDRP/Unreal/Bevy là *alternative evaluated*, không thêm renderer thứ hai chỉ vì demo đẹp.
2. **Rust authoritative game data plane**: per-zone/per-activity ownership, movement/collision constraints, teleport, NPC interactable schedules, seat locks, match rules/RNG/replay, de-duped reward receipts. Client chỉ render/predict/camera/UI, không quyết định kết quả.
3. **NestJS control plane**: account/identity, friend/chat/moderation, economy ledger, admin, content release catalog, async/email/workflow. Không giữ game authoritative loop. PG là durability, outbox/inbox cho cross-domain exactly-once *effects* qua idempotency, không tuyên bố exactly-once transport.
4. **Next.js official website**: presentation + announcement + docs + reliable signed download workflow. Video/web art phong phú nhưng progressive, SSR/SSG, thân thiện reduced-motion, không tải full 3D simulation.
5. **Web world from v1.0 = optional**: preserve N06-04/N06-09 evidence and existing code; chi nhánh optional demo/companion, không được ép launch Windows phải chờ browser 3D AAA.
6. **Cross-platform**: dùng cùng Unity project/asset source cho macOS và Android/iOS với separate build/render tiers sau Windows acceptance; Linux tùy business demand. Không đồng nhất platform bằng cách bỏ yêu cầu hiệu năng.

## Tradeoffs
- Native tăng khả năng tối ưu GPU, advanced motion/animation và bộ nhớ nhưng tăng tải installer, CI graphics hardware, asset CDN, code signing, updater và support.
- Unity giúp art/animation/editor; C# ở client là thiết yếu, không vi phạm nguyên tắc Rust game calculations. Rust client FFI chỉ cân nhắc nếu thực sự có kernel tính toán dùng chung và benchmark chứng minh lợi ích; default **không** lắp Rust vào Unity UI/render loop.
- URP ưu tiên cross-platform và stylized controllability, không tự đạt mức quality HSR/ZZZ/Genshin; cần art direction, shaders, lighting, cameras, animation và QA nhiều vòng.

## Alternatives and why not now
- **Unreal Engine 5 + Nanite/Lumen**: có thể hợp cinematic high-end Windows, nhưng mobile parity/team size/install size cần bằng chứng. Chỉ reevaluate nếu vertical slice URP không đạt chất lượng yêu cầu *trên cùng art budget và hardware*.
- **HDRP desktop + URP mobile**: hai render pipelines/shaders làm tăng cost/parity; không dùng trong G0–G4. Có thể tính nếu chiến lược Windows premium thay đổi rõ rệt.
- **Tauri/Electron desktop wrapper cho Babylon Web**: tốt cho apps, không thay thế native 3D renderer và asset streaming khi mục tiêu là chất lượng game cao.
- **Only web browser game**: vẫn có giá trị cho companion/demo, nhưng không nên là release blocker.

## Measurable decision gates
- `VL-078`, `VL-080`, `VL-082`, `VL-087`, `VL-095`, `VL-099`: thực tế Windows x64 build trên thiết bị tier đã chỉ định, profiler CPU/GPU p95/p99 + hitch/VRAM + visual review (3 thời điểm trong ngày, café card table, Pet Arena VFX).
- Website `VL-098`: p75 Core Web Vitals thật cho trang download/trailer, path download không broken và integrity verified.
- Platform `VL-096`: kill/reconnect/duplicate/reward negative suite chạy trên Rust/Unity/client release candidates.

## Explicitly out of scope
VR/metaverse hardware, raytracing mandatory, photoreal fur on low spec, 1000 avatars in one viewport, 120 FPS every GPU, every OS simultaneous release, live operational claims chưa đo.
