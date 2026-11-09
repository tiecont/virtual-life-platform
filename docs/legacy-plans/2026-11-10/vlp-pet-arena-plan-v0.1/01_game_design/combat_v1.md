# Combat v1 — proposed deterministic rules for implementation

> This is a **new 2026 ruleset**, not a claim about Pokiwar's historical rules. Exact values are starting balance knobs and must be playtested.

## Match format
- Each side fields **3 Pets** (1 active, 2 reserves/supports). Swap active Pet instead of a match as a full turn action, at most once every 2 turns. Support passives may apply while on bench; healing and damage affect active Pet by default.
- Board 7x7; swaps are orthogonal adjacent. One valid swap is a full action; valid if it yields at least one 3+ line. Invalid move does not consume a turn and returns authoritative state.
- Alternate player and enemy turns in PvE; alternate player turns in PvP. Animation resolves atomically as server-generated events.
- PvE AI: heuristic one-move search over available swaps; enemy skills through same engine. Limit PvE boss scripting to rule-defined actions.
- PvP: 20-second timer per turn, 12 turns per player cap; disconnect grace 45 seconds, then forfeit. These are tunable match settings.
- End condition: all 3 Pets faint, surrender, time/turn cap. Cap tie-break: number of surviving Pets → sum of % remaining HP → engine-determined draw.

## Gem taxonomy
| Gem | Icon semantic | Match effect (baseline) |
|---|---|---|
| STRIKE | sword | Damage to enemy active Pet |
| GUARD | shield | Gain temporary barrier |
| FOCUS | star | Gain mana for active Pet skill |
| VITALITY | heart | Restore active Pet HP |
| SPARK | bolt | Gain charge toward active Pet element proc |

- Match 3+ in a horizontal/vertical straight line. Cascades apply after refilling blanks from seeded PRNG.
- For each cascade depth `d` starting at 1, multiplier `min(1 + 0.2*(d-1), 1.8)`; cascade depth capped at 8, after which board is regenerated using same seed stream and a system warning event (safety cap).
- Match 4 creates a deterministic line-clearing special gem in a position chosen by documented rules; 5+ creates a burst gem. Special gem creation never creates extra turns.
- One active Pet skill can be cast **before the swap**, if mana and cooldown permit. Skill/board transformations apply before swap validation; mana is spent atomically with a successful turn command. Provide preview of whether cast+swap is valid.
- Board initialization must contain no immediate 3+ matches and at least one legal swap. Reshuffle when no moves, no extra punishment.

## Tunable example effects (v1 targets)
To avoid different agents inventing different formulas, store as a versioned JSON balance config:
- STRIKE: damage base = `floor(gemsMatched * active.attack * 0.26 * cascadeMultiplier * elementMultiplier * 100/(100+target.defense))`; never below 1 when >0 gems and attack.
- GUARD: barrier = `floor(gemsMatched * active.defense * 0.18 * cascadeMultiplier)`; accumulated barrier capped at 35% active max HP; barrier decays 25% at start of owner's next turn.
- FOCUS: +1 mana per gem, mana max 12.
- VITALITY: heal = `floor(gemsMatched * active.maxHp * 0.035 * cascadeMultiplier)`; capped by max HP.
- SPARK: +1 elemental charge/gem; at 6 charge, trigger active Pet element passive, consume 6 charge, retain excess.
- Element graph: **Ember > Grove > Tide > Ember** (advantage x1.15; disadvantage x0.90); **Aether** neutral (x1.00). Element uses attacker's active Pet vs defender's active Pet.
- One turn's total direct damage cap = 35% enemy active Pet maxHp in PvP only, excluding status effects; baseline balance guardrail, tune in playtest.
- Status: `BURN` 2 turns (damage over time capped), `ROOT` 1 turn (disables Pet swap, not board match), `WARD` absorption; no stun-lock in MVP.

## Ordering (canonical engine event steps)
1. Validate battle id, actor, turn number, expected state version, cooldown/mana and proposed adjacent swap.
2. Apply allowed pre-swap skill effect on copy of state; validate swap against the resulting board.
3. Commit skill resource costs, apply swap, resolve matches/cascades deterministically, create special gems.
4. Aggregate resources/damage/healing in documented order: barrier → damage → heal → mana/charge → elemental procs → status ticks/end-of-turn effects.
5. Check defeat, forced active swap, win/tie rules; advance turn and persist state hash and event batch.
6. Return canonical snapshot/event envelope to both clients; no client-calculated reward in persistence.

## Determinism
- Use integer or fixed-point arithmetic only. No JavaScript `Math.random()` inside battle state transitions.
- Canonical `rulesetVersion`, seeded PRNG stream, stable sort/match traversal, stable JSON/event serialization.
- Server issues seed and **does not reveal future RNG state during competitive battle**. Snapshots expose visible board only.
- Given initial snapshot + ruleset version + ordered commands + seed, replay must produce identical state hashes cross-runtime.
- Use actor/command nonce and optimistic `expectedVersion` to reject/replay duplicates, not double-resolve.

## Sample player skill archetypes
- Ember striker: spend 6 mana → add +25% next STRIKE damage this turn, inflict 1 BURN.
- Grove guardian: spend 5 mana → barrier +15% maxHp, cure BURN.
- Tide healer: spend 6 mana → heal active 12% maxHp, bonus +3% per VITALITY line this turn.
- Aether trickster: spend 7 mana → convert 2 nonmatching board gems to FOCUS by seeded selection; must still do a valid swap.

## Edge rules
- Skill that heals cannot revive a fainted Pet; revive content not in MVP.
- Overshield and overmana clamp; no negative HP or soft locks.
- Status tick order is tested at turn boundary. If active Pet faints mid-combo, remaining effects still resolve against active party according to documented target rules; win check occurs after full cascade batch.
- An interrupted websocket acknowledgement cannot execute a duplicate turn (idempotency key).
