# N06 — UI/UX và playable vertical slice

Current checkpoint2026-11-08: N06-11 technical renderer spike VERIFIED under ADR0133;N06-07 creator/authoritative Save/browser and packaged-native world/travel integration has actual partial evidence,with physical Android qualification BLOCKED_EXTERNAL (fresh USB0). [Native checks](../audit/N06-07-NATIVE-WORLD-CHECKPOINT.json) preserve431unit/740integration/267security,14browser creator+4travel and9AVD journey scenarios. N06-04/N06-09 final scene/art and their downstream tasks remain gated;do not treat technical art or AVD as those acceptances. Phase1 has a safe checkpoint for separate dependency-ready Lantern Lodge work. Earlier checkpoint paragraphs below are historical.

Current N06-11 remains IN_PROGRESS after serving-anchor partial slice at21cbc1f21d4ac8221805e49215aec3512542c712. [Actual checks](../audit/N06-11-SERVE-CHECKPOINT.json);review `docs/design/vnext/animals-3d/SERVE-ANCHORS-REVISION-1.md`. Original character streams/budgets preserved;controlled loading/heap,final graphics/full scenes/physical still open.

Current prerequisite update: N10-03 native account/tickets VERIFIED at04b1b38 ([checks](../audit/N10-03-NATIVE-CHECKS.json)); creator still needs whole N06-11 acceptance. Technical3D art/full scenes/controlled loading/heap/physical findings remain open. Historical checkpoint paragraphs below keep their original scope.

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

**Depends on:** N06-02, N05-06, N06-06

**Execution scope:** WEB_AND_RESPONSIVE_BROWSER; native follow-up N10-06/N10-04/N11/N14 deferred by owner

**Deliverables**

- Scene-first shell, onboarding, navigation và shared state

**Acceptance / Definition of done**

- Next portal mount shared game-client; không nhúng Next dependencies vào shared package.
- Identity/travel/queue status rõ và không duplicate authoritative state.
- Không full reload/refresh form thủ công để cập nhật critical gameplay.
- Shared shell theo animal/landscape brief N06-06; chưa coi prototype cũ là visual acceptance.
- Web acceptance độc lập với APK/ADB/AVD/iPhone/native orientation; không hạ quality budgets, final-art findings, authority/privacy/accessibility hoặc public release gates. Native scenarios chuyển sang N10-06/N10-04/N11/N14.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm build
- Proposed; implement before claiming execution: pnpm test:ux-core
- Manual scenarios: Desktop/mobile browser flows gồm error/permission/loading và stale events.

**Rollback / recovery:** Feature-flag new shell, retain verified route adapter.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N06-04 — Polish hai vòng chơi Deadline/Maid

**Depends on:** N06-03, N05-04, N06-07, N06-08

**Execution scope:** WEB_AND_RESPONSIVE_BROWSER; native follow-up N10-06/N10-04/N11/N14 deferred by owner

**Deliverables**

- Complete room scenes/animations/sound settings/interactions + first return journey

**Acceptance / Definition of done**

- Ngồi/focus/leave/resume và order/service/reward diễn ra bằng intent validated server.
- Travel giữ identity, report/block ở đúng ngữ cảnh và không mở unsolicited interaction.
- Asset budgets, original/licensed provenance; không giả art approved.
- Animal appearance dùng shared composer; hai cảnh landscape có lighting/props/animation và bản sắc nhất quán theo N06-06.
- Qualify the integrated3D animal/fur/animation web và responsive browser build; old pixel preview cannot replace final web visual acceptance; native physical acceptance is deferred to N10-06/N10-04.
- Web acceptance độc lập với APK/ADB/AVD/iPhone/native orientation; không hạ quality budgets, final-art findings, authority/privacy/accessibility hoặc public release gates. Native scenarios chuyển sang N10-06/N10-04/N11/N14.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm assets:check; pnpm test:integration
- Proposed; implement before claiming execution: pnpm test:ux-core
- Manual scenarios: Browser journey thật và visual QA; responsive network/reconnect states.

**Rollback / recovery:** Roll back new scenes/shell bằng feature flag, keep asset version for old clients.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

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

