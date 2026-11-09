# N18 — Hải Đồ Sương Mù — hidden-role route game

**Status:** PLAN / TODO · **Lane:** Game Rules + Safety · **Dependency DAG:** [PLAN-MANIFEST.json](../PLAN-MANIFEST.json)

**Mục tiêu:** Triển khai role/goal bí mật, tile connectivity, clue, winner resolution, tests solvability.

Các task dưới đây cần source audit, implementation và evidence thật. Kịch bản planned là **lệnh chưa tồn tại**; agent phải tạo test trước rồi mới chạy, không ghi PASS từ tài liệu.

### N18-01 — Freeze 7×7 map, connector tiles, hidden factions và objective

**Depends on:** N15-02

**Deliverables**

- Role allocation policy and ruleset v1
- Tile generator/solvability test harness
- Independent hidden-target projection tests

**Acceptance / Definition of done**

- Phe Sương Mù 1 người khi 4–5, 2 khi 6–8; chỉ current player thấy role.
- Three exits one true target; board geometry and enough solvable turns verified by generator/test.
- No external party art or licensed board designs.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm architecture:check; pnpm governance:check
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/mistbound-routes.generator.test.ts (planned)
- Manual scenarios: Pilot paper puzzles; record whether map choices are understandable.

**Rollback / recovery:** Remove invalid seeds/rules before launch, preserve old ruleset if matches already live.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N18-02 — Authoritative tile placement, compass và BFS settlement

**Depends on:** N18-01, N15-04

**Deliverables**

- Path/rotation reducer with directed N/E/S/W checks
- Compass scan policy, role-bound secret
- Atomic crew/mist victory

**Acceptance / Definition of done**

- Server alone computes connected route, tile legality and actual treasure goal.
- Concurrent same-cell moves -> one accepted; stale second rejected; invalid moves never decrement hand.
- Role/goal encrypted and never included in public delta until authorized settlement.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/mistbound-routes.integration.test.ts (planned)
- Manual scenarios: Check one full 4-player and 8-player action trace.

**Rollback / recovery:** Disable mode, retain compatible match reducer; no destructive ruleset migration.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N18-03 — UX bản đồ và thao tác xoay thẻ trên web và responsive browser

**Depends on:** N18-02, N15-05

**Deliverables**

- 7×7 responsive board, safe tile rotation UI
- Compass and remaining-turn indicators
- Explicit path reachability hints

**Acceptance / Definition of done**

- Tap-to-select/rotate/confirm, keyboard equivalent; not drag-only.
- Map reveals no secret true exit to crew/spectators even through alt text/test ids.
- Glitches/reconnect maintain tile orientation and turn deadline server-authoritative.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec playwright test tests/e2e/mistbound-routes.spec.ts (planned)
- Manual scenarios: Browser zoom/pan performance and small viewport usability; native performance deferred N19-04.

**Rollback / recovery:** Mode OFF while preserving shared shell and other games.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N18-04 — Hidden-role anti-cheat, solvability và acceptance

**Depends on:** N18-03, N15-03

**Deliverables**

- Role privacy/simulation suite
- Concurrent path/race/restart tests
- Full-match winner cases for both factions

**Acceptance / Definition of done**

- Generator cannot produce impossible start under defined constraints; document rejected seeds.
- Neither public/spectator/admin stats nor browser secrets reveal target/other player role.
- Both victory paths, abort conditions and tie policy stable with retries/owner loss.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/mistbound-routes.property.test.ts (planned); pnpm exec playwright test tests/e2e/mistbound-routes.spec.ts (planned)
- Manual scenarios: Inspect whether accessibility cues reveal roles by accident.

**Rollback / recovery:** Disable new match starts; existing matches settle under v1 or truthful ABORT.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.

### N18-05 — Pilot cân bằng phe ẩn và khả năng giải được

**Depends on:** N18-04

**Deliverables**

- Simulation reports with sample counts and seeds
- Human prototype feedback for teamwork/sabotage

**Acceptance / Definition of done**

- Report role win rate, stale/game length, invalid move frequencies by sample size.
- Do not claim statistically balanced from 1 test run; tune after recorded data.
- Avoid punitive report flow for ordinary permitted bluff/team gameplay.
- Current execution scope is web/responsive browser. Native Android/iOS implementation and device checks are deferred; no web feature acceptance depends on N19-04/N10/N11/N14. Supported/distributed native clients still require compatibility gates.

**Verification — run actual commands; never infer PASS from this plan**

- Existing commands: pnpm lint; pnpm typecheck; pnpm test:integration; pnpm build
- Proposed; implement before claiming execution: pnpm exec vitest run tests/games/mistbound-routes.simulation.test.ts (planned)
- Manual scenarios: Moderated 4–8 player pilot; ensure multiple iterations before production.

**Rollback / recovery:** Keep mode in private preview until balanced enough for agreed product goal.

**Required evidence:** source SHA/diff hash, environment, commands/exits, artifacts/hashes, failures, limitations and exact next action.
