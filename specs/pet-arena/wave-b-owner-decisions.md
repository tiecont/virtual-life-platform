# Wave B — consolidated owner decision package

Release state: **OFFLINE_ONLY / NO_GO_PUBLIC**. These are owner/content gates, not
permission to publish, purchase, deploy or spend on paid assets. Engineering work
continues on the gated-safe path while decisions are open.

Canonical inputs:
- [wave-a-canonical-roster-v1.json](wave-a-canonical-roster-v1.json)
- [mvp-wave-a.md](mvp-wave-a.md)
- [mvp-wave1-cdn-assets.json](mvp-wave1-cdn-assets.json)

## Current defaults

- 55 active canonical Pets: 43 frozen Wave 1 + 6 Dragons + 6 Birds.
- Six Off-rate S candidates are present but **not summonable**.
- Dragons are presentation Power Class S; Birds are presentation Power Class A.
- Six elements only: Fire, Water, Electric, Ghost, Ground, Light.
- Icarus is the flagship Limited S.
- Shared race bases are presentation bases, not collectible Pets.
- Jaderyx is the current candidate ID/name; Jadewarden is a lookup alias only.
- Solenne rights remain **PENDING_REVIEW**.
- Level cap 60; Artifact gates D1/C10/B20/A40/S60.
- No mandatory Lv20/40/60 visual evolution forms.

## Decisions

| ID | Decision | Why it gates | Safe default until decided | Owner action |
| --- | --- | --- | --- | --- |
| OD-1 | Are the six Off-rate S candidates added to the banner, or an optional future banner? | Changes summon pool, pity economics and ownership expectations. | Keep all six non-summonable; preserve the frozen Wave 1 pool. | Approve pool composition and odds; record banner version. |
| OD-2 | Acquisition route for the 12 Dragon/Bird families | They are canonical content but have no approved map/recruitment route. | Local development fixtures only; no ownership grant. | Approve map membership or a family-specific acquisition rule. |
| OD-3 | Confirm display name **Jaderyx** vs **Jadewarden** | One stable ID cannot have two canonical names. | Keep `pet-s-ground-jaderyx`, Jadewarden alias. | Confirm display name; update owning power-tier rows. |
| OD-4 | Solenne concept rights | Owner-provided replacement art is not cleared for production. | Do not publish, rig or use as production reference. | Confirm provenance/rights and approval. |
| OD-5 | Power-class ladder | Presentation class drives art expectation, not equipment or combat. | Wings: Dragons S, Birds A; Standard-S summons A presentation despite S rarity. | Confirm ladder and labels. |
| OD-6 | Approve the 31 Pet / 10 race-base concepts | Concept approval precedes modelling and rigging. | Keep concepts review-only, not model-ready. | Approve/revise/reject each concept. |
| OD-7 | Authorize model/rig/animation/VFX production | Paid/provider work and H1–H4 acceptance. | No paid generation; only already-approved Icarus study work. | Approve budget, scope and H-gate reviewers. |
| OD-8 | Fix stale **Jadewarden** rows in power-tier specs | They describe a non-minted identity. | Do not create `pet-s-ground-jadewarden`. | Let the owning spec owner correct the rows. |
| OD-9 | PvE map membership for the 12 families | Campaign recruitment/capture needs an approved route. | No campaign ownership; development fixtures only. | Assign maps or defer families beyond M4. |
| OD-10 | Audio media licensing | No production music/VO/ambience may be misrepresented as licensed. | Mixer and event hooks use procedural fallback; label as temporary. | Approve licensed media or commission production. |
| OD-11 | Environment art acceptance | Developer primitives are not final art. | Label scenes developer-intermediate; capture rendered evidence. | Accept H-gate environments or request revisions. |

## Engineering rules

- An unresolved decision must not be bypassed by a client flag, fixture or
  claimed production state.
- Candidate and unsupported identities must expose an explicit readiness/gate
  state through the canonical roster contract.
- Gated content may be exercised only through explicitly gated local/test
  fixtures; no silent ownership, banner, reward or economy grant.
- Owner approval of a concept is not approval of a model, rig, animation,
  rendered scene, audio licence or public release.
- Physical Windows qualification, human playtesting and release authorization
  remain separate M5/M6 gates.

## Campaign V4 owner decisions

The following decisions supersede conflicting historical design assumptions for future gameplay configurations.

### D01 — Elemental damage

All same-element matchups use 100% normal elemental effectiveness.

Fire versus Fire, Water versus Water, Electric versus Electric, Ghost versus Ghost, Ground versus Ground, and Light versus Light must all resolve at 100%.

This does not bypass defense, critical rules, shields, status effects, skill formulas or other combat modifiers.

Remove unintended permanent immunity from ordinary elemental matchup design.

Use the following matrix as the initial V4 balance candidate.

Rows are attackers. Columns are defenders.

| Attacker | Fire | Water | Electric | Ghost | Ground | Light |
|---|---:|---:|---:|---:|---:|---:|
| Fire | 100 | 50 | 100 | 100 | 50 | 150 |
| Water | 150 | 100 | 100 | 100 | 150 | 100 |
| Electric | 100 | 150 | 100 | 100 | 50 | 100 |
| Ghost | 100 | 100 | 100 | 100 | 100 | 50 |
| Ground | 150 | 50 | 150 | 100 | 100 | 100 |
| Light | 100 | 100 | 100 | 150 | 100 | 100 |

