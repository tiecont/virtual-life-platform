# N17 — Mặt Nạ — bluff/challenge card game

**Status:** PLAN / TODO · **Lane:** Game Rules + Safety · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Triển khai hidden card claim/challenge, không roulette/súng, giữ bí mật bài và luật timeout rõ.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N17-01 — Freeze face-down claim, challenge and six-round rules

**Depends on:** N15-02

**Deliverables**

- 72-card ruleset v1
- Challenge/trust deterministic examples and unit tests

**Acceptance / Definition of done**

- Exactly 1–2 owned cards per claim, 4-claim max/round, target symbol server-owned.
- Correct/false challenges score exactly once, credibility bounded and no random violence.
- Timeout default trust does not auto-submit an impostor claim; max rounds finite.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm architecture:check; pnpm governance:check
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/mask-and-tell.rules.test.ts (planned)
- Manual scenarios: Test comprehension of claim/challenge wording.

**Rollback / recovery:** Freeze previous ruleset for active matches; do not reinterpret committed claims.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N17-02 — Server sealed claims and confidential reveal projections

**Depends on:** N17-01, N15-04

**Deliverables**

- Own-card sealed claim reducer
- Challenge window/settlement receipt
- Field-level privacy serialization tests

**Acceptance / Definition of done**

- Unchallenged cards never leak, challenged reveal only last claim.
- Two challengers/trust simultaneous -> one effective state transition.
- No user may forge deck content, symbol or owner role, even using old client.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/mask-and-tell.integration.test.ts (planned)
- Manual scenarios: Inspect redacted HTTP/socket/log data from actual test process.

**Rollback / recovery:** Disable mode; retain encrypted matches until safe settlement/abort.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N17-03 — UI lựa chọn Tin/Lật và điểm Uy Tín

**Depends on:** N17-02, N15-05

**Deliverables**

- Claim selector and count
- Challenge modal with stakes and deadline
- Accessible reveal/result

**Acceptance / Definition of done**

- Opponent hand/secret not in browser state, even hidden DOM/data attributes.
- Tap/keyboard handles choice and 1–2 card confirmation.
- Reveal animation mirrors committed transition only; reduced-motion substitute works.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec playwright test tests/e2e/mask-and-tell.spec.ts (planned)
- Manual scenarios: Desktop + responsive browser viewport; native coverage deferred N19-04.

**Rollback / recovery:** Disable UI mode flag, retain backend support for ongoing compatible matches.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N17-04 — Adversarial acceptance Mặt Nạ

**Depends on:** N17-03, N15-03

**Deliverables**

- Three+ player end-to-end scenarios
- Secrets audit under spectator/admin/log paths

**Acceptance / Definition of done**

- One challenge winner/loser, no leak of hidden cards or previous unchallenged claims.
- Timeout, reconnect, account block, host disconnect and stale phase recovery are safe.
- No extra punitive content or gambling progression introduced.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/mask-and-tell.security.test.ts (planned); pnpm exec playwright test tests/e2e/mask-and-tell.spec.ts (planned)
- Manual scenarios: Human review of message tone in deception game.

**Rollback / recovery:** Mode OFF and documented rule-versioned cancellation path.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N17-05 — Pilot social bluff và diễn đạt luật

**Depends on:** N17-04

**Deliverables**

- Pilot findings on tension/fun/comprehension
- Refined UX copy and risk policy

**Acceptance / Definition of done**

- Testers understand exactly whose cards are challenged and what is lost.
- No harassment built into default quick-emote presets; report/block easy.
- Changes to win condition versioned; data not fabricated as measured retention.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec playwright test tests/e2e/mask-and-tell.spec.ts (planned)
- Manual scenarios: Moderated 3–6 player prototype session and anonymized notes.

**Rollback / recovery:** Keep mode in internal pilot / flag OFF if usability or safety issues remain.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.
