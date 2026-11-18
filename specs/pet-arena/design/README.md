# Canonical 240 Pet stories and design prompts

For Limited production, follow the maintained Vietnamese
[Limited blueprint](limited-production-blueprint.vi.md). Glaciemora, Voltaris,
Noctalith, Sylvaris and Leviara are `OWNER_DESIGN_PENDING`: do not use the
proposed stories/prompts below as authorization to design, generate or develop
those characters. Their owner designs must enter intake first. The blueprint
defines future deliverable quantities, technical contracts and acceptance;
it does not deliver new art or approve existing lore.

[pet-lore-design-240.json](pet-lore-design-240.json) contains one individually
authored Vietnamese story and detailed English image prompt for every Pet in
`../v3.1/data/pets_initial_240.json`, in canonical order. The stories are new
editorial fiction proposed for this catalog; they are not previously established
lore or claims about implemented game behavior. Named relationships are narrative
additions. Each story includes a personal difficulty, another character or
community relationship, and a concrete choice with consequences.

Use `pets[].designPrompt` for a concept image and retain
`pets[].visualConstraints` during review. Prompts describe the individual anatomy,
material construction, storytelling detail, pose, palette, inspection views and
small habitat context. Shared sheet instructions provide consistent presentation;
the individual design paragraph and story are separately authored for each Pet.
The 19 map groups retain their actual map IDs; Limited/Standard S entries retain
`null` map IDs even when a story visits a region. Props and story actions do not
create equipment, skills, rewards or animation bindings.

The v3.1 source contains silhouette/taxonomy contradictions and ambiguous shorthand.
The JSON preserves every original ID, name, element, race, body plan, rig archetype,
rank, source, map and palette verbatim in each canonical snapshot. It separately
flags 150 appearance/conflict/ambiguity cases, including the owner override below.
The proposed prompts generally keep the declared body plan and use conflicting
silhouette phrases as garment, surface or equipment motifs. This is a provisional
art interpretation, **not a correction of canon or an approved rig**. The griffin
Voltaris explicitly preserves four supporting limbs plus two wings and flags the
unresolved generic avian rig fit. A race's explicit catalog body-plan override
(e.g. Glaciemora, Leviara, Sylvaris, Aurelune) is retained rather than reset to the
race default. Unflagged entries still require actual image/shape review.

Icarus alone uses the inspected owner-selected V3 design sheet from
`/home/tiecont/Downloads/Aetheria_Icarus_Design_Review_V3/`. Its image SHA-256 is
recorded in the JSON. Adult human anatomy, 168 cm body height, no tail or animal
feet, pink hair, white feather wings at the upper back, white/gold layered dress
and Phoenix Fire Bow govern Icarus appearance. Canonical orange/crimson Fire
colors remain in effects and bow accents; the raw source colors remain untouched.
Hidden construction details are proposals, not new owner-approved views. This
reference is not a template for the other 239 Pets and is not uploaded or copied
by this text workstream. The machine-local image is optional in CI; if available,
the validator checks its exact recorded hash.

Run from the repository root:

```sh
python3 scripts/validate-pet-lore-design.py
python3 scripts/validate-pet-v31.py
node scripts/pet-design-check.mjs
```

The first command checks exact coverage/order, unique text, minimum substantive
length, Vietnamese text markers, exact canonical fields/source hashes, explicit
race overrides, palette/identity tokens in prompts, disclosed conflict notes and
Icarus-only appearance authority. It does not score literary quality or confer
art acceptance. Review of the authored content is `SINGLE_AGENT_SELF_REVIEW`.

Task: VL-121 (design specification slice); related taxonomy VL-130 and the
separate Limited/Standard production tasks remain open. This delivery is text
only: no generated images, models, rigs, clips, Unity imports, measured performance,
rights clearance or production publication. `DRAFT_ONLY / OFFLINE_ONLY /
NO_GO_PUBLIC`; style target `UNVALIDATED_TARGET`, image acceptance `NOT_RENDERED`.