**Depends on:** N06-03, N06-06, N02-04, N05-06, N06-11

**Execution scope:** WEB_AND_RESPONSIVE_BROWSER; native follow-up N10-06/N10-04/N11/N14 deferred by owner

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
- Owner3D update: shared rigged3D animals, detailed groom/LOD/material/lighting/animation and polished web và responsive browser UI per architecture/07; pixel evidence is historical only.
- Web acceptance độc lập với APK/ADB/AVD/iPhone/native orientation; không hạ quality budgets, final-art findings, authority/privacy/accessibility hoặc public release gates. Native scenarios chuyển sang N10-06/N10-04/N11/N14.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm assets:check; pnpm test:integration; pnpm test:security; pnpm build
- Proposed; implement before claiming execution: pnpm test:avatar-creator (implement before claiming PASS)
- Manual scenarios: Creator→Save→Deadline/Maid→travel/reconnect trên desktop/responsive browser; kiểm seams/anchors/occlusion/animation/missing assets. Native qualification deferred N10-06.

**Rollback / recovery:** Tắt creator mới theo flag, giữ appearance/catalog versions và receipts; v1 projection tương thích, không xóa hoặc reset customization.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N06-08 — Landscape web gameplay shell và accessible fallback; native orientation deferred

**Depends on:** N06-03, N06-06

**Execution scope:** WEB_AND_RESPONSIVE_BROWSER; native follow-up N10-06/N10-04/N11/N14 deferred by owner

**Deliverables**

- Scene-first landscape HUD/dock/drawers dùng chung web/native
- Browser resize/landscape handling; existing native adapter retained with deferred native qualification N10-06
- Portrait recovery layout, DOM controls và safe-area/keyboard handling

**Acceptance / Definition of done**

- Gameplay ngang là layout chính; scene và critical actions không bị sidebar dài hoặc panel bắt buộc che khuất.
- Hai chiều ngang, rotate/resize, Back/background/resume và OS không áp orientation lock không reset visit/match/avatar hoặc duplicate intent.
- Portrait fallback có lời nhắc xoay không chặn report/block/leave/resync; auth/admin forms vẫn usable.
- 740×360,844×390,1280×720,1920×1080 và 360×740 fallback có evidence; viewport browser thực ghi riêng, không nhận là broad device coverage.
- Keyboard/cutout/safe area/tăng chữ/reduced motion và touch/keyboard/screen-reader controls kiểm thật; iOS execution vẫn conditional N14.
- Web acceptance độc lập với APK/ADB/AVD/iPhone/native orientation; không hạ quality budgets, final-art findings, authority/privacy/accessibility hoặc public release gates. Native scenarios chuyển sang N10-06/N10-04/N11/N14.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm build
- Proposed; implement before claiming execution: pnpm test:ux-core (implement before claiming PASS)
- Manual scenarios: Landscape desktop/responsive browser, cả hai chiều ngang/portrait fallback, keyboard/cutout/Back/resume và late network responses.

**Rollback / recovery:** Tắt landscape shell/orientation policy theo flag và cleanup; giữ verified route adapter, room membership và accessible controls.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N06-09 — Animal/landscape visual qualification và asset performance evidence

**Depends on:** N06-04, N06-07, N06-08, N06-11

**Execution scope:** WEB_AND_RESPONSIVE_BROWSER; native follow-up N10-06/N10-04/N11/N14 deferred by owner

**Deliverables**

- Source/asset-revision-bound screenshot/video matrix và visual review rubric
- Provenance ledger, actual frame-time/memory/loading report, preserved failures
- Technical visual acceptance summary, owner art-review status và exact remaining findings

**Acceptance / Definition of done**

