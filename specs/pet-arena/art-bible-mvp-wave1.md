# Aetheria: SoulBound — MVP Wave 1 Concept Art Bible

**Direction lock: "Luminous Tamer"** · Status **CONCEPT_REVIEW_REQUIRED**, owner approval required.
Scope: the 22 Wave 1 MVP concepts — 6 Standard S Pets, 6 Map Legendary Bosses, 10 Shared Race Bases
(C1 in [mvp-wave1-43-pets.json](mvp-wave1-43-pets.json)). Concepts are not models, rigs, rights clearance or production approval.

This bible amends [art-direction.md](art-direction.md) §Shared Visual Language for Wave 1: it replaces the muted palette table
and the Lv 30/60 wording with the palettes and Lv 20/40/60 stages below. Readability, IP-safety, animation, VFX and legality
rules in that document still apply. Gameplay values, acquisition, star rules and authority are unchanged.

## 1. Direction

Bright, clean, iconic **anime/fantasy monster-tamer** charm: clean anime key-art rendering with soft painterly gradients and crisp silhouette edges, three-value shapes, saturated
element colour, expressive oversized eyes and confident posture — 100% original body plans. Charm comes from expression, shape
language and lighting, never from imitating a known creature, mascot, costume or signature pose.

Non-negotiables:

1. **Three values at 128 px** — dark body mass, mid surface, one bright focal. If it needs detail to read, it fails.
2. **One focal per creature** — eyes for Pets, core/chest emblem for Bosses. Never two competing glows.
3. **Rig-first anatomy** — every concept states its limbs: floating Pets have **no legs** (legs break the float/spectral rig families), quadrupeds four legs, hexapods six, bipeds two legs plus two arms, in neutral A-pose with visible gaps.
4. **Original by construction** — new anatomy, props, markings and palettes. No existing-franchise silhouette, face, colour-block or pose.
5. **Colour is a second signal** — element also reads from shape, material, motif and motion, never hue alone.
6. **Glow is garnish** — elemental light stays on rim, seams and 1–2 accents, at most ~15% of the subject area.
7. **No human faces on creatures**; faces are mask, plate or crystal structures with anime-level eye expression. Race bases use beastfolk or construct anatomy, never bare human skin.
8. **Clean plate** — one centred full-body subject on a deep neutral charcoal studio backdrop, soft contact shadow, no environment, frame, text, logo, UI or watermark.
9. **Standard S Pets are wingless and weaponless** so the same concept can drive Charakuru/VRM without rig surgery. Legacy wing features
   (Quorion) remap to ear-discs, shoulder fans or tail fans; Lv 40/60 back pieces are rigid modular accessories, not rigged wings.

## 2. Element palettes (six core elements)

| Element | Ink (shadow) | Body | Surface | Accent | Material and motif | Aura motif |
| --- | --- | --- | --- | --- | --- | --- |
| Fire | `#4A1410` | `#D8332A` | `#FF7A3D` | `#FFD25E` | Kiln ceramic, ember silk | Ember petals, heat rim |
| Water | `#0C2C4A` | `#1B72C9` | `#40C9E8` | `#A8F2DE` | Wet enamel, pearl | Tide ribbons, caustic rings |
| Electric | `#2B1B33` | `#F2A93B` | `#FFE066` | `#7A5CFF` | Lacquered copper, ceramic insulator | Branching arcs, coil sparks |
| Ghost | `#241A3B` | `#6C4BD6` | `#B9A6F2` | `#7FEBD3` | Smoked crystal, folded silk | Wisp rings, trailing veil |
| Ground | `#3E2A18` | `#C97A3C` | `#EBC48A` | `#4FC79A` | Chalk-lined stone, jade seams | Dust fans, terrace step |
| Light | `#5A4726` | `#E9CFA0` | `#FFF0BE` | `#6FD3FF` | Pearl, prism glass | Bounded prism rays, halo facets |

Rules: shadows are Body darkened and tinted toward Ink, never neutral grey; highlights lean toward Surface plus a warm rim light;
Accent appears in at most three places (focal, one seam, one small utility). Light stays pearl/ivory with a coloured accent, never a
white emissive silhouette. Gold, jewel and ornamental pearl trim are **legendary-only** signals; race-base socket rings stay matte pearl-grey, never ornamental gold.

## 3. Silhouette and expression

- **Standard S**: head:body ≈ 1:3.2, one clear S- or C-gesture line plus one asymmetric break for personality, eye area ≤ 8% of the silhouette.
- **Bosses**: head:body ≈ 1:5–1:6, one framing device and two negative-space breaks so the outline never merges into a blob.
- Black-fill test: every concept must be identifiable as a unique shape at 128 px, and **no two may share a silhouette family** — a vertical lantern shrine and a radial jellyfish are two families; a low caldera quadruped and a tall coral arch are two families. Palette swaps are not differentiation.
- Signature masses: Cindrelis stacked pagoda lantern + ember scarf; Marivell bell dome + tendril fringe; Quorion split ear-discs + fan tail; Vesperyn mask + veil wedge;
  Gravorn stepped shell + six-leg fan; Aurelune antler tree + slim legs; Pyrecrown low caldera beast + six chimney horns; Lagoonarch coral arch + tide skirt;
  Stormdiadem radial crown + coil limbs; Lanternwake broken bell arch; Faultwarden slab shoulders + shield chest; Dawnarchon segmented dawn arch.

