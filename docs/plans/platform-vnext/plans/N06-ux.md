# N06 — UI/UX và playable vertical slice

**Owner lane:** Experience  
**Activation:** active · **Implementation:** TODO  
**Goal:** Chuyển giao diện kiểm chứng thành game social3D animals đẹp, lông/animation chi tiết, rõ, dễ trở lại, có kiểm tra usability trên web/mobile.

## Phạm vi file dự kiến

- `apps/portal-web/*`
- `packages/game-client/*`
- `packages/ui/*`
- `packages/pixi-scene/*`
- `packages/scene3d/*`
- `apps/mobile/*`
- `packages/*-world/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

## Owner update 2026-11-06

**Hướng hiện hành:** [animals3D/lông chi tiết/UI và Emulator](../architecture/07-3D-FUR-AND-EMULATOR.md). N06-06 design2D và N06-08 landscape giữ acceptance/revision lịch sử. N06-10/11 bổ sung brief/pipeline và renderer3D; N06-07 creator/N06-04 cảnh phải dùng model/rig/material/animation3D chung, N06-09 phải kiểm fur/LOD/animation/lighting/readability từ runtime3D web/mobile thật. Xem manifest cho dependency mới; không coi sprite/SVG study là final3D.

[Animal/landscape visual direction](../architecture/06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md) bổ sung N06-06..09. N06-01/02 đã VERIFIED vẫn giữ acceptance/evidence lịch sử. Các task mới là TODO; đọc runtime state để biết tiến độ. Thứ tự implementation: N06-06 → N06-03 → N06-08/N06-07 → N06-04 → N06-09 → N06-05/N10-04.

## Tasks

### N06-01 — Product journey và art direction

**Depends on:** N00-02  
**Trạng thái ban đầu:** TODO  
**Priority:** 10

**Deliverables**

- Flows first-play/return/room/queue/reconnect; visual direction board với asset provenance

**Acceptance / Definition of done**

- Home dẫn vào hoạt động meaningful; server/schema details chuyển admin.
- Chốt một core loop Deadline focus và Maid service; không mở thêm worlds để che UX mỏng.
- First meaningful action <60s là target nháp, không achievement/retention claim.

**Verification**

Scenario / evidence:

- Review stakeholder/product flows và source screenshots có nhãn historical.

**Rollback / recovery:** Documentation/prototype only.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N06-02 — Design system và prototype có trạng thái lỗi

**Depends on:** N06-01  
**Trạng thái ban đầu:** TODO  
**Priority:** 11

**Deliverables**

- Tokens/components, desktop/mobile prototype, keyboard/reduced-motion alternatives

**Acceptance / Definition of done**

- Các state loading/empty/full/wait/offline/reconnect/denied đều có thiết kế.
- HUD và bottom sheets ưu tiên scene; text/UI scalable, safe area/keyboard rõ.
- Có motion/audio opt-in phù hợp, không bỏ accessible DOM path.

**Verification**

Scenario / evidence:

- Inspect 360px mobile + desktop; task walkthrough keyboard/screen reader prototype.

**Rollback / recovery:** Version prototype/tokens; giữ current UI cho đến slice mới đạt.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N06-03 — Implement shared game shell và điều hướng

**Depends on:** N06-02, N10-02, N05-06, N06-06
**Trạng thái ban đầu:** TODO  
**Priority:** 82

**Deliverables**

- Scene-first shell, onboarding, navigation và shared state

**Acceptance / Definition of done**

- Next portal mount shared game-client; không nhúng Next dependencies vào shared package.
- Identity/travel/queue status rõ và không duplicate authoritative state.
- Không full reload/refresh form thủ công để cập nhật critical gameplay.

- Shared shell theo animal/landscape brief N06-06; chưa coi prototype cũ là visual acceptance.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:ux-core`

Scenario / evidence:

- Desktop/mobile browser flows gồm error/permission/loading và stale events.

**Rollback / recovery:** Feature-flag new shell, retain verified route adapter.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N06-04 — Polish hai vòng chơi Deadline/Maid

