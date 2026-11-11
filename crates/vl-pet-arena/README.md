# Pet Arena Training Content v1

`pet-arena-training` is original developer rules data for VL-043: eight pets,
six sequential PvE stages and the Prism Guardian boss. It uses the existing
`vl-game-core` fixed-point arithmetic, canonical hashing and private seeded RNG.
No production route, asset, reward, wallet or legacy room writer is added.

The canonical content digest is
`90945367c761daebcc4a15506e47f349821f479945cc47fbf85072f7cd0651ac`.
Content drift fails closed. Publish a new content version and reviewed digest
when changing these definitions; a match retains its original content binding.

The 6x6 board has four elements. A legal orthogonal adjacent swap exchanges
different elements and creates a match containing a swapped cell. A board with
an unresolved match rejects further input. Match detection marks all cells in
horizontal/vertical runs of three or more, with cross cells counted once.

Each enemy pattern is announced in the committed state one full player turn
before it resolves. Stage and turn select the pattern; the host's `TurnRng`
selects a row/column in [0,6). The boss cycles row, column, cross. Resolution
must match the complete original intent, stage and turn. Visible warnings are
never permission for a client to select enemy damage or target cells.

Poison lasts three turns; slow and empower last two. Same-kind reapplication
refreshes to the maximum remaining duration/potency without additive stacking.
Poison is applied at turn end before expiry. Slow potency is exactly one action
delay. Cleanse removes negative statuses; empower adds its fixed potency to
attack. Shield absorbs damage before health, and health bottoms at zero.
The fixtures demonstrate 6 poison damage for three ticks (100 -> 82 health),
shield absorption (100 health +20 shield -30 damage -> 90 health), fractional
milli-unit arithmetic, and seeded boss warnings. These are rules contracts;
the combat reducer must enforce their timing and effect ownership in VL-044.

## Combat v1

`combat::Combat` implements the existing `vl-game-core::Reducer`. The trusted
host creates `State::new(pet, stage)` and submits `Start` through core `apply`;
only that transition consumes private entropy to generate a board and warning.
Subsequent actions are `Swap`, `Skill` or `Pass`. No client damage, enemy choice,
seed, clock or outcome field is accepted by this domain interface.

Generation excludes initial runs and retries up to 128 stable boards to obtain
a legal move, then falls back to the authored board. Matches clear simultaneously;
survivors fall in their original order and refill column-first/top-to-bottom from
the private stream. Pass n contributes n times base damage. Each own-element tile
adds one third of attack, each other tile one sixth, with milli-unit truncation
after each pass. After 16 passes, any remaining matches are replaced by a fresh
stable board without extra damage. Stable boards with no legal move regenerate.

Skills use the eight authored contracts: direct strike, bounded healing, poison,
empower, nonstacking shield, one consumed enemy skip, cleanse and shield break.
The skill cooldown is three completed subsequent actions. Enemy row attacks deal
base damage, columns also grant a shield equal to base attack, and boss cross
attacks deal double damage and apply three-turn poison at one third base attack.
Cleared warning cells proportionally mitigate that turn's enemy hit. Effects run
in this order: player action, surviving enemy intent, poison, status expiry,
terminal outcome, next warning. Simultaneous death is a loss. A still-running
match at turn 60 is a loss. New statuses tick/expire on the turn they are applied.

The combat rules digest is separate from the frozen VL-043 content digest:
`457e9ddd981a25b1014314b17bc4e014950d8e19eabf3ec3ec386e2b12aabbfb`.
The private bounded JSON snapshot codec rejects unknown fields, incompatible
rules/format, malformed board/status/warning and invalid terminal state. It is
for the existing host's authenticated checkpoint envelope, not an authenticity
check for client snapshots. No seed is serialized by this codec. Tests restore
the checkpoint, version, entropy cursor, commitment and audit hash in a fresh
process and compare the complete final result with uninterrupted execution.

This domain does not add a persistence owner, network route, consent/admission
policy, settlement proposal or reward. Runtime selection, Unity presentation and
real Pet Arena journal integration are follow-on application work. No paid effects
or client-selected damage are supported. Balance/playtesting, production visuals,
media rights and Unity/Windows qualification remain separate tasks.

Run `cargo test --locked -p vl-pet-arena` for frozen content and replay fixtures,
invalid swap/telegraph cases, fixed-point status examples and boundary checks.
It also runs full matches across all 8 pets/6 stages/4 seeds, skill and AI
contracts, invalid intent/version/seed cases, malformed snapshots, the 60-turn
cap, and frozen full-match restart hashes in an independent process.
