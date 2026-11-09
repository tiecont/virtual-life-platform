# VLP Pet Arena — Design & Agent Delivery Plan v0.1

> Status: **proposal / implementation planning**. Created November 2026. Original, modern game inspired by the *genre and memories* of Pokiwar, **not a 1:1 recreation**.

## Product statement
**VLP Pet Arena** is a quick, strategic, social match-3 pet-battle module inside Virtual Life Platform. In 3–5 minute sessions, players arrange gems, activate abilities, build teams of companions, collect cosmetics, and challenge friends. Persistent identity, friendships, achievements, and optional cosmetic cross-rewards come from VLP.

## Explicit decisions
- The original Pokiwar is inspiration only; no need to recreate original combat rules, numeric balance, assets, names, sprites, or copyrighted creature designs.
- Build an **independently deployable module** with a narrow VLP bridge; existing agents and existing system plans should be unaffected.
- Start with **PvE vertical slice**, add live PvP behind a feature flag only after server-side battle validation and observability are ready.
- Deterministic, pure combat engine. The **server decides** outcomes; clients render animations and may predict locally without authority.
- Fair economy: pay for cosmetics and quality-of-life that does not alter ranked competitive advantage. No loot-box monetization in MVP.
- Specs contain **proposed defaults**, not claims about the actual VLP repository. Agents must inspect current architecture before selecting libraries, database, auth, APIs, or deployment platform.

## Files
1. `00_product/vision_prd.md` — audience, loops, value, success metrics, scope.
2. `01_game_design/combat_v1.md` — concrete MVP rules to avoid agent ambiguity.
3. `01_game_design/pets_and_progression.md` — Pet roster, progression, data content.
4. `01_game_design/modes_social_economy.md` — modes, community, economy, anti-P2W.
5. `02_architecture/module_and_integrations.md` — module boundaries and VLP adapters.
6. `02_architecture/api_events.md` — command/event contracts and security conventions.
7. `contracts/domain-types.ts` — illustrative wire and engine types; not production code.
8. `03_delivery/agent_workstreams.md` — agent ownership, dependencies, handoff.
9. `03_delivery/roadmap_and_gates.md` — implementation milestones and release gates.
10. `03_delivery/acceptance_test_matrix.md` — scenario tests, deterministic and safety tests.
11. `03_delivery/agent_prompts.md` — copy-ready instructions per agent.
12. `03_delivery/decision_log.md` — design decisions and items to verify against the repo.
13. `AGENTS.md` — working rules for parallel agents.

## Delivery sequencing
`A0 contracts` → parallel `A1 combat`, `A2 content`, `A3 service scaffold`, `A4 client shell` → `A5 progression/social/VLP bridge` → `A6 E2E/QA` → PvP beta. Agent labels are **roles**, not assumptions about your existing agent orchestration.

## Launch slices
- **S0 Design lock / contracts:** API/event schemas, seed rules, resource ownership.
- **S1 Playable PvE:** 7×7 grid, one swap/turn, skills, three-pet party, 8 original pets, 6 story stages + 1 boss, onboarding.
- **S2 Persistent VLP experience:** own pet inventory, mission rewards, friendship challenge entry, cosmetic collectibles, analytics.
- **S3 Competitive beta:** server-authoritative PvP 1v1, reconnection, ranked season with stat normalization, event replay/anti-cheat.
- **S4 Optional future:** guild encounters, co-op raids, asynchronous rematches, player housing pet interactions, additional skins.

## Integration disclaimer
No VLP source files or architectural specs were available in this conversation. Contract names and file paths are proposed; do not merge code across unknown repositories without a repository review. Use feature flags and strangler-style adapters.
