# Aetheria: SoulBound — MVP Wave 1 Power Classes (S / A / B)

**Status: PROPOSED_FOR_OWNER_REVIEW.** A design and presentation ladder for the concept batches, not a combat authority.
Read with [art-bible-mvp-wave1.md](art-bible-mvp-wave1.md), [art-bible-families-dragon-bird.md](art-bible-families-dragon-bird.md)
and the concept ledgers. Machine-readable list: [power-tiers-mvp-wave1.json](power-tiers-mvp-wave1.json).

## 1. What a power class is

- A three-step presentation ladder, **S > A > B**, used for key art, review sheets and future UI badges.
- It is **not** a stat block, acquisition, drop rate or gameplay authority. Summon rarity and catalog ranks stay unchanged.
- The six original **Standard-S summons are Power Class A**: their appearance reads A, not S. Their summon rarity remains Standard S.
- The S tier is filled by the **six new S off-rate summons**, the map legendaries, the six dragon families and Icarus.
- No stat numbers, damage values or pay-to-win framing are defined here.

## 2. Classes

| Class | Meaning | Contents | Count |
| --- | --- | --- | ---: |
| **S** | Apex: mythic, map-ending and S off-rate summons | 6 S off-rate + 6 Map Legendary + 6 Dragon family + Icarus (Limited S) | **19** |
| **A** | Rare: wave headliners and agile species | 6 Standard-S summons (A appearance) + 6 Bird family | **12** |
| **B** | Foundation: modular regular species bodies | 10 Shared Race Bases | **10** |
| | | **Total** | **41** |

## 3. S — apex

| # | Name | ID | Label |
| ---: | --- | --- | --- |
| 1 | Vulcaryn | `pet-s-fire-vulcaryn` | S · Off-rate |
| 2 | Nerivelle | `pet-s-water-nerivelle` | S · Off-rate |
| 3 | Fulgarys | `pet-s-electric-fulgarys` | S · Off-rate |
| 4 | Umbryss | `pet-s-ghost-umbryss` | S · Off-rate |
| 5 | Jadewarden | `pet-s-ground-jadewarden` | S · Off-rate |
| 6 | Solenne | `pet-s-light-solenne` | S · Off-rate |
| 7 | Pyrecrown | `fire-pyrecrown` | S · Legendary |
| 8 | Lagoonarch | `water-lagoonarch` | S · Legendary |
| 9 | Stormdiadem | `electric-stormdiadem` | S · Legendary |
| 10 | Lanternwake | `ghost-lanternwake` | S · Legendary |
| 11 | Faultwarden | `ground-faultwarden` | S · Legendary |
| 12 | Dawnarchon | `light-dawnarchon` | S · Legendary |
| 13 | Ignivar | `dragon-fire-ignivar` | S · Dragon |
| 14 | Tidecoil | `dragon-water-tidecoil` | S · Dragon |
| 15 | Voltrazik | `dragon-electric-voltrazik` | S · Dragon |
| 16 | Hollowmaw | `dragon-ghost-hollowmaw` | S · Dragon |
| 17 | Terradrake | `dragon-ground-terradrake` | S · Dragon |
| 18 | Auroryx | `dragon-light-auroryx` | S · Dragon |
| 19 | Icarus | `pet-v3-fire-icarus` | S · Limited |

## 4. A — rare

| # | Name | ID | Label |
| ---: | --- | --- | --- |
| 20 | Cindrelis | `pet-v31-fire-cindrelis` | A · Standard |
| 21 | Marivell | `pet-v31-water-marivell` | A · Standard |
| 22 | Quorion | `pet-v31-electric-quorion` | A · Standard |
| 23 | Vesperyn | `pet-v31-ghost-vesperyn` | A · Standard |
| 24 | Gravorn | `pet-v31-ground-gravorn` | A · Standard |
| 25 | Aurelune | `pet-v31-light-aurelune` | A · Standard |
| 26 | Cinderquill | `bird-fire-cinderquill` | A · Bird family |
| 27 | Tidewren | `bird-water-tidewren` | A · Bird family |
| 28 | Arcswift | `bird-electric-arcswift` | A · Bird family |
| 29 | Pallidrone | `bird-ghost-pallidrone` | A · Bird family |
| 30 | Dustrunner | `bird-ground-dustrunner` | A · Bird family |
| 31 | Prismkite | `bird-light-prismkite` | A · Bird family |

## 5. B — foundation

| # | Name | ID | Label |
| ---: | --- | --- | --- |
| 32 | Centaur Race Base | `base-rig-centaur` | B · Race base |
| 33 | Golem Race Base | `base-rig-golem` | B · Race base |
| 34 | Humanoid Familiar Base | `base-rig-humanoid` | B · Race base |
| 35 | Soft Amorphous Race Base | `base-rig-soft` | B · Race base |
| 36 | Living Artifact Race Base | `base-rig-floating` | B · Race base |
| 37 | Flora and Fungal Race Base | `base-rig-flora` | B · Race base |
| 38 | Aquatic Race Base | `base-rig-aquatic` | B · Race base |
| 39 | Spectral Race Base | `base-rig-spectral` | B · Race base |
| 40 | Serpentine Race Base | `base-rig-serpent` | B · Race base |
| 41 | Mechanical Race Base | `base-rig-mechanical` | B · Race base |

## 6. S off-rate batch (v4)

Six new summons, one per element, each with a unique body plan and regalia:

| Element | Name | Body plan | Unique regalia |
| --- | --- | --- | --- |
| Fire | Vulcaryn | Ember lion | Flame-glass petal mane, six kiln-horn crest points, ember cape |
| Water | Nerivelle | Tide koi | Coral-pearl tiara, tideglass shoulder veils, bubbles |
| Electric | Fulgarys | Thunder beetle | Chrome antenna prongs, elytra shell, branch-arc sparks |
| Ghost | Umbryss | Grave hound | Bell-cowled mourning veil, lantern chest core, wisp lanterns |
| Ground | Jadewarden | Jade elephant | Terraced stone tusks, jade forehead plate, chalk mantle |
| Light | Solenne | Prism fox | Nine faceted prism tails, ivory-ray diadem, prism shards |

The first pass gave every pet the same three floating rings; that was rejected as non-unique and all six were regenerated. Shared motif such as
floating rings, identical crowns or matching satellites is forbidden across the S off-rate family.

## 7. Relationship to the locked roster

- The 30 map regular Pets keep their catalog ranks: **12 A / 18 B**.
- The 10 shared race bases are the **bodies** those regular Pets are built on; marking a base B is a concept-review label, not a claim about every member.
- Icarus (`pet-v3-fire-icarus`) is **S · Limited** and shown as a reference card using existing approved art. Wave 1's other five Limited S Pets remain under VL-172.

## 8. Presentation rules

- Badge only. S gold `#E9C46A`, A violet `#B9A6F2`, B teal `#7FE0D0`.
- Power class never changes element palette, silhouette, materials, evolution modules or boss rarity language.
- S off-rate Pets each carry one unique regalia language; no repeated accessory motif across the family.
- The badge must not cover the face, core, board tile, health bar or target indicator.

## 9. Review

- Owner approves the ladder or moves entries; the ledger records the decision per ID. Review everything in one sitting at
  `Aetheria-Workspace/mvp-wave1/review-all.html` (S/A/B filter).
- Class changes are metadata-only: they consume no paid credits.
