# Aetheria: SoulBound — MVP Wave 1 Power Classes (S / A / B)

**Status: PROPOSED_FOR_OWNER_REVIEW.** A design and presentation ladder for the concept batches, not a combat authority.
Read with [art-bible-mvp-wave1.md](art-bible-mvp-wave1.md), [art-bible-families-dragon-bird.md](art-bible-families-dragon-bird.md)
and the two concept ledgers. Machine-readable list: [power-tiers-mvp-wave1.json](power-tiers-mvp-wave1.json).

## 1. What a power class is

- A three-step presentation ladder, **S > A > B**, used for key art, review sheets and future UI badges.
- It is **not** summon rarity, a stat block, acquisition, drop rate or gameplay authority. The catalog `rank` field and summon pools stay unchanged.
- The six **Standard-S summon units are Power Class A** in this ladder: the owner reserved S for map legendaries, the six dragon families and Icarus.
  Their summon rarity remains **Standard S**. Promoting them to S later is a label change only — no art changes.
- No stat numbers, damage values or pay-to-win framing are defined here. Balance work needs its own reviewed spec.

## 2. Classes

| Class | Meaning | Contents | Count |
| --- | --- | --- | ---: |
| **S** | Apex: map-ending and mythic species | 6 Map Legendary + 6 Dragon family + Icarus (Limited S) | **13** |
| **A** | Rare: wave headliners and agile species | 6 Standard-S summon units + 6 Bird family | **12** |
| **B** | Foundation: modular regular species bodies | 10 Shared Race Bases | **10** |
| | | **Total** | **35** |

## 3. S — apex

| # | Name | ID | Label |
| ---: | --- | --- | --- |
| 1 | Pyrecrown | `fire-pyrecrown` | S · Legendary |
| 2 | Lagoonarch | `water-lagoonarch` | S · Legendary |
| 3 | Stormdiadem | `electric-stormdiadem` | S · Legendary |
| 4 | Lanternwake | `ghost-lanternwake` | S · Legendary |
| 5 | Faultwarden | `ground-faultwarden` | S · Legendary |
| 6 | Dawnarchon | `light-dawnarchon` | S · Legendary |
| 7 | Ignivar | `dragon-fire-ignivar` | S · Dragon |
| 8 | Tidecoil | `dragon-water-tidecoil` | S · Dragon |
| 9 | Voltrazik | `dragon-electric-voltrazik` | S · Dragon |
| 10 | Hollowmaw | `dragon-ghost-hollowmaw` | S · Dragon |
| 11 | Terradrake | `dragon-ground-terradrake` | S · Dragon |
| 12 | Auroryx | `dragon-light-auroryx` | S · Dragon |
| 13 | Icarus | `pet-v3-fire-icarus` | S · Limited |

## 4. A — rare

| # | Name | ID | Label |
| ---: | --- | --- | --- |
| 14 | Cindrelis | `pet-v31-fire-cindrelis` | A · Standard S |
| 15 | Marivell | `pet-v31-water-marivell` | A · Standard S |
| 16 | Quorion | `pet-v31-electric-quorion` | A · Standard S |
| 17 | Vesperyn | `pet-v31-ghost-vesperyn` | A · Standard S |
| 18 | Gravorn | `pet-v31-ground-gravorn` | A · Standard S |
| 19 | Aurelune | `pet-v31-light-aurelune` | A · Standard S |
| 20 | Cinderquill | `bird-fire-cinderquill` | A · Bird family |
| 21 | Tidewren | `bird-water-tidewren` | A · Bird family |
| 22 | Arcswift | `bird-electric-arcswift` | A · Bird family |
| 23 | Pallidrone | `bird-ghost-pallidrone` | A · Bird family |
| 24 | Dustrunner | `bird-ground-dustrunner` | A · Bird family |
| 25 | Prismkite | `bird-light-prismkite` | A · Bird family |

## 5. B — foundation

| # | Name | ID | Label |
| ---: | --- | --- | --- |
| 26 | Centaur Race Base | `base-rig-centaur` | B · Race base |
| 27 | Golem Race Base | `base-rig-golem` | B · Race base |
| 28 | Humanoid Familiar Base | `base-rig-humanoid` | B · Race base |
| 29 | Soft Amorphous Race Base | `base-rig-soft` | B · Race base |
| 30 | Living Artifact Race Base | `base-rig-floating` | B · Race base |
| 31 | Flora and Fungal Race Base | `base-rig-flora` | B · Race base |
| 32 | Aquatic Race Base | `base-rig-aquatic` | B · Race base |
| 33 | Spectral Race Base | `base-rig-spectral` | B · Race base |
| 34 | Serpentine Race Base | `base-rig-serpent` | B · Race base |
| 35 | Mechanical Race Base | `base-rig-mechanical` | B · Race base |

## 6. Relationship to the locked roster

- The 30 map regular Pets keep their catalog ranks: **12 A / 18 B**. They are not individually concepted in this batch.
- The 10 shared race bases are the **bodies** those regular Pets are built on. Marking a base B is a concept-review label, not a claim that
  every member Pet is B; a member Pet's class follows its catalog rank. Each base must serve both A and B members.
- Icarus (`pet-v3-fire-icarus`) is **S · Limited** and is included in the S list for completeness, but it is not part of the 34-concept batch;
  its production (H1–H4) is tracked separately. Wave 1's other five Limited S Pets remain under VL-172 and are out of scope.

## 7. Presentation rules

- Badge only. S gold `#E9C46A`, A violet `#B9A6F2`, B teal `#7FE0D0`.
- Power class never changes element palette, silhouette, materials, evolution modules or boss rarity language.
- The badge must not cover the face, core, board tile, health bar or target indicator.
- Class is shown on concept cards and future catalog UI; it is never encoded by recolouring a creature.

## 8. Review

- Owner approves the ladder or moves entries; the ledger records the decision per ID.
- Class changes are metadata-only: they require no new images and consume no paid credits.
