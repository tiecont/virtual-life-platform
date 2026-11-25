# Wave C2 — Arena8 authoritative match contract

Release: **OFFLINE_ONLY / NO_GO_PUBLIC**. Local/test only, default off.
This is the integration contract shared by Rust, Nest and Unity. It is not a
production API and grants no public release, purchases, rights or deployment.

## Authority

- Rust `Arena8Bound` + `MatchSnapshot` is the only combat authority.
- Nest authenticates the account and resolves ownership, map eligibility,
  level, authored skills, Skill Levels, Artifacts and encounter.
- Unity sends bounded intents and renders committed projections; it never
  supplies seeds, damage, outcomes, rewards, final stats or final Skill Levels.
- One native match has one durable settlement receipt.

## Owner-approved skills

Every active Pet exposes its complete authored skill set from Pet Lv1.
Pet level never gates access to an authored skill. Skill Level (candidate max
10) affects bounded effectiveness only. A non-Icarus Pet has no FIRE_ZONE.

## Internal Rust supervisor (loopback, Nest-only)

The supervisor is an explicitly isolated local bridge using `Arena8Bound` and a
durable JSON checkpoint directory. It is not the native Host/journal/admission
authority. It binds loopback only, requires `x-arena8-token` on every request,
and must generate its own match seed. Nest is its only caller.

`POST /allocate`

```json
{
  "requestId": "<uuid>",
  "allocation": {
    "account": "<uuid>",
    "ownedPetId": "<owned-pet-uuid>",
    "petId": "fire-coalwhisk",
    "level": 1,
    "encounterId": "cinder-terraces-regular",
    "artifacts": [{"definitionId":"core-emberglass","upgradeLevel":1}]
  }
}
```

Response:

```json
{"matchId":"<uuid>","version":0,"view":{...},"events":[]}
```

`POST /command`

```json
{"account":"<uuid>","matchId":"<uuid>","commandId":"<uuid>",
 "expectedVersion":0,"action":{"kind":"start"}}
```

Actions: `start`, `swap` + `first`/`second`, `guard`, `skill`,
`signature`, `fireZone`, `ultimate`. Unknown fields are rejected.

Response:

```json
{"matchId":"<uuid>","version":1,"receiptId":"<id>","view":{...},
 "events":[{"sequence":0,"event":{...}}]}
```

`GET /matches/:matchId` returns `{matchId,version,view,terminal}`.
`GET /matches/:matchId/owner` is the Nest-only ownership check.
Duplicate `commandId` returns the original receipt; reusing it with changed
content is rejected. Stale `expectedVersion` and foreign accounts are rejected.
Allocation `requestId` is idempotent; reusing it with changed content is rejected.

## Nest API (authenticated Unity endpoint)

All routes are under `/v1/pets/wave-a/arena8`, require the existing local
session, exact origin/CSRF on POST, and return private no-store. All request
bodies carry a UUID `requestId` except GET; retries are idempotent.

`POST /allocate`

Request: `{requestId,petId,mapId,encounterId}`.
Nest validates ownership, map/encounter eligibility, exact level, authored
skills/Skill Levels and current Artifacts, then calls the supervisor.
Response: `{matchId,version,view,allocation:{petId,mapId,encounterId}}`.

`POST /command`

Request: `{requestId,matchId,expectedVersion,action}`.
Nest verifies the match belongs to the account, forwards the bounded action
and returns `{matchId,version,receiptId,view,events,terminal}`.

`GET /matches/:matchId` returns the safe projection.
`POST /matches/:matchId/settle` with `{requestId}` reads the authoritative
terminal view and applies the one durable settlement receipt. Repeating it
returns the original `{settlement,state}`.

## View

The view contains ruleset/pet/stats/artifacts/modifiers/skills/encounter/phase/
turn/board/health/enemyHealth/enemyShield/mana/rage/cooldown/fireZoneTurns/
telegraph/terminal plus `matchId` and `version`. `skills` is the complete
authored list, not a level-filtered list. Each skill contains
`{id,unlocked,skillLevel,maxSkillLevel,canCast,reason}`; `canCast` is computed
from the authoritative phase/resources/cooldown. Speed is present but inactive.

## Settlement

On terminal, Nest writes exactly one receipt keyed by native `matchId` plus
account. Effects: encounter/map completion, EXP/level, coins, recruitment,
Artifact acquisition/material, and Skill-upgrade material support. Duplicate
or concurrent settles return the original result. An active match is never
mutated by later Artifact/Skill changes; a new allocation captures them.

## Error codes

`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_REQUEST`,
`MAP_LOCKED`, `NOT_OWNED`, `MATCH_COMPLETE`, `STALE_COMMAND`,
`DUPLICATE_COMMAND`, `SETTLEMENT_CONFLICT`, `RUNTIME_UNAVAILABLE`.

## Wave D2 — cooperative ruleset configuration contract

`arena8-coop-pve` is a separate, versioned four-seat ruleset. Unlike the frozen
solo `arena8-pve` binding tables, it carries **no authored gameplay number in
Rust**: every HP, ATK, DEF, critical, resource, multiplier, skill, phase and
schedule value is read from a typed JSON bundle that PostgreSQL owns and Admin
publishes.

- Canonical seed/candidate bundle:
  `config/gameplay/arena8-coop-v1.seed.json` (explicit seed data, not a live
  authority). Its canonical digest is pinned in
  `config/gameplay/arena8-coop-v1.digest`.
- Engine capability: `arena8-coop-v1`; bundle schema version `1`; content digest
  domain `aetheria.arena8-coop.config.v1`; native adapter content hash domain
  `aetheria.arena8-coop-native.v1`.
- Structural engine bounds stay in Rust: 8x8 board, 64 cells, four seats, the
  six MVP elements, the 4096-turn and cascade-depth safety ceilings. Authored
  encounter values never do.
- Deserialization is strict (`deny_unknown_fields`) and validation rejects
  duplicated identities, dangling skill/Pet references, unsupported effect
  kinds, out-of-range effectiveness, incomplete matrices, invalid multiplier
  schedules, invalid Boss phase ranges, growth cycles and empty distributions.
- Fail closed: an absent, malformed or incompatible bundle is an error. There is
  no fallback table and no hidden default.
- Authoritative validation for publication:
  `aetheria-game-runtime --check-gameplay-config <bundle>`. It prints
  `{"engineCapability":"arena8-coop-v1","digest":"<sha256>"}` and exits
  non-zero on any defect, so the control plane never re-implements the schema.
- An active match retains its original configuration digest and immutable
  bundle for the whole match, including restart. A later publication applies
  only to new allocations.

### Implemented in this increment

- Configuration-driven cooperative engine (`crates/aetheria-pet-arena/src/arena8/coop/`),
  canonical state/board/engine digests, deterministic server-entropy RNG reuse,
  bounded cascades, gravity/refill, dead-board recovery, mixed-multiplier
  element matching, one-time Boss phase transition, typed effects, and
  contribution settlement payload.
- Rust conformance tests (`crates/aetheria-pet-arena/tests/arena8_coop.rs`,
  `arena8/coop/tests.rs`) and the authoritative publication validator.

### Not yet implemented (explicit boundary)

- PostgreSQL configuration tables, draft/validate/publish/rollback lifecycle,
  optimistic concurrency and audit trail.
- Admin API and Next.js editors, simulation runner, and the four-seat native
  runtime, admission, rooms, Achievement Point ledger, settlement persistence and
  Unity cooperative presentation.
- These are tracked as Wave D2 backlog tasks; nothing here is a public release
  or production balance approval.
