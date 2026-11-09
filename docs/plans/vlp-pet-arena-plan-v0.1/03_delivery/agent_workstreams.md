# Parallel-agent workstreams (non-overlapping ownership)

## Rules
These are independently manageable workstreams, not a request to change the current ongoing VLP agent plan. Keep them in a separate epic or branch until integration review. No two agents edit the same owned directory without approval.

| Agent | Owner focus | Writes to suggested paths | Requires | Main handoff |
|---|---|---|---|---|
| A0 — Contract/Integrator | Repo inspection, interface freeze, feature flags, adapter mapping | `docs/pet-arena/contracts/**` | Existing VLP repo access | Approved contract, module boundaries, ADR |
| A1 — Combat Engine | Deterministic board, skills, damage, replay | `packages/pet-arena-engine/**` | A0 schemas | Pure reducer, fixture replays, property tests |
| A2 — Pet/Content | Pet roster, skill defs, encounters, balance simulation | `packages/pet-arena-content/**` | A0 identifiers; A1 rules draft | Versioned manifests, validation, sim reports |
| A3 — Service | Auth-aware Battle API, persistence, command dedupe | `services/pet-arena/**` | A0 API/event contracts; A1 reduction API | Battle endpoints, ledger, migrations, observability |
| A4 — Client | Board UI, animations, mobile/a11y, Pet Camp shell | `apps/pet-arena/**` or VLP module owned subdir | A0 API; A1 event types; mock service | Playable responsive front end |
| A5 — VLP Bridge / Meta | Profile, inventory, VLP entry, achievements, cosmetics, social adapter | `integrations/pet-arena/**` and agreed service submodule | A0 adapter; A3 ledger | VLP adapters, safe reward outbox, deep links |
| A6 — QA/Release | Test plan, E2E, load/balancing, feature flags/rollout | `tests/pet-arena/**`, CI config via approved owner | S1 implementation | Regression gates, dashboards, rollback |

**Path warning:** Sample paths are boundaries, not assertions about an existing monorepo layout. A0 maps paths to actual repo and edits this ownership table **before coding**.

## Task backlog / dependencies
| ID | Action | Owner | Depends on | Done when |
|---|---|---|---|---|
| PA-001 | Map VLP auth, hub route, profile, social, wallet, storage conventions | A0 | none | integration matrix reviewed |
| PA-002 | Freeze ruleset v1 and event/API contracts | A0+A1 | PA-001 | contract tests pass |
| PA-003 | Build seeded board/init/legal-move resolver | A1 | PA-002 | stable seed fixtures + legal moves |
| PA-004 | Add cascades, skills, HP/barrier, win/end state | A1 | PA-003 | seeded 1000-case tests pass |
| PA-005 | Define 8 Pet species, 6 stages + boss, content validators | A2 | PA-002 | schema, references and sim sweep valid |
| PA-006 | Implement battle service, command idempotency, snapshots | A3 | PA-002, PA-004 | no double turn after retries |
| PA-007 | Build mobile-first battle board and FX renderer | A4 | PA-002 | UI works using mock event stream |
| PA-008 | Implement turn APIs, server enforcement, PvE bot | A3 | PA-005, PA-006 | PvE complete from start to reward |
| PA-009 | Build VLP Game Hub entry/auth bridge | A5 | PA-001 | existing identity respected |
| PA-010 | Pet Camp, teams, persistent progression, cosmetics | A5+A4 | PA-005, PA-009 | refresh/relogin persists |
| PA-011 | Reward ledger and outbox to VLP achievement bridge | A3+A5 | PA-008, PA-009 | exactly-once grant effects |
| PA-012 | Tutorial, first six stages, boss, UX polish | A4+A2 | PA-007, PA-008 | mobile UX smoke + accessibility |
| PA-013 | PvE automated E2E, property/load, telemetry, rollback | A6 | PA-008, PA-011, PA-012 | S1/S2 gates green |
| PA-014 | PvP queue + turn clock + reconnect + surrender | A3+A4 | PA-013 | two live clients settle same hash |
| PA-015 | Rankings + normalization + abuse detection | A3+A5+A6 | PA-014 | no client-authorized reward/rank |
| PA-016 | Phased PvP beta with kill switch + monitoring | A6 | PA-015 | S3 rollout gate approved |

## Handoff requirements
Each agent submits: changed files, contracts touched, examples/payload fixtures, tests run, known issues, migrations/rollback, reviewer notes. A0 is the integration owner; no agent independently changes global VLP balances or wallet contracts.