**Depends on:** N06-03, N05-04, N06-07, N06-08
**Trạng thái ban đầu:** TODO  
**Priority:** 83

**Deliverables**

- Complete room scenes/animations/sound settings/interactions + first return journey

**Acceptance / Definition of done**

- Ngồi/focus/leave/resume và order/service/reward diễn ra bằng intent validated server.
- Travel giữ identity, report/block ở đúng ngữ cảnh và không mở unsolicited interaction.
- Asset budgets, original/licensed provenance; không giả art approved.

- Animal appearance dùng shared composer; hai cảnh landscape có lighting/props/animation và bản sắc nhất quán theo N06-06.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm assets:check`
- `pnpm test:integration`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:ux-core`

Scenario / evidence:

- Browser journey thật và visual QA; responsive network/reconnect states.

**Rollback / recovery:** Roll back new scenes/shell bằng feature flag, keep asset version for old clients.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

### N06-05 — Usability, accessibility và product instrumentation

**Depends on:** N06-04, N06-09
**Trạng thái ban đầu:** TODO  
**Priority:** 84

**Deliverables**

- Usability observations, a11y report, privacy-aware activation/return event spec

**Acceptance / Definition of done**

- Tối thiểu 5 target users do owner cung cấp: heuristic >=4/5 bắt đầu activity trong90s không hướng dẫn từng bước; report failures.
- Keyboard/touch/screenreader core tasks, reduced motion, no focus traps.
- D1/D7 retention chỉ đo sau có user/cohort đủ và consent; không dùng synthetic tests chứng minh hay/giữ chân.

- Usability dùng build animal/landscape mới; ghi findings creator và gameplay ngang, không thay target-user evidence bằng screenshot diff.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm ci:browser`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:ux-core`

Scenario / evidence:

- Physical usability là lane riêng; chưa có testers => ghi blocker, không tự gửi lời mời.

**Rollback / recovery:** Tắt analytics không consent; iterate UX theo findings không đổi backend authority.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.


### N06-06 — Animal art direction, modular rig/catalog và landscape storyboard

**Depends on:** N06-02
**Trạng thái ban đầu:** TODO
**Priority:** 80

**Deliverables**

- Style sheet/palette/lighting và một cảnh đại diện, gắn provenance/review status
- Starter animal species/body-part matrix, anchors/occlusion và idle/walk/sit/serve plan
- Landscape/portrait-fallback storyboard và versioned asset/device budgets trước implementation

**Acceptance / Definition of done**

- Ghi đúng owner yêu cầu landscape/animals/tạo từng bộ phận; cozy 2D/2.5D là đề xuất, không giả owner duyệt art cụ thể.
- Catalog nhỏ có lựa chọn từng bộ phận thực, compatibility loài/rig/outfit và v1 migration/fallback mapping; không chỉ tint sprite.
- Review scene-first layout ở landscape viewports, safe area/keyboard/accessibility và loading/full/offline/reconnect states.
- Provenance/rights status và budgets có revision, giữ thresholds android-spike.json đã khóa; concept không tính final asset hoặc measured performance.

**Verification**

Scenario/review cần bằng chứng thật:

- Review style sheet, rig matrix, storyboard và provenance từng asset; chưa tuyên bố code/visual/device tests PASS.

Task thiết kế: ghi review/artifact hashes thực; không cần tạo tests mô phỏng tài liệu để tăng số PASS.

**Rollback / recovery:** Version/revert design documents only; giữ assets, appearance v1 và evidence N06-01/02 nguyên vẹn.

**Required evidence:** source SHA/diff hash, environment/device, lệnh/exit hoặc review thực, artifacts/hash, acceptance và limitations; không coi plan validation là visual/gameplay PASS.

### N06-07 — Modular animal creator, authoritative appearance và shared rendering

**Depends on:** N06-03, N06-06, N02-04, N05-06, N10-03, N06-11
**Trạng thái ban đầu:** TODO
**Priority:** 82.2

