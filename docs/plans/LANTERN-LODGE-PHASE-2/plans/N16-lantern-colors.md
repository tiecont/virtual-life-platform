# N16 — Sắc Đèn — color/action card game

**Status:** PLAN / TODO · **Lane:** Game Rules + Experience · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Triển khai 64-card game với glow twist, luật deterministic, UX web/touch và acceptance.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N16-01 — Freeze 64-card deck, Glow và turn rules

**Phụ thuộc:** `N15-02`  
**Đầu ra:**
- ruleset v1 JSON + examples
- Pure unit/property tests for 64-card conservation

**Nghiệm thu:**
- Màu/số/action/wild/PIVOT đều có cases positive+negative.
- 2-player REVERSE, final action, recycle draw pile, tie/timeout được xác định.
- Reducer không có infinite turn hoặc âm Glow; no stacking trong v1.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/lantern-colors.rules.test.ts (planned)`

**Manual review:**
- Playthrough giấy ít nhất 3 biến thể trước freeze.

**Rollback/Recovery:** Rule v1 chưa distribute: revert manifest; nếu đã live, giữ v1 active cho matches cũ.

### N16-02 — Server reducer Sắc Đèn, receipts và authoritative timer

**Phụ thuộc:** `N16-01`, `N15-04`  
**Đầu ra:**
- Turn handler + command validation
- Secure shuffle/draw/recycle
- Atomic settlement/result

**Nghiệm thu:**
- Không thể đánh card không thuộc hand; old requestId replay không thêm action.
- Server tôn trọng current identity/table/phase/deadline, không dùng client timer.
- Draw + PLAY_DRAWN optional và effects apply đúng một lần, không double winner/XP.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/lantern-colors.integration.test.ts (planned)`

**Manual review:**
- Check SQL and emitted own/public views against rules fixture.

**Rollback/Recovery:** Flags OFF and compatible reducer retained until old active matches settle.

### N16-03 — UI đánh bài web/Android với icon hỗ trợ colorblind

**Phụ thuộc:** `N16-02`, `N15-05`  
**Đầu ra:**
- Hand/table layout and responsive card actions
- Color modal, Glow indicator, turn prompt

**Nghiệm thu:**
- User có thể chọn/lấy/thả bài qua tap/keyboard, không chỉ drag.
- Color luôn đi với chữ/glyph; disabled actions giải thích lý do.
- Delay/reconnect không làm card biến mất trước authoritative ACK.

**Verification mới phải triển khai:**
- `pnpm exec playwright test tests/e2e/lantern-colors.spec.ts (planned)`

**Manual review:**
- Check one physical Android + desktop browser after available; no iPhone claim.

**Rollback/Recovery:** Route disabled per game flag; source unchanged for other modes.

### N16-04 — Concurrency, security và một ván Sắc Đèn end-to-end

**Phụ thuộc:** `N16-03`, `N15-03`  
**Đầu ra:**
- Race+privacy+fuzz suites
- Full-game 2-player and 6-player scenarios

**Nghiệm thu:**
- 64-card invariant, 2-tab replay, two concurrent turns and timeout pass.
- Spectator/admin/report path không lộ bài, all outcomes 1 winner or explicit ties.
- No regression M06 room/seat, M08 safety, M09 travel, N05 reconnection.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/lantern-colors.fuzz.test.ts (planned)`
- `pnpm exec playwright test tests/e2e/lantern-colors.spec.ts (planned)`

**Manual review:**
- Inspect evidence frame/action counts/latency; report skipped checks.

**Rollback/Recovery:** Disable Sắc Đèn only and abort/recover active matches under explicit policy.

### N16-05 — Pilot UX và cân bằng Sắc Đèn

**Phụ thuộc:** `N16-04`  
**Đầu ra:**
- Pilot script, observations, metric instrumentation
- Rules/UX change proposal based on evidence

**Nghiệm thu:**
- Recorded feedback from multiple human testers, not only bot pass.
- Mismatch between rule wording and UI fixed or blocked explicitly.
- Any rule balance change increments rulesetVersion rather than mutating old matches.

**Verification mới phải triển khai:**
- `pnpm exec playwright test tests/e2e/lantern-colors.spec.ts (planned)`

**Manual review:**
- Small supervised human playtest.

**Rollback/Recovery:** Keep v1 flag OFF or rollback UI only; preserve game history.

## Tài liệu tham chiếu

[Game rules](../games/01-SAC-DEN.md) · [QA](../games/06-CROSS-GAME-QA.md)
