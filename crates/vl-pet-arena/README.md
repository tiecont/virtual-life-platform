# Pet Arena Training Content v1

`pet-arena-training` is original developer rules data for VL-043: eight pets,
six sequential PvE stages and the Prism Guardian boss. It uses the existing
`vl-game-core` fixed-point arithmetic, canonical hashing and private seeded RNG.
No production route, asset, reward, wallet or legacy room writer is added.

The canonical content digest is
`df54caf234f947b678a5e924dc57fa9ec0357c3eb00ef45adc0c69e4e4fa308a`.
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

VL-044 implements playable board generation/refill, at most 16 cascade passes,
combo/skill execution, deterministic dead-board handling, enemy AI and terminal
outcome/restart integration. Matches cap at 60 turns; v1 ends a still-running
match as a loss at that cap. Full combat and balance/playtesting remain pending.
No paid effects or client-selected damage are supported. Production visuals,
media rights and Unity/Windows qualification are separate tasks.

Run `cargo test --locked -p vl-pet-arena` for frozen content and replay fixtures,
invalid swap/telegraph cases, fixed-point status examples and boundary checks.
