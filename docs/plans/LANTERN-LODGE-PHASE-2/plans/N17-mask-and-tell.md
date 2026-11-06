# N17 — Mặt Nạ — bluff/challenge card game

**Status:** PLAN / TODO · **Lane:** Game Rules + Safety · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Triển khai hidden card claim/challenge, không roulette/súng, giữ bí mật bài và luật timeout rõ.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N17-01 — Freeze face-down claim, challenge and six-round rules

**Phụ thuộc:** `N15-02`  
**Đầu ra:**
- 72-card ruleset v1
- Challenge/trust deterministic examples and unit tests

**Nghiệm thu:**
- Exactly 1–2 owned cards per claim, 4-claim max/round, target symbol server-owned.
- Correct/false challenges score exactly once, credibility bounded and no random violence.
- Timeout default trust does not auto-submit an impostor claim; max rounds finite.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/mask-and-tell.rules.test.ts (planned)`

**Manual review:**
- Test comprehension of claim/challenge wording.

**Rollback/Recovery:** Freeze previous ruleset for active matches; do not reinterpret committed claims.

### N17-02 — Server sealed claims and confidential reveal projections

**Phụ thuộc:** `N17-01`, `N15-04`  
**Đầu ra:**
- Own-card sealed claim reducer
- Challenge window/settlement receipt
- Field-level privacy serialization tests

**Nghiệm thu:**
- Unchallenged cards never leak, challenged reveal only last claim.
- Two challengers/trust simultaneous -> one effective state transition.
- No user may forge deck content, symbol or owner role, even using old client.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/mask-and-tell.integration.test.ts (planned)`

**Manual review:**
- Inspect redacted HTTP/socket/log data from actual test process.

**Rollback/Recovery:** Disable mode; retain encrypted matches until safe settlement/abort.

### N17-03 — UI lựa chọn Tin/Lật và điểm Uy Tín

**Phụ thuộc:** `N17-02`, `N15-05`  
**Đầu ra:**
- Claim selector and count
- Challenge modal with stakes and deadline
- Accessible reveal/result

**Nghiệm thu:**
- Opponent hand/secret not in browser state, even hidden DOM/data attributes.
- Tap/keyboard handles choice and 1–2 card confirmation.
- Reveal animation mirrors committed transition only; reduced-motion substitute works.

**Verification mới phải triển khai:**
- `pnpm exec playwright test tests/e2e/mask-and-tell.spec.ts (planned)`

**Manual review:**
- Desktop + physical Android viewport where available.

**Rollback/Recovery:** Disable UI mode flag, retain backend support for ongoing compatible matches.

### N17-04 — Adversarial acceptance Mặt Nạ

**Phụ thuộc:** `N17-03`, `N15-03`  
**Đầu ra:**
- Three+ player end-to-end scenarios
- Secrets audit under spectator/admin/log paths

**Nghiệm thu:**
- One challenge winner/loser, no leak of hidden cards or previous unchallenged claims.
- Timeout, reconnect, account block, host disconnect and stale phase recovery are safe.
- No extra punitive content or gambling progression introduced.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/mask-and-tell.security.test.ts (planned)`
- `pnpm exec playwright test tests/e2e/mask-and-tell.spec.ts (planned)`

**Manual review:**
- Human review of message tone in deception game.

**Rollback/Recovery:** Mode OFF and documented rule-versioned cancellation path.

### N17-05 — Pilot social bluff và diễn đạt luật

**Phụ thuộc:** `N17-04`  
**Đầu ra:**
- Pilot findings on tension/fun/comprehension
- Refined UX copy and risk policy

**Nghiệm thu:**
- Testers understand exactly whose cards are challenged and what is lost.
- No harassment built into default quick-emote presets; report/block easy.
- Changes to win condition versioned; data not fabricated as measured retention.

**Verification mới phải triển khai:**
- `pnpm exec playwright test tests/e2e/mask-and-tell.spec.ts (planned)`

**Manual review:**
- Moderated 3–6 player prototype session and anonymized notes.

**Rollback/Recovery:** Keep mode in internal pilot / flag OFF if usability or safety issues remain.

## Tài liệu tham chiếu

[Game rules](../games/02-MAT-NA.md) · [IP/Safety](../games/07-IP-CONTENT-DECISIONS.md)
