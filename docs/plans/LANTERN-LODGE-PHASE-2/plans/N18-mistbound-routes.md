# N18 — Hải Đồ Sương Mù — hidden-role route game

**Status:** PLAN / TODO · **Lane:** Game Rules + Safety · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Triển khai role/goal bí mật, tile connectivity, clue, winner resolution, tests solvability.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N18-01 — Freeze 7×7 map, connector tiles, hidden factions và objective

**Phụ thuộc:** `N15-02`  
**Đầu ra:**
- Role allocation policy and ruleset v1
- Tile generator/solvability test harness
- Independent hidden-target projection tests

**Nghiệm thu:**
- Phe Sương Mù 1 người khi 4–5, 2 khi 6–8; chỉ current player thấy role.
- Three exits one true target; board geometry and enough solvable turns verified by generator/test.
- No external party art or licensed board designs.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/mistbound-routes.generator.test.ts (planned)`

**Manual review:**
- Pilot paper puzzles; record whether map choices are understandable.

**Rollback/Recovery:** Remove invalid seeds/rules before launch, preserve old ruleset if matches already live.

### N18-02 — Authoritative tile placement, compass và BFS settlement

**Phụ thuộc:** `N18-01`, `N15-04`  
**Đầu ra:**
- Path/rotation reducer with directed N/E/S/W checks
- Compass scan policy, role-bound secret
- Atomic crew/mist victory

**Nghiệm thu:**
- Server alone computes connected route, tile legality and actual treasure goal.
- Concurrent same-cell moves -> one accepted; stale second rejected; invalid moves never decrement hand.
- Role/goal encrypted and never included in public delta until authorized settlement.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/mistbound-routes.integration.test.ts (planned)`

**Manual review:**
- Check one full 4-player and 8-player action trace.

**Rollback/Recovery:** Disable mode, retain compatible match reducer; no destructive ruleset migration.

### N18-03 — UX bản đồ và thao tác xoay thẻ trên web/Android

**Phụ thuộc:** `N18-02`, `N15-05`  
**Đầu ra:**
- 7×7 responsive board, safe tile rotation UI
- Compass and remaining-turn indicators
- Explicit path reachability hints

**Nghiệm thu:**
- Tap-to-select/rotate/confirm, keyboard equivalent; not drag-only.
- Map reveals no secret true exit to crew/spectators even through alt text/test ids.
- Glitches/reconnect maintain tile orientation and turn deadline server-authoritative.

**Verification mới phải triển khai:**
- `pnpm exec playwright test tests/e2e/mistbound-routes.spec.ts (planned)`

**Manual review:**
- Physical Android zoom/pan performance and small-screen usability.

**Rollback/Recovery:** Mode OFF while preserving shared shell and other games.

### N18-04 — Hidden-role anti-cheat, solvability và acceptance

**Phụ thuộc:** `N18-03`, `N15-03`  
**Đầu ra:**
- Role privacy/simulation suite
- Concurrent path/race/restart tests
- Full-match winner cases for both factions

**Nghiệm thu:**
- Generator cannot produce impossible start under defined constraints; document rejected seeds.
- Neither public/spectator/admin stats nor browser secrets reveal target/other player role.
- Both victory paths, abort conditions and tie policy stable with retries/owner loss.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/mistbound-routes.property.test.ts (planned)`
- `pnpm exec playwright test tests/e2e/mistbound-routes.spec.ts (planned)`

**Manual review:**
- Inspect whether accessibility cues reveal roles by accident.

**Rollback/Recovery:** Disable new match starts; existing matches settle under v1 or truthful ABORT.

### N18-05 — Pilot cân bằng phe ẩn và khả năng giải được

**Phụ thuộc:** `N18-04`  
**Đầu ra:**
- Simulation reports with sample counts and seeds
- Human prototype feedback for teamwork/sabotage

**Nghiệm thu:**
- Report role win rate, stale/game length, invalid move frequencies by sample size.
- Do not claim statistically balanced from 1 test run; tune after recorded data.
- Avoid punitive report flow for ordinary permitted bluff/team gameplay.

**Verification mới phải triển khai:**
- `pnpm exec vitest run tests/games/mistbound-routes.simulation.test.ts (planned)`

**Manual review:**
- Moderated 4–8 player pilot; ensure multiple iterations before production.

**Rollback/Recovery:** Keep mode in private preview until balanced enough for agreed product goal.

## Tài liệu tham chiếu

[Game rules](../games/03-HAI-DO-SUONG-MU.md) · [QA](../games/06-CROSS-GAME-QA.md)
