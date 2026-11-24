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

The target gameplay authority is Rust. Wave A adds a **new versioned ruleset**
(`aetheria-pet-arena-wave-a`, version 1) with an **8x8** board.

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
- The six MVP tile kinds map to Fire, Water, Electric, Ghost, Ground and Light.
- Deterministic seeded initialization; no starting match and at least one legal move.
- Orthogonal swaps of adjacent, different tiles; a move is valid only if it
  creates a match. Invalid swaps are rejected without mutating state.
- Match-3 detection in rows and columns, deterministic clear, gravity/refill and
  bounded cascades. Dead boards recover through a bounded deterministic routine.
- HP, defense, Mana, Rage and skill cooldowns. Normal attacks, shared skills,
  Signature and Ultimate follow the committed skill definitions.
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

The locked Wave 1 runtime roster contains 43 Pet identities. Wave A adds:

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
- One stable ID per identity. The Jadewarden/Jaderyx naming conflict is resolved
  with one canonical identity plus aliases, never duplicate ownership.
- Runtime-ready, concept-ready, model-ready, rig-ready, Unity-ready and
  production-approved are separate states. Concept art is not an accepted model.
- Reuse data-driven mechanics and shared rig archetypes. Dragons do not share an
  incompatible skeleton merely because they share a family label.

## Unity and presentation

Extend the existing Pet Arena project/scene; do not create a competing client.
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
functioning arenas** (Cinder Terraces/Fire and Tideglass Lagoon/Water) plus the
Central Plaza foundation over six empty scene definitions.

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
