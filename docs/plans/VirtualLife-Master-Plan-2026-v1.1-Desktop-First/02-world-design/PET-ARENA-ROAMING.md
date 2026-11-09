# Pet Arena evolution — game in a city, not a detached page

## Fantasy
You are a young beast-person trainer who walks into Pet District carrying a tiny companion on your shoulder, visits a Pet Camp, explores a training garden and challenges an arena. A battle transitions into a luminous board (match-3 tactical RPG) integrated with arena 3D: attacks, particles, spectators and pet character expressions reflect canonical Rust event stream. **Not** literal copy of 2014 Pokiwar/Pokémon.

## Player flow
`Plaza → M map or walking → Pet District → Pet Camp → choose lineup → Arena Gate → interact → training instance → board battle → settlement → return to world spawn → pet care / quests`.
- In city: avatar runs/free-roams, emotes, follows group, rests at café. Pets appear as companions visually; near players have deterministic animation and harmless follow spacing; pet companion cannot obstruct other players.
- In PvE board: 6x6 or 7x7 match-3 **proposed for experiment**, 3-Pet team, turns/buffs/status/element, combo, telegraphed opponent, fixed integer dmg and bounded RNG, replay/pause/forfeit.
- In PvP later: seat-like ready consent, spectator public events only, hidden loadout/seed protection, fair matchmaking and rate enforcement; offline/cancel handling.

## Technical boundaries
- Pure Rust reducer; server validated swap adjacency, board match resolution, RNG progression, Pet stats/content hash and encounter version; never trust client damage or combo.
- Battle visual effects play post-ack based on canonical event list (e.g. `GemsMatched`, `SkillTriggered`, `PetDamaged`, `BossTelegraph`, `WinCommitted`). During optimistic preview the UI may animate selection but must reconcile on rejection.
- One game instance/session actor with persisted events/receipts; access via world gate but game domain survives client disconnect according to timeout policy.
- Arena combat viewport uses web 3D/Unity visual scene plus conventional legible board UI; readability > cinematic effects, reduced motion supported. Mobile landscape safe-area and contrast critical.
- Economy outcomes `MatchSettled` + outbox, ledger pending until verified platform inbox. No claim-before-commit.

## MVP content sample (all tentative)
4 elemental families (Solar, Tide, Grove, Volt), 8 starter Pets, 6 PvE stages + 1 boss, 12 status effects max, three training arenas, 8–12 minute tutorial total with 3–5 minute standard battle target. Numeric balance tunable after bots + player sessions; not derived from original Pokiwar.

## Expansion
- Walkable pet park, training obstacle run, pet bonding quests, breeder cosmetics (ethical no loot exploitation), city-wide co-op festival, small arena showmatch.
- Pet Arena standalone instance supports battles with no 3D world rendering as web-lite fallback; 3D showcase never a prerequisite for rules correctness.
- Avoid creating action-combat PvP like Genshin in early versions: a realtime action combat system changes trust, netcode, hitboxes and scope dramatically, requires new ADR.
