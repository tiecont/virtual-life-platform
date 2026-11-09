# Pets, progression and data design

## Data model concepts
- PetSpecies: original world-building art, element, role, base stats, move set, evolution branches, skins, rarity metadata.
- PetInstance: owner, speciesId, level, XP, friendship, evolution node, cosmetics, unlocked abilities, stable instance ID.
- TeamSlot: slot index 0..2, petInstanceId. No duplicate PetInstance in the same lineup.
- BalanceConfig: rulesetVersion, stat growth curve, skill cost/cooldown, status caps, PvP templates.

## Proposed starting roster — original IP
| Species ID | Working name | Element | Role | Signature behavior |
|---|---|---|---|---|
| pet.cindlet | Cindlet | Ember | burst | Burns on elemental proc |
| pet.mosskin | Mosskin | Grove | tank | Converts charge to barrier |
| pet.rillfin | Rillfin | Tide | healer | Healing chain bonus |
| pet.lumipip | Lumipip | Aether | support | Gains extra focus after cascades |
| pet.brambit | Brambit | Grove | disruptor | Root after second GUARD match |
| pet.droplette | Droplette | Tide | control | Weakens incoming strike one turn |
| pet.sparksprig | Sparksprig | Ember | combo | Adds bonus on 4+ STRIKE chain |
| pet.orbbit | Orbbit | Aether | trickster | Changes two board gems with deterministic rule |

*Working names for internal production; clear name/IP review before publishing.*

## Levels and evolution
- MVP levels 1–20, predictable XP progression by stage, daily XP catch-up. No severe grind gating first 6 story stages.
- Evolution at levels 10 and 20 is **cosmetic + horizontal ability choice**, not linear exponential strength. MVP can ship first evolution at 10 and reserve 20 for future.
- Friendship increases through daily play and Pet Camp interactions (no incentivized spam). Unlocks emotes, idle animations, VLP profile cosmetic badges.
- PvP normalizes stats to a standardized level/template; skills unlocked through PvE may be offered in standardized loadouts or mirrored starter access. Skill rarity does not determine raw competitive advantage.

## Pet Camp (VLP-friendly)
- View favorites, feed, care, decorate a small corner, see evolution timeline, equip skin.
- Cosmetic Pet companion can optionally appear in user's VLP profile/home under privacy + performance constraints.
- No core real-time simulation of Pet hunger/illness in MVP; prevent manipulative return pressures.

## Content authoring workflow
1. Author versioned JSON for species, skills, statuses, enemies and encounters.
2. Validate schema, ID uniqueness, references, allowed numeric ranges, art/audio asset pointers.
3. Generate deterministic simulation matrix with representative level teams.
4. Run balance dashboards: win rate per team, average battle length, skills picked, per-element advantage.
5. Only publish content changes behind contentVersion; retain old PvP ruleset for active matches and replays.

## Accessibility and assets
- Every gem has shape/symbol besides color; Pet silhouettes recognizable on small screens.
- Animation timing supports reduced-motion preference; all critical telegraphs conveyed with labels and effects.
- All assets are original or properly licensed. Avoid Pokémon and Pokiwar names, look-alike creatures, sound effects and sprites.