All values are percentages.

Same-element 100% is an explicit owner decision.

The two replacement cross-element resistance values of 50% are initial technical balance candidates. Refine cross-element values through measured balance work if justified.

All 36 matchup coefficients must be Admin-configurable through validated, versioned gameplay configuration.

Do not rewrite historical published configurations or change their digests.

### D02 — Tactical RPG difficulty

Aetheria is a Tactical RPG with progressive difficulty.

Early encounters should be approachable. Advanced encounters should require stronger Pets, better equipment, tactical jewel decisions, skill timing and cooperation.

Do not design the entire campaign to guarantee that starter Pets can defeat every Boss.

Do not guarantee victory for Limited S Pets.

Do not reduce Boss strength solely to achieve a desired aggregate win-rate percentage.

### D03 — Fixed authored Boss strength

Boss HP, ATK, DEF, critical values, attack patterns, phases and other gameplay statistics are authored by Admin.

Do not automatically weaken a Boss because fewer players enter its encounter.

The same authored encounter must retain the same Boss configuration across supported party sizes.

Allow separately authored easier encounters, but do not disguise an automatically weakened version of the same Boss as its original challenge.

High-tier encounters are designed primarily for cooperative parties.

A sufficiently powerful solo Pet, excellent strategy or favorable RNG may occasionally overcome a difficult Boss.

Interpret cooperative necessity as a product difficulty expectation rather than an artificial minimum-seat restriction unless an explicit encounter rule requires otherwise.

A legitimate solo victory must not be converted into defeat or lose its normal encounter reward solely because the player fought alone.

Preserve authorization, participation, eligibility and exactly-once reward settlement.

Support the party sizes required by the existing architecture. Evaluate one-seat and four-seat challenges against the same authored Boss.

Do not invent new matchmaking or party-size restrictions without evidence and product necessity.

### D04 — Shared nine-jewel natural RNG

All nine approved functional jewel types belong to the natural RNG spawn pool:

- `sword` — Strike.
- `mana` — Mana.
- `rage` — Rage.
- `heart` — Vitality.
- `shield` — Aegis.
- `special` — Soul.
- `nature` — Nature.
- `frost` — Frost.
- `astral` — Astral.

Every Pet uses the same jewel RNG rules.

All nine jewel types may naturally appear through initial board generation, ordinary refill, cascades and valid board recovery.

There is no Pet-exclusive jewel-generation mechanic.

No Pet, Pet rarity, Pet element, level, equipment, skill or player spending may improve or bias the natural jewel distribution.

Remove skill-authored advanced jewel creation and conversion from the new active gameplay capability.

Remove encounter-specific forced advanced jewel opening groups and authored conversion policies from the new active gameplay capability.

Do not introduce hidden player-specific luck modifiers, guaranteed favorable cascades, dynamic difficulty RNG assistance or spending-dependent board outcomes.

Admin may configure the shared spawn probabilities, but the same published distribution applies to all eligible participants and ordinary encounters using that configuration.

Pure RNG does not require equal probabilities for every jewel. Evaluate shared weighted distributions through deterministic simulation.

Preserve the approved functionality of all nine jewels.

Astral may still upgrade eligible surviving jewel multipliers through its own committed match effect.

Preserve initial board validity, legal-move requirements, deterministic seeded generation and bounded dead-board recovery.

Where necessary, separate board RNG from combat RNG so that unrelated Pet-specific critical draws do not inadvertently bias subsequent jewel distribution.

Keep RNG authoritative in Rust.

Do not let Unity choose refill values, board generation, attack outcomes or rewards.

### D05 — Map-based Dragon and Bird acquisition

Assign all six Dragons and six Birds to their corresponding elemental maps.

Use existing canonical identities.

Develop rarity-appropriate encounters and acquisition routes.

Dragons may serve as high-tier map Bosses.

A collectible Dragon identity and its Boss encounter configuration are separate concerns.

Do not copy Boss-scale combat statistics into collectible Pet ownership.

### D06 — Full 61-Pet development scope

Expand the development target from 55 active identities to all 61 canonical identities.

Include:

- Vulcaryn.
- Nerivelle.
- Fulgarys.
- Umbryss.
- Jaderyx.
- Solenne.

Develop gameplay bindings, canonical abilities, Admin entries, progression, acquisition contracts, artwork, models, rigs, animations and presentation.

Do not automatically declare these six candidates production-ready or publicly summonable.

Maintain acquisition and release gates until the relevant configurations and assets are qualified.

Preserve existing stable IDs.

Do not create duplicate identities or silently rewrite the frozen historical banner.

### D07 — Parallel art and infrastructure production

Continue character production, gameplay development, cinematic production and deployment preparation simultaneously.

Use existing canonical skills and authenticated Chrome sessions.

The owner has already opened Tripo, Cloudflare and Northflank browser tabs.

Use those existing sessions through the supported Chrome DevTools MCP workflow when available.

Do not invent successful browser access or provider actions.

Inspect actual provider entitlements, existing jobs, projects, services, buckets and deployment configuration.

The owner confirmed there is no staging environment. The main branch deploys to production. Use isolated local infrastructure and review branches for unpublished configurations.

Do not open public release, public registration or unauthorized production deployment.
