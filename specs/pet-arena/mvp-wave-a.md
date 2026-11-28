# Pet Arena — MVP Wave A

Release state: **OFFLINE_ONLY / NO_GO_PUBLIC**. Wave A is a development program,
not a public-release approval. No purchase, signing, production publication,
credential exposure or destructive migration is authorized by this document.

## Program

Wave A targets milestones **M0–M2** and integrates toward **M3**:

- **M0** — one 8x8 ruleset boundary, canonical roster, explicit deferred scope.
- **M1** — executable 8x8 combat and the first complete Artifact progression loop.
- **M2** — Icarus/reusable morphology, Fire and Water arena foundations, audio/VFX.
- **M3** — one integrated local loop through restart recovery.

M4 (full 55-Pet/six-map content), M5 (human playtesting/balance) and M6 (Windows
qualification and closed-beta readiness) remain distinct gates. Source or CI
acceptance does not close an art, hardware, rights or release gate.

## Authority and compatibility

### Canonical authority precedence

Active implementation and acceptance follow this strict precedence order:

1. **Latest owner-approved gameplay decisions** (including the Wave D4 15-second server-authoritative turn timer, explicit End Turn voluntary pass, uncapped combat turns with no maximum-round/maximum-turn automatic defeat, removal of player-facing auto-battle and pause, `x1/x2` presentation-only speed, `x2`–`x8` progressive tile multipliers, individual per-Pet resources with zero team Rage, and the R02 four-resource wallet with atomic 1:1 Diamond → Luminous Stone conversion).
2. **Current canonical gameplay specifications** (`mvp-wave-a.md`, `wave-b-owner-decisions.md`, `wave-c2-arena8-contract.md`, and the database-published `CoopConfig` bundle validated by `aetheria-game-runtime --check-gameplay-config`).
3. **Historical specifications retained for compatibility** (`v2.md`, `v3.1.md`, Wave 1 6x6, and historical `arena8-coop-v1` / `arena8-coop-v2` bundles with `turnTimeoutMs: 60000` and `maxRounds: 40`), which govern existing replays, journals and pinned active matches only.
4. **Visual references** (the owner's cinematic design kit R01–R05), which define the binding player-facing visual design system, iconography, color relationships and composition, but never override authoritative gameplay rules or activate deferred content.

The target gameplay authority is Rust. Wave A adds versioned **8x8** rulesets (`aetheria-pet-arena-arena8`, `arena8-coop-pve`, and `arena8-functional-pve`), with **`arena8-coop-v3` (`schemaVersion: 4`)** serving as the active timed, uncapped functional-board contract (`turnTimeoutMs: 15000`, `maxRounds: null`).

The existing native V1 6x6 reducer and its fixtures are frozen. The existing
action-based Wave 1 campaign API is also a frozen local compatibility slice; it
is not reinterpreted as 8x8 and its committed receipts remain valid. New code
must not change historical rules hashes, replay bytes, migration checksums or
completed match state.

Unity and API clients may submit bounded commands only. They never choose RNG,
board refill values, damage, outcomes, rewards or Artifact drops. The server
owns entropy, the loadout snapshot, settlement and idempotent receipts.

## 8x8 tactical board

- Exactly **64 cells** in eight rows and eight columns.
- The active product uses six functional tile identities across every Pet and map. Fire, Water, Electric, Ghost, Ground and Light are **Pet elements**. The originally shipped Wave A elemental board remains a separate version for saved matches and replay.
- Deterministic seeded initialization; no starting match and at least one legal move.
- Orthogonal swaps of adjacent, different tiles; a move is valid only if it
  creates a match. Invalid swaps are rejected without mutating state.
- Match-3 detection in rows and columns, deterministic clear, gravity/refill and
  bounded cascades. Dead boards recover through a bounded deterministic routine.
- HP, defense, individual Mana, individual Rage and skill cooldowns (zero team Rage). Every authored skill is available from Pet Lv1 subject to its legitimate resource cost and cooldown; there is no level-based skill unlocking. Normal attacks, shared skills, Signature, Ultimate (displayed only when the Pet has an authored Ultimate) and Guard follow the committed skill definitions; passive abilities are displayed as non-castable indicators.
- Every player turn lasts a maximum of **15,000 ms** (`turnTimeoutMs: 15000`), enforced by a durable server-authoritative deadline persisted across reconnects and runtime restarts. The active participant may submit **End Turn** as an explicit voluntary pass (granting zero free resources and never acting as Guard). Unused turns expire automatically without performing any automated swap, skill or Guard.
- Active `arena8-coop-v3` matches have **no maximum-round or maximum-turn automatic combat defeat** (`maxRounds: null`); combat continues until all party combatants fall or the opponent/Boss HP reaches zero. Bounded simulations report evaluation-budget exhaustion as `unresolved` (censored), never as a combat defeat.
- Player-facing **auto-battle** and **gameplay pause** are prohibited. The **`x1 / x2`** control adjusts client presentation speed only and never alters server deadlines, RNG, damage, resources or settlement.
- Progressive board multipliers support **`x2` through `x8`** (with `x7` at turn 37 and `x8` at turn 42 evaluated as candidate tiers in `arena8-coop-functional-v2.candidate.json` pending owner balance sign-off).
- Enemy telegraph is committed one turn ahead and cannot be retargeted by a
  client after commitment. Enemy AI is bounded and deterministic.
- Icarus **FIRE_ZONE** is authored as a bounded board/encounter effect; it must
  not mutate the board differently from the published rules.
- Regular and boss encounters use the same authority. Win/loss and rewards settle
  only through the authoritative service.
- Typed combat events drive presentation cues. Replay produces an identical state
  hash and event stream for identical inputs.
- Stale state versions and duplicate command IDs fail closed. Request/receipt
  idempotency and execution bounds are mandatory.

### Functional tile contract for solo and cooperative combat

| TileKind | Authoritative result of a match |
| --- | --- |
| `sword` | Normal attack against the enemy. Resolve the active Pet's published attack and element against the defender. |
| `mana` | Restore Mana within the resource policy. |
| `rage` | Generate Rage within the resource policy. |
| `heart` | Recover HP on a policy-selected eligible target, bounded by maximum HP. |
| `shield` | Apply bounded, policy-targeted protection. |
| `special` | Trigger the published, typed special-resource effect. Its exact resource, targets and yield require balance review. |

An ordinary utility match deals zero direct attack damage. A cascade containing both Sword and utility resolves each matched tile under its own policy. A boosted tile applies its weight to its own function before the applicable cap. Matching the actor's element gives no generic board bonus. A four-player Boss encounter uses one shared board and the acting participant's Pet. A solo encounter uses the same tile contract with one Pet and one opponent. Pet levels, independent Skill Levels, Artifacts, telegraphs, Boss transformation and exactly-once settlement retain their existing contracts.

PostgreSQL publishes immutable validated bundles. Admin authors spawn weights, per-function yields, targeting, limits and multiplier schedules. Rust validates engine capability, executes effects and projects committed resources and events. Unity selects tile art from the projected contract. Allocation, reload, restart and replay retain the selected version and digest. Incompatible clients or configurations fail closed. Historical studies and captures must identify their elemental-board ruleset.

The tile vocabulary comes from [v2](v2.md), [v3.1](v3.1.md), its [historical board data](v3.1/data/board_rules_10x10.json) and the [art direction](art-direction.md). Their dimensions, resource values and balance examples apply only to their respective revisions. Candidate policy changes require a new validated publication.

### Approved V3 jewel roles

The natural pool contains Strike (`sword`), Mana (`mana`), Rage (`rage`), Vitality (`heart`), Aegis (`shield`) and Soul (`special`). The nine approved sprites use the two R04 source sheets. Display names preserve historical wire IDs. Only Strike contributes ordinary attack damage.

Schema 5 introduces an experimental, encounter-scoped policy. Nature removes eligible negative statuses, Frost mitigates the next eligible enemy attack and Astral raises eligible surviving basic jewels one unlocked tier after resolution. An authored opening or explicitly bound skill may convert basic jewels. Numerical values belong to the unpublished candidate. Prior schema versions keep their original engine capabilities and saved-match interpretation.

### Board stability

Normal skill overlays preserve board stability unless a published skill explicitly
changes tiles. Ultimate/Signature effects may alter tiles only through declared,
tested events. No client-side tile mutation is authoritative.

## Artifact progression

Artifacts replace mandatory visual evolution as the primary build-diversity axis.
Pets retain their identity, silhouette and base model from Lv1 to Lv60.

- Initial slots: **Core**, **Aegis**, **Rune**. Additional slots are deferred.
- Candidate rank thresholds: **D Lv1, C Lv10, B Lv20, A Lv40, S Lv60**.
- Level cap remains 60 unless a documented compatibility adjustment is approved.
- Presentation Power Class is not an equipment gate. A B-Power-Class Pet at Lv60
  may equip an S-rank Artifact.
- Owned artifact instances have a definition, slot, rank, upgrade level and
  deterministic upgrade-material cost. Modifiers are bounded; no uncontrolled
  multiplier stacking and no mandatory destructive failure.
- Inventory, equip, unequip and swap are account-authorized. Duplicate equips,
  wrong slots, insufficient level and unauthorized ownership are rejected.
- PvE acquisition is server-authored. A winning encounter may grant a bounded
  artifact/material result; duplicate settlement must return the original receipt.
- Battle loadouts are immutable snapshots. A later battle sees the equipped
  modifiers only through a new authoritative projection.
- No bespoke 3D geometry is required per Artifact. Icons, shared effects, optional
  accessory bindings and data-driven modifiers are the default.
- The candidate values in this specification are local balance candidates, not
  approved production economics.

## Canonical roster

The versioned reconciliation is [wave-a-canonical-roster-v1.json](wave-a-canonical-roster-v1.json);
its OD-1…OD-9 list records unresolved owner decisions. The locked Wave 1 runtime
roster contains 43 Pet identities. Wave A adds:

- **Dragons (presentation Power Class S):** Ignivar (Fire), Tidecoil (Water),
  Voltrazik (Electric), Hollowmaw (Ghost), Terradrake (Ground), Auroryx (Light).
- **Birds (presentation Power Class A):** Cinderquill (Fire), Tidewren (Water),
  Arcswift (Electric), Pallidrone (Ghost), Dustrunner (Ground), Prismkite (Light).

This gives **55 active canonical Pets** (43 + 12). The six new Off-rate S
concepts — Vulcaryn, Nerivelle, Fulgarys, Umbryss, Jaderyx and Solenne — form an
additive **candidate layer** reaching **61**. They do not silently replace or
extend the existing Standard-S banner pool; acquisition remains gated until an
explicit owner banner decision.

Rules:

- Presentation Power Class, gameplay stats, acquisition source and summon rarity
  are separate fields. Do not infer one from another.
- The ten shared race bases are presentation bases, not ten collectible Pets.
- One stable ID per identity. The Jadewarden/Jaderyx conflict resolves to
  `pet-s-ground-jaderyx`, display **Jaderyx**, with Jadewarden as a lookup-only
  alias; `pet-s-ground-jadewarden` is never minted. Confirm the display name in OD-3.
- Solenne is owner-provided replacement art with rights **PENDING_REVIEW** (OD-4);
  do not treat it as a cleared production asset.
- Thirty map-regular Pets have only a shared race-base concept, not individual
  concept art. Concept-ready is not model-ready.
- Runtime-ready, concept-ready, model-ready, rig-ready, Unity-ready and
  production-approved are separate states. Concept art is not an accepted model.
- Reuse data-driven mechanics and shared rig archetypes. Dragons do not share an
  incompatible skeleton merely because they share a family label.

## Unity and presentation

Central Plaza remains a separate social and navigation experience. Active battle uses a dedicated fixed composition with a centered 8×8 board, allied Pet or four compact participant portraits on the left, and the enemy or Boss on the right. Keep HP, resources, active turn, telegraph and skill controls visible at 720p and 1080p. Suppress locomotion, portal interaction and free camera input for the lifetime of the battle. The interactive board is the only checkerboard. Authored character animation and bounded reduced-motion-aware cinematics may play within the scene.
The 8x8 HUD must remain readable at the target desktop resolutions and provide:

- tile selection, swaps, invalid-swap feedback and cascade/refill feedback;
- Pet/enemy presentation, HP, Mana, Rage, cooldowns and status;
- committed enemy telegraph and action preview;
- normal/skill/Signature/Ultimate controls;
- combat speed, reduced-motion and flash controls;
- victory/defeat and reconnect/persistence feedback;
- collection/Pet profiles, Artifact inventory/equip/comparison, map progression;
- CDN concept thumbnails with safe fallback when unavailable.

Unity consumes committed gameplay events/projections only. Placeholders are
allowed when approved assets are unavailable and must be labelled as placeholders.

## Character, world, audio and VFX

Icarus remains the flagship Limited S. Continue the existing approved modular
path (hair, costume, accessories, wings, arms, halo, Phoenix Bow) through the
next H1–H4 owner gate. Do not claim a high-poly unrigged mesh as a production model.

Establish reusable humanoid, quadruped, avian, serpent and floating intake
profiles. The six maps retain their identities, but Wave A prioritizes **two
fixed-camera battle backgrounds** (Cinder Terraces/Fire and Tideglass Lagoon/Water) plus the
Central Plaza social space. Existing walkable arena scenes are DEVELOPMENT_BLOCKOUT references for navigation and regression. Fire establishes the representative playable composition before visual expansion to Water, Stormcoil Fields, Lantern Necropolis, Ochre Labyrinth and Dawn Prism Sanctum.

Audio foundation: AudioMixer groups for Music, Ambient, SFX, Voice and UI; volume
settings; battle/boss hooks; environment ambience; tile/attack/impact/shield/
elemental, victory, defeat, Artifact and reward cues. Pool VFX by event. Licensed
or owner-approved media only; placeholders are not finished sound production.

## Explicitly deferred from MVP

- Five additional Limited S cinematic characters (Icarus only in Wave A).
- 19-map/19-element expansion, 240-Pet catalog, permanent fusion.
- Ranked PvP, weekly bosses, friend assistance, seasons/leaderboards.
- Maid Café, Card Lounge, seamless open world and social-world dependency.
- Mobile/macOS platform ports.
- Separate visual evolution forms at Lv20/40/60.

Deferred work retains its design history and task IDs in
`config/development-plan.json`; it is not an MVP dependency.

## Acceptance

Wave A is not complete until the actual integrated loop is exercised: local
session, owned Pet, real 8x8 battle, normal/skill/Ultimate, authoritative reward,
Artifact acquisition and equip, a verified stat difference in a subsequent match,
recruitment through local rules, restart recovery, duplicate-reward and
unauthorized-equipment rejection, Dragon/Bird catalog completeness, CDN/fallback
behavior and frozen V1/V3 replay compatibility.

Passing headless or mocked checks does not constitute physical Windows
qualification or owner art acceptance.
