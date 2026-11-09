# Copy-ready prompts for parallel agents

Before using any prompt, give the agent the `README.md`, `AGENTS.md`, its workstream section, and access to actual VLP repo. Do not give conflicting file ownership.

## A0 — Integration & contract owner
> Review existing Virtual Life Platform architecture. Do not assume the module/service topology. Map identity, Game Hub entry, wallet, achievements, social, migrations, deployment, and telemetry. Translate `02_architecture/**` into repository-native APIs and freeze v1 schemas, event ordering, version strategy, seed/hash fixtures and owned directory map. Open ADRs for mismatches; do not implement game logic. Deliver integration matrix, approved contracts, feature flags and test fixtures.

## A1 — Deterministic combat engineer
> Implement `01_game_design/combat_v1.md` as pure deterministic engine using A0-approved contracts. Cover board generation, legal swap, match resolution, cascades, specials, skill+swap atomicity, stats/status/element effects, win and replay. Server-only seeded random stream and integer math. Add property tests across ≥1000 seeds and a canonical stateHash fixture. No network, DB, or VLP auth inside engine. Own only engine package.

## A2 — Pet/content/balance engineer
> Implement versioned original Pet catalog (8 species), skill descriptions/config, 6 PvE stages and 1 boss according to the game design spec. Content must be schema-validated and reference existing skill identifiers. Build a simulation tool to estimate duration, win probability, and degenerate combos. Use original art placeholders, never copyrighted Pokiwar or Pokémon designs. Own only content package and its tests.

## A3 — Backend/service engineer
> Implement battle orchestration following approved API and event schema. Server derives actor from existing VLP identity. Serialize commands per battle; apply A1 reducer; persist state/events/command receipts; enforce version, idempotency, ownership, turn timer. Build reward ledger/outbox with retry-safe exactly-once effects. Add metrics, migrations, retries and rollback. PvP endpoints stay feature-flagged until gate S3. Own only service paths.

## A4 — Client/UI engineer
> Implement a responsive mobile-first Arena UI and Pet Camp shell in existing VLP UX patterns. Use mock command/event streams initially, then replace with A3 API. Render event-driven animations without client outcome authority. Support touch/keyboard, glyph+color gems, reduced-motion, turn timer and reconnect state. Deliver tutorial first and keep assets original. Own only client module paths.

## A5 — VLP bridge/meta engineer
> Reuse existing VLP identity, Game Hub routing, social/blocked-user rules and achievement/cosmetic system via a thin adapter. Implement Pet/Team progression persistence, optional VLP profile cosmetic bridge and pending-reward UI. No direct edits to core wallet without review; all grants deduped through outbox. Disable social gracefully and protect user privacy. Coordinate API requirements with A0/A3 but do not edit their files without agreed change.

## A6 — QA/release engineer
> Build E2E, property, replay, API security, accessibility, mobile/performance and reward-idempotency test suites from acceptance matrix. Verify feature flags, degradation paths and rollback instructions. Define S1/S2/S3 go/no-go dashboards. Include two-client PvP desync/reconnect tests only after S1/S2 pass. Own tests/CI-only paths approved by A0.

## Required agent completion report
Report: owner, commit/branch, modified paths, exposed interfaces, test results, performance numbers if measured, schema or migration changes, security/privacy notes, blockers and next dependencies.