## 4. Standard S A-pose (3D intake)

Neutral A-pose, forelimbs/arms 35–45° from the body with visible armpit gaps, feet planted at shoulder width, tail clear of the legs,
head level with a slight three-quarter turn, all limbs separated and fully in frame, no overlap of limbs with the body core, wings absent,
no held props. Tail or ribbon tassels may float but must not cross the legs. Expression: curious, friendly, confident — one emotion only.

## 5. Three-stage visual evolution (Lv 20 / 40 / 60)

Presentation-only art layering. It changes no stats, star rules, acquisition or evolution semantics, and Lv 60 never replaces the base identity.

| Stage | Silhouette delta | Module and sockets | Palette | Aura |
| --- | --- | --- | --- | --- |
| **Lv 20 Awakened** | +4–6% height, head crest opens | Crown/nape collar or waist plate (per element accessory set) | Second accent tone appears | Single motif ring at feet or back |
| **Lv 40 Ascendant** | +8–10% width, shoulders broaden | Shoulder or back fan panel, forelimb cuffs | Accent gradient shifts toward gold | Motif trails ≤ 0.4 body length |
| **Lv 60 Mythic** | +12–15% up and back, halo/arch frame | Halo/arch plus three floating satellites; full regalia | Rare gold/pearl trim joins element accent | Aura ring plus bounded ground bloom |

Rules: additive layering over documented sockets (crown, nape, shoulders L/R, back-centre, waist, forelimb cuffs, tail root); identity anchors
(head shape, eye colour, core emblem, element) always visible; no recolor-only stages; no stage hides the face or blocks the board tile; every stage
reads at 128 px and 32 px. Accessory names and per-element sets stay those of [mvp-wave1-43-pets.json](mvp-wave1-43-pets.json).

## 6. Map Legendary Bosses

- **Proportion**: 1.8–2.4× Standard S height, footprint width ≥ 1.6×, wide grounded base, heavy-bottom mass; majestic by mass and framing, not by particle count.
- **Framing**: exactly one crown, arch, radial ring or back-plane device; two deliberate negative-space breaks; no human face, no mech, no weapon.
- **Rare accents** (never used by that element's regular Pets): Pyrecrown obsidian + white-gold; Lagoonarch abyssal navy + pearl; Stormdiadem chrome + deep violet;
  Lanternwake antique brass + ash rose; Faultwarden jade + ivory chalk; Dawnarchon dusk rose + cobalt.
- **Aura**: one elemental motif, rim-confined, ≤ 15% of the subject, never over the face or core; ground contact ring and a warm/cool rim light are always present.
- **Materials**: hero-grade hand painting plus 1–2 premium materials (gold, pearl, obsidian, smoked glass, chalk inlay). Silhouette must survive at 512 px board scale.

## 7. Shared Race Bases (10)

Modular bodies that carry six element variants and the Lv 20/40/60 accessory sets:

- **Palette**: warm ivory `#EDE3D2` body, charcoal `#3A3A3F` joint breaks, pearl `#F7F1E4` socket rings, plus one heritage accent on ≤ 10% of the surface.
- **Sockets**: visible pearl ring seams at crown/nape, both shoulders, back-centre, waist and forelimb cuffs; sockets are drawn as ring seams, not glowing holes.
- **Modular head**: the Golem base is deliberately faceless — a smooth blank carved head plate with no eyes or mouth. The other bases keep a simple non-human creature face so they read as lively Pets; all sockets stay modular for element face plates.
- **Lively, not clay**: expressive posture and face where present, bright heritage accent, clean painted forms — but no element palette and no elemental effects, so all six variants can recolor.
- **Distinct plans**: one per rig family; each must differ from the Standard S silhouettes and from the other nine bases.
- Heritage accents: Centaur saffron mane tips; Golem jade crystal shards; Humanoid Familiar coral shoulder trim; Soft Amorphous sky-blue lobe rims;
  Living Artifact amber ribbon edging; Flora/Fungal leaf-green cap edge; Aquatic turquoise fin ribs; Spectral lavender veil edging;
  Serpentine mint segment bands; Mechanical copper panel seams.

## 8. Review and cost rules

- Deliverable: 22 PNG concepts at 4:3, 1536×1152, single subject, deep neutral charcoal studio backdrop, reviewed in one sitting in `review.html`.
- Zero-cost only: Tripo Studio Image, model **GPT Image 2.5**, free-image counter visible before every run; no paid fallback; stop when free quota ends.
- Owner decision per concept: **Approve / Revise / Reject**, with notes. Any approval is concept-stage only and does not authorize geometry,
  paid provider jobs, rights, Unity admission, publication or deployment.
- Batch v2 ledger: [mvp-wave1-concepts-v2.json](mvp-wave1-concepts-v2.json) records prompt hash, task id, free-counter delta, paid-balance delta (0) and SHA-256 for every image; the PNGs stay outside Git in the production workspace.
- Review sheet: `Aetheria-Workspace/mvp-wave1/concepts-v2/review.html` — grouped by category with per-concept Approve / Revise / Reject and notes.
