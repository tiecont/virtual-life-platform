# N16 — Sắc Đèn — color/action card game

**Status:** PLAN / TODO · **Lane:** Game Rules + Experience · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Triển khai 64-card game với glow twist, luật deterministic, UX web/touch và acceptance.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N16-01 — Freeze 64-card deck, Glow và turn rules

**Depends on:** N15-02

**Deliverables**

- ruleset v1 JSON + examples
- Pure unit/property tests for 64-card conservation

**Acceptance / Definition of done**

- Màu/số/action/wild/PIVOT đều có cases positive+negative.
- 2-player REVERSE, final action, recycle draw pile, tie/timeout được xác định.
- Reducer không có infinite turn hoặc âm Glow; no stacking trong v1.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm architecture:check; pnpm governance:check
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/lantern-colors.rules.test.ts (planned)
- Manual scenarios: Playthrough giấy ít nhất 3 biến thể trước freeze.

**Rollback / recovery:** Rule v1 chưa distribute: revert manifest; nếu đã live, giữ v1 active cho matches cũ.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N16-02 — Server reducer Sắc Đèn, receipts và authoritative timer

**Depends on:** N16-01, N15-04

**Deliverables**

- Turn handler + command validation
- Secure shuffle/draw/recycle
- Atomic settlement/result

**Acceptance / Definition of done**

- Không thể đánh card không thuộc hand; old requestId replay không thêm action.
- Server tôn trọng current identity/table/phase/deadline, không dùng client timer.
- Draw + PLAY_DRAWN optional và effects apply đúng một lần, không double winner/XP.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/lantern-colors.integration.test.ts (planned)
- Manual scenarios: Check SQL and emitted own/public views against rules fixture.

**Rollback / recovery:** Flags OFF and compatible reducer retained until old active matches settle.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N16-03 — UI đánh bài web và responsive browser với icon hỗ trợ colorblind

**Depends on:** N16-02, N15-05

**Deliverables**

- Hand/table layout and responsive card actions
- Color modal, Glow indicator, turn prompt

**Acceptance / Definition of done**

- User có thể chọn/lấy/thả bài qua tap/keyboard, không chỉ drag.
- Color luôn đi với chữ/glyph; disabled actions giải thích lý do.
- Delay/reconnect không làm card biến mất trước authoritative ACK.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec playwright test tests/e2e/lantern-colors.spec.ts (planned)
- Manual scenarios: Check desktop and responsive browser; physical native coverage deferred N19-04.

**Rollback / recovery:** Route disabled per game flag; source unchanged for other modes.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N16-04 — Concurrency, security và một ván Sắc Đèn end-to-end

**Depends on:** N16-03, N15-03

**Deliverables**

- Race+privacy+fuzz suites
- Full-game 2-player and 6-player scenarios

**Acceptance / Definition of done**

- 64-card invariant, 2-tab replay, two concurrent turns and timeout pass.
- Spectator/admin/report path không lộ bài, all outcomes 1 winner or explicit ties.
- No regression M06 room/seat, M08 safety, M09 travel, N05 reconnection.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/lantern-colors.fuzz.test.ts (planned); pnpm exec playwright test tests/e2e/lantern-colors.spec.ts (planned)
- Manual scenarios: Inspect evidence frame/action counts/latency; report skipped checks.

**Rollback / recovery:** Disable Sắc Đèn only and abort/recover active matches under explicit policy.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N16-05 — Pilot UX và cân bằng Sắc Đèn

**Depends on:** N16-04

**Deliverables**

- Pilot script, observations, metric instrumentation
- Rules/UX change proposal based on evidence

**Acceptance / Definition of done**

- Recorded feedback from multiple human testers, not only bot pass.
- Mismatch between rule wording and UI fixed or blocked explicitly.
- Any rule balance change increments rulesetVersion rather than mutating old matches.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec playwright test tests/e2e/lantern-colors.spec.ts (planned)
- Manual scenarios: Small supervised human playtest.

**Rollback / recovery:** Keep v1 flag OFF or rollback UI only; preserve game history.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.
