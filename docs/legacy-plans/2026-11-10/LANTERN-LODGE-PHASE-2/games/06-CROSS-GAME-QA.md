# Acceptance matrix for three modes

**Planned scenarios; all are TODO until executed.** Preserve all existing Mxx/Nxx regression suites, no fixed quotas or safety guard relaxed for tests.

| ID | Scenario | Expected invariant / evidence |
|---|---|---|
| LG-01 | Two players join/ready at one table | exactly two authenticated current room members; no forced join |
| LG-02 | Overbook 6/8 cap | one winner at last slot; no overcapacity; per-table capacity independent of world slot |
| LG-03 | Same account multi-tab/two tables | exactly one active table seat; stale tab cannot act |
| LG-04 | Two commands same expected version | one effective transition; replay returns sanitized same-key outcome |
| LG-05 | Late ACK after logout/account change | old view discarded, no other player's secrets or match ownership |
| LG-06 | Block/ban/travel during active match | policy enforced; leave/forfeit recovered and no hidden leak |
| LG-07 | Missed Socket delta/reconnect | versioned own snapshot restores permitted hand/role; spectator stays redacted |
| LG-08 | Owner restart/DB delay/lock loss | re-admit + recover compatible persisted match or honestly ABORT; no phantom win |
| LG-09 | Migration + rules v1/v2 | existing v1 match uses v1 reducer; rollback only compatible schema/image |
| LG-10 | Spectator forged card IDs and private event subscriptions | zero secrets, zero unauthorized mutations |
| LG-11 | Slow recipient backpressure | bounded queue; no process-wide lock starvation or private cross-recipient fanout |
| LG-12 | Last winner + duplicate reward callback | one game result; no duplicate ledger grant, no unapproved XP for match spam |
| LG-13 | Color total deck conservation / 2-player reverse / wild & glow | all 64 cards accounted; turn and effect deterministic |
| LG-14 | Mask 4-claim cap / correct-incorrect challenge / 72-card conservation | finite round; reveal only last challenged claim; scoring deterministic |
| LG-15 | Routes every tile rotation/connector symmetry/BFS | server checks graph; illegal adjacency rejected; solvability proof for chosen seed model |
| LG-16 | Hidden target/roles in public/logs/metrics/admin | none leaked before or after match outside release policy |
| LG-17 | Touch 360px, keyboard, reduced-motion, color-vision glyphs | critical action reachable with semantic controls, not drag/hover-only |
| LG-18 | One real Android vs desktop user and browser bots | successful mixed-client play, recorded model/OS; no fake iOS/Steam certification |
| LG-19 | Mixed load: 4/8/16/32 concurrent tables staged (max 32 rooms/world in current RoomService) | admitted/rejected/error counts and p95, CPU/DB/network recorded; no capacity claim before measured pass |
| LG-20 | Private safety controls & incident kill switch | mode OFF prevents new starts; existing games follow defined graceful stop, no unreviewed public activation |
| LG-21 | Eight-seat room plus table admission, spectator requests, wrong-room/wildcard joins | No phantom table capacity; room/table cap never exceeded; default spectators OFF; explicit roomId binding |
| LG-22 | Authoritative permission changes *during* delayed database write | Owner loss, block, logout, room leave or expired phase before commit rejects stale action; no late secret or reward |

**Release gates:** A game can become `VERIFIED_LOCAL` without public release. Public staging needs real build/connected tests, art provenance, valid state guards, privacy review, live metrics and incident readiness. Android release needs physical Android tests. Steam is a separate PC wrapper/Steam integration gate; iOS requires actual iOS test; none should block a web-only internal playtest. Feature flags for all three default OFF.

## Performance experiment notes

Document hardware, number of actual tables/players, mix of commands, realistic think time, synthetic clients vs physical devices, accepted/rejected, p50/p95/p99, DB wait, memory, event loop, outbound bytes, CPU per process, cleanup and whether metrics are fresh. Verify correctness separately from speed; an exit-code-zero script with many rejected joins is NOT a passed capacity experiment.

## Human quality evidence

For each mode: at least one moderated session with target players, notes on comprehension/fun/frustration, retention hypothesis and high-frequency confusion points. Do not add a compulsive reward/paid random-purchase loop to compensate for low intrinsic fun. End-of-game rematch and cross-world travel should take few steps, but never skip server policy.
