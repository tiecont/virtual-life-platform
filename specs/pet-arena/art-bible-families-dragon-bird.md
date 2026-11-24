# Aetheria: SoulBound — Dragon and Bird Species Families

**Status: FAMILY_EXPLORATION · CONCEPT_REVIEW_REQUIRED.** Companion to [art-bible-mvp-wave1.md](art-bible-mvp-wave1.md); palettes,
materials, evolution staging and review rules come from that document unchanged.

**Scope lock.** These are new **species families**, not a new element system. The six elements stay fire, water, electric, ghost,
ground and light. There is **no Ice or Dark element**: the water dragon uses tideglass/frost-glass accents while remaining Water, and the
void dragon is Ghost. The concepts are not part of the locked 43-Pet Wave 1 roster, define no stats, acquisition or gameplay authority,
and are not production or rights approval.

**Power class:** the six dragons are **S**; the six birds are **A** under [power-tiers-mvp-wave1.md](power-tiers-mvp-wave1.md) (presentation only, no stats).

## 1. Dragon family

Six body plans, six silhouettes. Element sets colour and material; the species sets the body.

| Element | Name | Body plan | Wing system | Signature |
| --- | --- | --- | --- | --- |
| Fire | Ignivar | Heavy forge drake, four legs, oversized forearms | Rigid obsidian kiln-plate fans (non-feathered) | Chimney-horn crown, lava-glass spine, stone club tail |
| Water | Tidecoil | Long wingless leviathan, eel-like | None — six paired ribbon fins and a dorsal tideglass sail | Pearl-ridged crown, fan tail, wet enamel |
| Electric | Voltrazik | Bipedal arc raptor | Two pairs of floating conductive blade wings (non-feathered, no membrane) | Coil tail, single bright eye-core, chrome-violet |
| Ghost | Hollowmaw | Floating legless void wyrm | None — broken halo of floating obsidian shards plus veil membranes | Cracked porcelain skull mask, hollow chest core |
| Ground | Terradrake | Low four-legged tectonic behemoth | None — terraced mountain-ridge back plates | Plow-like horns, jade fault seams, stone club tail |
| Light | Auroryx | Long-necked quadruped sovereign | Segmented prism-glass panels on brass ribs (non-feathered) | Branching antler halo, pearl-gold scales |

Rules: no default feathered wings; wings are optional and, when present, must be plate fans, floating energy blades or glass panels.
Wingless dragons carry silhouette through fins, shards or ridge backs. Heads are draconic — never human. Horns, crests, necks, tails and
feet must differ between all six; a palette swap is not a different dragon. Neutral grounded A-pose (or hover for the void wyrm), wings
separated, tail clear of legs, no props.

## 2. Bird family

Six wing constructions, six body plans.

| Element | Name | Body plan | Wing construction | Signature |
| --- | --- | --- | --- | --- |
| Fire | Cinderquill | Compact raptor hawk | Layered lacquered feather-blade plates | Split ember-ribbon tail, brass talons |
| Water | Tidewren | Tall heron | Fan membranes on long ribs (non-feathered) | Pearl crest, cyan-glass beak, trailing water ribbons |
| Electric | Arcswift | Streamlined swift | Two pairs of narrow chrome-violet blade wings (four wings) | Forked coil tail, tucked feet, cyan eye |
| Ghost | Pallidrone | Owl-like wraith | Cloth shroud wings | Porcelain mask, lantern-wisp tail, no visible feet |
| Ground | Dustrunner | Long-legged roadrunner | Stone-plate scale fans | Ochre plumage, jade eye stripe, chalk markings |
| Light | Prismkite | Slender swallow | Faceted glass panels on gold ribs | Halo crest, long forked kite tail |

Rules: vary the wing mechanism, not just the colour; beaks, legs, tails and crests carry species identity; no human face; grounded stance or
hover with clear limb separation; no props. Flight pose must leave the body and wing roots readable for rigging.

## 3. Design and IP safety

Angular energy-wing and void-fracture geometry are used as **general design principles** (floating blades, shard halos), not as copies.
No existing franchise creature, character, mask, costume, silhouette, colour-block or signature pose is reproduced; no named franchise
assets were used as image references. The user-supplied reference links informed only the principle of non-feathered wing variety and
void/energy motifs. Final designs must pass the same originality review as the rest of the wave.

## 4. Rig and 3D intake

- Neutral A-pose, all limbs and wing roots separated, tail clear of legs, head level, full body in frame.
- Wingless families bind to the float/serpent/quadruped profiles; winged dragons keep wing roots at the shoulder socket with no feather cards.
- Modular head sockets stay faceless where the family is a base; face plates are supplied per element variant later.
- No weapons, held props, environment, text, logo, frame or watermark. Deep neutral charcoal studio backdrop.

## 5. Review, naming and cost

- Provisional IDs: `dragon-<element>-<name>` and `bird-<element>-<name>`. IDs are exploration labels until the owner promotes a family into the roster.
- Owner decision per concept: **Approve / Revise / Reject** in `Aetheria-Workspace/mvp-wave1/concepts-v3/review.html`.
- Zero-cost only: Tripo Studio Image, **GPT Image 2.5**, free-image counter visible before every run, no paid fallback. Paid balance must stay 1910.
- Ledger: [mvp-wave1-families-v3.json](mvp-wave1-families-v3.json) records prompt hashes, task IDs, free-counter deltas and SHA-256. PNGs stay outside Git.