- Actual interactive creator và Deadline/Maid có animal appearance đúng layer/pose/hướng; không lấy concept hoặc preview cũ làm bằng chứng.
- Landscape desktop/responsive browser đủ loading/empty/full/queue/offline/reconnect/denied, rotation/keyboard/safe-area/portrait fallback; không giả queue backend đã wiring.
- Hai vòng chơi, avatar Save/Cancel/travel/reconnect và safety giữ authoritative outcome; graphics không khóa report/block/leave.
- Đo asset/frame-time/memory/loading theo budgets khóa trước; giữ failed runs, browser/GPU/OS/source/catalog hashes và coverage limitations.
- Rubric composition/silhouette/animation/lighting/readability/consistency có reviewer và issues; technical QA không thành owner art approval, human usability hoặc retention claim.
- Owner3D update: shared rigged3D animals, detailed groom/LOD/material/lighting/animation and polished web và responsive browser UI per architecture/07; pixel evidence is historical only.
- Web acceptance độc lập với APK/ADB/AVD/iPhone/native orientation; không hạ quality budgets, final-art findings, authority/privacy/accessibility hoặc public release gates. Native scenarios chuyển sang N10-06/N10-04/N11/N14.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm assets:check; pnpm lint; pnpm typecheck; pnpm build
- Proposed; implement before claiming execution: pnpm test:ux-core (implement before claiming PASS); pnpm test:avatar-creator (implement before claiming PASS)
- Manual scenarios: Visual review theo architecture/06-LANDSCAPE-ANIMAL-VISUAL-DIRECTION.md trên desktop và responsive browser; ghi NOT_RUN cho coverage thiếu.

**Rollback / recovery:** Rollback versioned scenes/shell/creator bằng flags và compatible catalog; giữ data và evidence, không hạ thresholds để PASS.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N06-10 — Art direction3D, fur/rig pipeline và budgets trước đo

**Depends on:** N06-06,N06-08 · **Priority:**79 · **Initial:**TODO

Deliverables: brief3D hiện hành, model/groom/material/animation/UI rubric, rendererport/source audit và ADR, provenance/pipeline và budgets có revision trước implementation. Chốt một animal close-up và một phòng đại diện; starter catalog hỗ trợ cat/dog/rabbit và các bộ phận owner yêu cầu.

Acceptance: chuyển pixel sang3D đúng yêu cầu web/mobile; fur có hướng/mật độ/LOD/seams và lighting, không nhận primitive/SVG/concept là final; audit giữ identity/authority/server floor/receipts, locked Android thresholds và v1 selections. Đặt limits mesh/bones/cards/textures/drawcalls/download/shadows/quality tiers và điều kiện measurement riêng, không gán kết quả khi chưa chạy. Quyền asset và owner art review có trạng thái thật.

Verification: review source/model pipeline/ADR/budget/provenance thực và plan validation. Đây là design scope, không tự phát minh PASS3D/physical/human. Rollback: version brief mới, giữ evidence/budgets cũ và renderer fallback. Evidence cần SHA/diff, commands/review outcomes, hashes, limitations và exact next action.

### N06-11 — Shared3D renderer spike, rig/fur và phòng đại diện

**Depends on:** N06-10, N06-08

**Execution scope:** WEB_AND_RESPONSIVE_BROWSER; native follow-up N10-06/N10-04/N11/N14 deferred by owner

**Deliverables**

- Shared renderer3D adapter, rigged animal/fur/material/room technical slice
- Camera/LOD/quality tiers/cache/disposal/context recovery và packaged Android support

**Acceptance / Definition of done**

- Runtime3D có animation/anchors/lighting/LOD/readability và shared web và responsive browser build, không đổi authoritative floor/intent
- Actual browser technical-spike checks/source/asset/GPU hashes; historical AVD evidence retained, native qualification separately deferred to N10-06/N10-04
- Graphics failure/resize/lifecycle/context loss không khóa DOM/safety/leave hoặc ghi đè v1 appearance; placeholder có nhãn
- Web acceptance độc lập với APK/ADB/AVD/iPhone/native orientation; không hạ quality budgets, final-art findings, authority/privacy/accessibility hoặc public release gates. Native scenarios chuyển sang N10-06/N10-04/N11/N14.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm build; pnpm test:client-boundaries; pnpm assets:check
- Proposed; implement before claiming execution: pnpm test:scene3d (implement before claiming PASS)
- Manual scenarios: Actual interactive3D image/video/animation/fur/room and budget review on browser; native device execution deferred

**Rollback / recovery:** Renderer flag/catalog rollback giữ Pixi/v1 data/receipts

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.
