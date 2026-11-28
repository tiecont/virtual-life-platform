# Campaign V4 roster and route draft

The [Wave A canonical roster](wave-a-canonical-roster-v1.json) remains the
identity registry. The [V4 content draft](campaign-v4-content.json) adds
development assignments under D05 and D06 to those same stable IDs.

Each of the six existing maps has eight ordered candidate encounters. Three
entry routes use B-rank Pets, three advanced routes use A-rank Pets and the
elemental Bird, and two Boss routes use the legendary map Pet and elemental
Dragon. Each route after the first requires the preceding encounter. The
candidate recruitment contract is a first qualified clear of that encounter.
The 48 route IDs are distinct from the existing regular and Warden encounter
IDs. The route draft has acquisition disabled while versioned eligibility,
encounter profiles and settlement are implemented and qualified. Existing map
rewards and recorded ownership continue through their original contract.

Vulcaryn, Nerivelle, Fulgarys, Umbryss, Jaderyx and Solenne each have a candidate
Standard S combat kit. The six kits add 24 Level 1 ability bindings to the 221
existing IDs. Their stats, growth, costs and cooldowns are balance candidates.
Each has display names in VI, EN, JA, KO and ZH, a rig profile assignment and
the shared Standard animation contract. Geometry, animation and VFX require
production and review. The original concept provenance applies, including
Solenne's outstanding rights review. The six remain unavailable via all
existing acquisition paths. The Standard S banner has neither an enabled pool
nor authored probabilities.

Compose and inspect the draft before passing its bytes to the Rust engine
validator. Use a separate output file so shell redirection does not truncate
the input.

```sh
node scripts/campaign-v4-content.mjs "$V4_ENGINE_DRAFT" --bundle > "$V4_ROSTER_DRAFT"
node scripts/campaign-v4-content.mjs "$V4_ROSTER_DRAFT" --summary
node scripts/campaign-v4-content.mjs "$V4_ROSTER_DRAFT" --inventory
aetheria-game-runtime --check-gameplay-config "$V4_ROSTER_DRAFT"
```

The inventory joins the existing asset metadata to the assignments for all 61
Pets. It records available references and current production stages. Draft
composition performs no database writes and never grants player entitlements.
Published gameplay and later eligible acquisition remain owned by the existing
versioned PostgreSQL and Admin workflows.

Generate the schema 7 operator draft with `node scripts/campaign-route-candidate.mjs`.
It joins the 48 canonical routes to separate encounter profiles from
`config/gameplay/candidates/map-encounters.json`. All routes start disabled.
Admin can enable an encounter and its prerequisite chain in a validated version.
An active allocation keeps its published version, encounter ID and digest.


Use `node scripts/campaign-route-candidate.mjs --warden-response` to prepare
the alternative six-Warden draft for Admin review. It applies the measured
HP and telegraph values to the Warden encounters after assembling the 48
recruitment profiles. Solo and co-op receive the same opponent values. Run
`aetheria-game-runtime --check-gameplay-config` on the materialized bundle
before submitting its bytes to the existing Admin draft workflow.
