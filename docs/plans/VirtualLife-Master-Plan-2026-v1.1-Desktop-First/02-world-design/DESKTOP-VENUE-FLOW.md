# Walk-in venue experience for native desktop — identity, seats and embedded games

## One coherent physical world
Café, maid café (SFW), arcade, card lounge, Pet Arena are visible/visitable places, not disconnected pages. Every game terminal/table has world-space anchor, local visual UI and an **activity session ID** owned by Rust. Player physically walks to a chair, turns, sits, then enters table/mini-game rules; can stand or exit subject to session policy.

## State machine
`Walking → NearInteractive → HoldSeatRequested → Seated → ActivityInvitation → ActivityInProgress → GameSettling → Seated → StandRequested → Walking`.
- Before seat claim, validate proximity, capacity, permission, duplicate reservations, account revocation. HoldSeat TTL and idempotency key; Rust returns anchor and pose ID; Unity plays move-to-chair/IK/tail settle.
- On timeout/collision/another claimant: show seat unavailable and return to Walking, not a ghost avatar.
- While game in progress, movement disabled/limited by game semantics, never silently leaves authoritative match. There is always explicit `Leave/Forfeit` or owner-safe grace period.
- Card hand private to seat owner via recipient-scoped projection. Viewers see only public animation; web/streamer mode can blur secrets.
- Pet Arena: entry is a world plaza and gates; active combat board overlay or focus camera coexists with player/avatar and Pet animation; match-3 committed swaps resolved exclusively Rust.

## Desktop presentation
Prompt overlays attached to world geometry at stable distance, not jittering. Seamless door with streaming/fade and audio crossfade; cinematic but skippable sit/eat animation; café light warms faces, cards remain readable. If GPU performance degrades, lower character/particle quality while never degrading hit/tap affordances.

## Product QA stories
Two users racing same chair; friend invite at same time as teleport; disconnect during seat acquisition; report/block mid-game; game timer while animation is skipped; seat anchor changed by new content release; hotfix rollback while a player is seated. All must yield one canonical state and an intelligible UI error.
