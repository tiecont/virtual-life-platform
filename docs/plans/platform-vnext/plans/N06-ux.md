# N06 — UI/UX và playable vertical slice

**Owner lane:** Experience  
**Activation:** active · **Implementation:** TODO  
**Goal:** Chuyển từ giao diện kiểm chứng nền tảng thành game social 2D đẹp, rõ, dễ trở lại, có kiểm tra usability.

## Phạm vi file dự kiến

- `apps/portal-web/*`
- `packages/game-client/*`
- `packages/ui/*`
- `packages/pixi-scene/*`
- `packages/*-world/*`

Path mới là đề xuất, không chứng minh source đã tồn tại. Đọc source tại HEAD và consumers trước khi áp dụng cấu trúc đích. Chỉ coordinator thay shared contracts/migration numbers/composition roots khi nhiều agent làm song song.

## Đọc trước

- [Master](../MASTER-AGENT-PLAN.md)
- [Kiến trúc tổng](../architecture/00-PLATFORM-ARCHITECTURE.md)
- [Quality gates](../QUALITY-GATES.md)
- [Contract registry](../contracts/CONTRACT-REGISTRY.md)
- [Task state](../state/task-state.json)

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

**Depends on:** N06-02, N10-02, N05-06  
**Trạng thái ban đầu:** TODO  
**Priority:** 82

**Deliverables**

- Scene-first shell, onboarding, navigation và shared state

**Acceptance / Definition of done**

- Next portal mount shared game-client; không nhúng Next dependencies vào shared package.
- Identity/travel/queue status rõ và không duplicate authoritative state.
- Không full reload/refresh form thủ công để cập nhật critical gameplay.

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

**Depends on:** N06-03, N05-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 83

**Deliverables**

- Complete room scenes/animations/sound settings/interactions + first return journey

**Acceptance / Definition of done**

- Ngồi/focus/leave/resume và order/service/reward diễn ra bằng intent validated server.
- Travel giữ identity, report/block ở đúng ngữ cảnh và không mở unsolicited interaction.
- Asset budgets, original/licensed provenance; không giả art approved.

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

**Depends on:** N06-04  
**Trạng thái ban đầu:** TODO  
**Priority:** 84

**Deliverables**

- Usability observations, a11y report, privacy-aware activation/return event spec

**Acceptance / Definition of done**

- Tối thiểu 5 target users do owner cung cấp: heuristic >=4/5 bắt đầu activity trong90s không hướng dẫn từng bước; report failures.
- Keyboard/touch/screenreader core tasks, reduced motion, no focus traps.
- D1/D7 retention chỉ đo sau có user/cohort đủ và consent; không dùng synthetic tests chứng minh hay/giữ chân.

**Verification**

Scripts/commands đã tồn tại ở baseline (xác minh lại tại HEAD):

- `pnpm ci:browser`

Tên verification đề xuất; phải implement trước khi chạy hoặc đánh pass:

- `pnpm test:ux-core`

Scenario / evidence:

- Physical usability là lane riêng; chưa có testers => ghi blocker, không tự gửi lời mời.

**Rollback / recovery:** Tắt analytics không consent; iterate UX theo findings không đổi backend authority.

**Required evidence:** source SHA/diff hash, môi trường, lệnh + exit code, acceptance từng mục, artifact refs/hash, limitations, exact next action. Không lưu secrets; không gọi kết quả lịch sử là fresh verification.