**Deliverables**

- Creator species/body/head/eyes/muzzle/ears/tail/fur-markings/hair/outfit/accessories với preview, preset, reset, Save/Cancel
- Versioned part catalog/appearance, server validation/persistence và N/N−1 projection
- Shared layered composer cho editor, Deadline/Maid và avatar thumbnail

**Acceptance / Definition of done**

- Có biến thể nhìn thấy được theo từng bộ phận trong starter catalog N06-06; combinations hợp rig, đủ idle/walk/sit/serve và các hướng đã chốt.
- Save/equip do server xác nhận; reject unknown part/URL, incompatible species và unowned cosmetics; không tự cấp quyền từ preview.
- Duplicate save/lost ACK, account switch/late response, stale catalog và revoke entitlement có tests; private inventory không leak ra room/metrics.
- V1 profiles và selected outfit giữ dữ liệu; nếu cần SQL thì additive migration số mới; N/N−1 có runtime tests và fallback không ghi đè selection.
- Travel/reconnect giữ identity và appearance; cosmetic không đổi hitbox/seat/role/reward; asset/WebGL failure vẫn có DOM/text path.

**Verification**

Scripts có trong package.json tại planning checkpoint; phải chạy thực khi implementation:

- pnpm lint
- pnpm typecheck
- pnpm assets:check
- pnpm test:integration
- pnpm test:security
- pnpm build

Tên command đề xuất, chưa implement/chạy trong task cập nhật plan này:

- pnpm test:avatar-creator (implement before claiming PASS)

Scenario/review cần bằng chứng thật:

- Creator→Save→Deadline/Maid→travel/reconnect trên browser và Android thật; kiểm seams/anchors/occlusion/animation và missing assets.

**Rollback / recovery:** Tắt creator mới theo flag, giữ appearance/catalog versions và receipts; v1 projection tương thích, không xóa hoặc reset customization.

**Required evidence:** source SHA/diff hash, environment/device, lệnh/exit hoặc review thực, artifacts/hash, acceptance và limitations; không coi plan validation là visual/gameplay PASS.

### N06-08 — Landscape gameplay shell, native orientation và accessible fallback

**Depends on:** N06-03, N06-06, N10-02
**Trạng thái ban đầu:** TODO
**Priority:** 82.1

**Deliverables**

- Scene-first landscape HUD/dock/drawers dùng chung web/native
- Gameplay-scoped native orientation adapter với cleanup và resize-safe fallback
- Portrait recovery layout, DOM controls và safe-area/keyboard handling

**Acceptance / Definition of done**

- Gameplay ngang là layout chính; scene và critical actions không bị sidebar dài hoặc panel bắt buộc che khuất.
- Hai chiều ngang, rotate/resize, Back/background/resume và OS không áp orientation lock không reset visit/match/avatar hoặc duplicate intent.
- Portrait fallback có lời nhắc xoay không chặn report/block/leave/resync; auth/admin forms vẫn usable.
- 740×360,844×390,1280×720,1920×1080 và 360×740 fallback có evidence; viewport thực Android ghi riêng, không nhận là broad device coverage.
- Keyboard/cutout/safe area/tăng chữ/reduced motion và touch/keyboard/screen-reader controls kiểm thật; iOS execution vẫn conditional N14.

**Verification**

Scripts có trong package.json tại planning checkpoint; phải chạy thực khi implementation:

- pnpm lint
- pnpm typecheck
- pnpm build

Tên command đề xuất, chưa implement/chạy trong task cập nhật plan này:

- pnpm test:ux-core (implement before claiming PASS)

Scenario/review cần bằng chứng thật:

- Landscape browser + APK Android thật, cả hai chiều ngang/portrait fallback, keyboard/cutout/Back/resume và late network responses.

**Rollback / recovery:** Tắt landscape shell/orientation policy theo flag và cleanup; giữ verified route adapter, room membership và accessible controls.

