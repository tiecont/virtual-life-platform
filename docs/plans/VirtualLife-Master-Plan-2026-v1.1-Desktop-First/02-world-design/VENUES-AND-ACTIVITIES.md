# Venue catalog and rules-first activities

| Venue | World visual actions | Activity rules | Domain authority |
|---|---|---|---|
| Café Lumi | approach door, walk, seat, look at menu, sip/eat, emote | seat lease, menu/order lifecycle, party talk | Rust seats; Nest order/ledger |
| Bellflower Maid Café | SFW welcome, table service, mini service shift | accept role voluntarily, queue/order/check-in, no gameplay reward for click animation | Rust interactions; Nest shift/ledger |
| Starlit Card Lounge / Lantern Lodge | find table, sit, invite, ready, spectate | turn, hidden card visibility, challenge, shuffle and settlement | Rust new game or legacy Nest until safe cutover |
| Pet Arena | run/roll through lobby, inspect pets, stand at battle pad | player-owned PvE/turn/battle, encounter eligibility, rewards | Rust rules + game state; Nest ledger |
| Arcade / puzzle booth | queue/arcade controls, sit on stool | deterministic short minigame + score validation | Rust activity host |
| Academy Hall | run, emote, interact NPC and doors | guided quests, event scheduling | Rust world; Nest catalog/rewards |

## Unified `ActivityHost` contract
- `GameDefinition {kind, rulesetVersion, contentHash, minPlayers,maxPlayers, privacyMode, acceptableSeating, spectatorPolicy}`.
- `CreateSession(tableAnchor, seats, optionalParty)`; `Join/Ready/Start/Leave/Forfeit`, `ExecuteCommand`, `GetSnapshot(viewer)`, `GetResultReceipt`.
- Availability depends on matching authority plus persistent seat ownership and consent; independent client opening game overlay is just view, not session start.
- `GameMode` owns rules, times, score; `Venue` owns capacity and entry; `Table` owns physical seats; `Platform` owns identity/currency. No policy duplicated in client UI.

## Lantern Lodge reuse
Existing Phase2 contains three board games: Lantern Colors (PAWS-like), Mask & Tell (bluff), Mistbound Routes (routes). Reuse the already VERIFIED N15 foundations and privacy constraints, migrate to Rust only after contract/restoration proof. Initial vertical slice may use a simple new practice card game before N16 if owner preserves product sequencing; don't quietly mark N16 completed.

## Future venue design
Data-driven `venue_manifest` has scene assets, POI, capacity, camera presets, seat anchors, activities, required permission, art quality tier and localization strings. Scripts/logic come from reviewed Rust plugins/crates only, no untrusted user-supplied executable code. New venue can add rules engine module, all world interactions remain consistent.
