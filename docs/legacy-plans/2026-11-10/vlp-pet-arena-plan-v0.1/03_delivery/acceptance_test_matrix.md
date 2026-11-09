# Test & acceptance matrix

## Engine invariants
| Test | Input / stimulus | Expected result |
|---|---|---|
| Initialization | 1000 seeds | 7×7 board, no initial auto-matches, ≥1 legal swap |
| Repeatability | same seed/config/commands in two runs | identical ordered events and state hashes |
| Seed divergence | distinct seeds | diverse yet always valid board states |
| Invalid move | nonadjacent/empty/nonmatching swap | 4xx domain response, unchanged turn/version |
| Cascades | 1000 randomized legal moves | terminate within safety cap, no missing cells |
| Special gems | 4 and 5+ matches | deterministic spawn/trigger and matching replay |
| Skill validation | insufficient mana/cooldown | command rejected; no cost deducted |
| Skill + swap atomicity | board transform makes swap invalid | skill not spent, state unchanged |
| Combat bounds | low/high stats, barrier/HP limits | no negatives/overflow; caps applied |
| Win/tie | all Pets faint; turn cap | stable outcome, one terminal event |
| Timeouts | expired PvP turn / disconnect | one authoritative timeout/forfeit handling |
| Reordered turns | old expectedVersion | 409 and current canonical snapshot |
| Duplicate commands | same `(battleId, actorId, commandId)` repeatedly | same receipt; one event batch |
| Replay privacy | PvP snapshot midfight | no hidden seed/PRNG future state exposed |

## APIs, rewards and VLP integration
| Test | Stimulus | Expected result |
|---|---|---|
| Ownership | user tries another player's battle/team | forbidden and not leaked |
| Auth | expired VLP token | current auth policy used; no silent guest mutation |
| Reward duplicates | repeat battle-final webhook/outbox delivery | only one effective grant per reward key |
| Reward outages | VLP achievement bridge down | pending ledger survives retry and eventual commit |
| Session resume | client drops mid-PvE | latest snapshot + events, no duplicated action |
| Client tampering | crafted damage/XP/grant packet | ignored/rejected, server authoritative |
| Social privacy | blocked user sends challenge | blocked under existing VLP rules |
| Fallback | PvP disabled | PvE remains available and UI clearly informs |
| Upgrade | content/ruleset changed during battle | active battle pinned to original version |

## UI, experience, accessibility
- Keyboard and touch move input; no mandatory drag precision; focus indicators.
- Every gem type identifiable by glyph and shape without color, mobile contrast and scalable text.
- Reduced-motion mode for cascades/skill effects, alternative text for status icons.
- Min 320 px logical viewport responsive smoke; test mid-tier Android and desktop.
- Onboarding/new player: first valid match clear, visible feedback, Pet skill explanation.
- Baseline telemetry: start, abandon, finish, turn timeout, error, reward pending/commit and match duration; no excessive user profiling.

## Balancing simulations
- Generate representative level/equipment teams for all 8 Pets over random seeds; report median and p90 turns, basic win rates.
- Detect unwinnable stage opening, dominant auto-win strategy, infinite shield or heal loops.
- PvP normalized matches: no roster-exclusive power advantage; target fair first-pick baseline and no reliable first-turn guaranteed knockout.

## Sample manual exploratory checklist
1. Enter VLP hub, play with fresh identity, finish tutorial.
2. Start battle, cast skill + swap, observe ordered VFX and server state.
3. Disconnect immediately after command submission, reconnect, verify no extra move.
4. Win boss, reload, verify exactly one reward and preserved Pet progression.
5. Open game with blocked/invited users, check privacy route.
6. Enable reduced-motion and keyboard-only navigation, finish a match.