**Required evidence:** source SHA/diff hash, environment/device, lệnh/exit hoặc review thực, artifacts/hash, acceptance và limitations; không coi plan validation là visual/gameplay PASS.

### N06-09 — Animal/landscape visual qualification và asset performance evidence

**Depends on:** N06-04, N06-07, N06-08, N06-11
**Trạng thái ban đầu:** TODO
**Priority:** 83.5

**Deliverables**

- Source/asset-revision-bound screenshot/video matrix và visual review rubric
- Provenance ledger, actual frame-time/memory/loading report, preserved failures
- Technical visual acceptance summary, owner art-review status và exact remaining findings

**Acceptance / Definition of done**

- Actual interactive creator và Deadline/Maid có animal appearance đúng layer/pose/hướng; không lấy concept hoặc preview cũ làm bằng chứng.
- Landscape web/Android thật đủ loading/empty/full/queue/offline/reconnect/denied, rotation/keyboard/safe-area/portrait fallback; không giả queue backend đã wiring.
- Hai vòng chơi, avatar Save/Cancel/travel/reconnect và safety giữ authoritative outcome; graphics không khóa report/block/leave.
- Đo asset/frame-time/memory/loading theo budgets khóa trước; giữ failed runs, model/OS/WebView/source/catalog hashes và single-device limitations.
- Rubric composition/silhouette/animation/lighting/readability/consistency có reviewer và issues; technical QA không thành owner art approval, human usability hoặc retention claim.

**Verification**

Scripts có trong package.json tại planning checkpoint; phải chạy thực khi implementation:

- pnpm assets:check
- pnpm lint
- pnpm typecheck
- pnpm build

Tên command đề xuất, chưa implement/chạy trong task cập nhật plan này:

- pnpm test:ux-core (implement before claiming PASS)
- pnpm test:avatar-creator (implement before claiming PASS)

Scenario/review cần bằng chứng thật:

- Visual review theo architecture/06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md trên desktop và Android thật; ghi NOT_RUN cho coverage thiếu.

**Rollback / recovery:** Rollback versioned scenes/shell/creator bằng flags và compatible catalog; giữ data và evidence, không hạ thresholds để PASS.

**Required evidence:** source SHA/diff hash, environment/device, lệnh/exit hoặc review thực, artifacts/hash, acceptance và limitations; không coi plan validation là visual/gameplay PASS.

### N06-10 — Art direction3D, fur/rig pipeline và budgets trước đo

**Depends on:** N06-06,N06-08 · **Priority:**79 · **Initial:**TODO

Deliverables: brief3D hiện hành, model/groom/material/animation/UI rubric, rendererport/source audit và ADR, provenance/pipeline và budgets có revision trước implementation. Chốt một animal close-up và một phòng đại diện; starter catalog hỗ trợ cat/dog/rabbit và các bộ phận owner yêu cầu.

Acceptance: chuyển pixel sang3D đúng yêu cầu web/mobile; fur có hướng/mật độ/LOD/seams và lighting, không nhận primitive/SVG/concept là final; audit giữ identity/authority/server floor/receipts, locked Android thresholds và v1 selections. Đặt limits mesh/bones/cards/textures/drawcalls/download/shadows/quality tiers và điều kiện measurement riêng, không gán kết quả khi chưa chạy. Quyền asset và owner art review có trạng thái thật.

Verification: review source/model pipeline/ADR/budget/provenance thực và plan validation. Đây là design scope, không tự phát minh PASS3D/physical/human. Rollback: version brief mới, giữ evidence/budgets cũ và renderer fallback. Evidence cần SHA/diff, commands/review outcomes, hashes, limitations và exact next action.

### N06-11 — Shared3D renderer spike, rig/fur và phòng đại diện

**Depends on:** N06-10,N10-05,N06-08 · **Priority:**81 · **Initial:**TODO

Current partial checkpoint at5255a2e,2026-11-07: [actual20actor workload evidence](../audit/N06-11-WORKLOAD-CHECKPOINT.json), run/scope guide in repository `docs/mobile/SCENE3D-WORKLOAD.md`. `test:scene3d-workload`, `mobile:android:workload` và `mobile:emulator:workload` đã implement rồi chạy thực. Required Low/Balanced AVD observed limits pass at≈16.8ms p95;20recreates release all leases. High remains desktop-only diagnostic; SwiftShader frame failure,2976px texture failure and native Low50ms pre-cache failure are preserved. Indexed/chunked and shared face geometry keeps triangle/skin/morph/material streams intact and inventory includes retained cache. Whole task stays IN_PROGRESS for final art/full scenes/controlled load/heap/physical qualification; no N10-04 or final visual claim. N10-03 native auth remains the independent next ready prerequisite for creator Save.

Deliverables: renderer3D qua shared adapter, model rigged/fur/material và một góc phòng tương tác, loader/cache/dispose/context recovery, camera/LOD/quality settings; shared web/mobile build. Chọn/pin renderer theo ADR và phép đo, không rewrite backend/ORM.

Acceptance: runtime3D thực có idle/walk/sit/serve và camera/resize; close-up fur và gameplay-distance LOD/readability, anchors/occlusion/shadow/color-space được review. Không texture/card leak sau travel/recreate; graphics failure vẫn có DOM/report/leave. Web + packaged Android Emulator chạy thực; physical Android kiểm riêng và iOS conditional. Ghi số đo GPU/frame/loading/memory và source/model/material hashes; emulator/softwareGPU không thay physical thermal/battery hoặc N10-04. Placeholder có nhãn; N06-09 vẫn cần final asset/visual acceptance.

Verification hiện hữu cần chạy: pnpm lint, pnpm typecheck, pnpm build, pnpm test:client-boundaries, pnpm assets:check. **Planned, phải implement trước:** pnpm test:scene3d; pnpm mobile:emulator:smoke. Manual: actual browser/AVD/physical images/video/performance và failure/context-loss/lifecycle review theo brief07. Rollback bằng renderer flag/catalog compatibility, giữ Pixi/v1 data/receipts. Evidence SHA/diff, environment/device/GPU, actual commands/codes/hashes/limitations/exact next action.

Initial studio checkpoint at804c0f1,2026-11-07: `test:scene3d` và `mobile:emulator:scene3d` đã được implement và chạy thật cho shared local studio; [evidence partial](../audit/N06-11-STUDIO-CHECKPOINT.json). Runtime state vẫn IN_PROGRESS, không VERIFIED. Original24bone cat/groom/room, extracted engine-neutral port, opt-in web/mobile study, source-bound DEBUG APK và browser/AVD lifecycle/context/rotation/Back checks có kết quả thực. Authoritative room snapshot/intent/distance LOD,20actor/loading/resources/physical qualification và final fur/rig/cloth/serve art còn thiếu tại checkpoint này. Không nhận studio chỉ xem mẫu là playable3D room hay full N06-11 acceptance; N06-07/04/09 và N10-03/04 vẫn riêng.

Room-adapter checkpoint atcbae184,2026-11-07: shared projection giữ nguyên body và Pixi re-export; renderer3D nhận snapshot thật,nội suy path đã commit,raycast các intent hiện hữu,LOD1/2 và cleanup/recovery. `pnpm test:scene3d-room` đã implement và chạy14case browser/API thực;12classic rollback cases(+2layout skips),3default bundle,89governance/383unit/145protocol và6AVD scenarios có evidence trong [checkpoint partial mới](../audit/N06-11-ROOM-ADAPTER-CHECKPOINT.json). Native vẫn là logged-out preview,không nhận room auth/Save đã xong. State vẫn IN_PROGRESS:20actor GPU/loading/resources/physical và final art/camera/thumbnail còn thiếu. Next: implement labelled20actor benchmark harness trước khi chạy; không tính unit20skeleton hoặc one-cat timing là benchmark đó. Scope/cờ rollback ở `docs/mobile/ROOM3D-ADAPTER.md`.
