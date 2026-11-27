# Native gameplay runtime

The runtime is default-off. NestJS keeps identity, admission, safety and the
platform ledger; legacy rooms continue through Nest RoomAuthority. This binary
uses the existing single-writer `aetheria-persistence::Host` for both native rulesets.
It never migrates the database or grants platform rewards.

The isolated Linux process suites are reproducible without Unity:

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm --filter @aetheria/platform-api build
cargo build --locked --package aetheria-game-runtime
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --pet-arena
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --pet-arena-loss
```

Each suite owns disposable PostgreSQL, restricted roles, ephemeral TLS material,
a loopback Nest HTTPS/WSS gateway and an actual Rust process. Facts and private
fixture material stay under ignored `artifacts/`. These are developer tests,
not a production activation or Unity player qualification.

For a reviewed local allocator, the existing explicit `AETHERIA_GAMEPLAY_ENABLED=1`,
`AETHERIA_GAMEPLAY_CONFIG` and `AETHERIA_GAME_DATABASE_URL` configuration is required. The
upstream bind must be loopback behind trusted TLS. The configuration file is
private: it includes the exact world, leased logical boot, match UUID, player
UUID, ticket public keys, PostgreSQL CA and role, HTTPS origin, engine digest,
and storage key ring. Do not place credentials or key material in source or
Unity assets. A missing/incompatible key, scope, checkpoint or ruleset fails
closed. A new logical boot requires the existing authorized recovery procedure.

Recovery also authenticates historical receipt and event ciphertext and hashes
in pages of sixteen records. Every checkpoint version must have its receipt;
event indices must be contiguous within each recorded turn. The runtime role
can read the encrypted event journal for this check and cannot update/delete it.
Missing historical keys, damaged snapshots/journals and an incompatible engine
stop startup before a listener opens, preserving state and pending settlement.
The Pet Arena process suites exercise these failures and then resume the intact
match through a terminal outcome. The Pet suites also restore encrypted
mid-match and terminal database archives into separate empty loopback PostgreSQL,
compare exact journal/reward/migration hashes, and start the actual restricted
TLS Rust host after explicit allocator lease reacquisition. Wrong archive/runtime
keys, tampering, occupied targets and incompatible engines remain denied.
These checks do not prove complete reducer replay from genesis, detect deletion
of every event for a turn, or qualify production backup custody, retention or
deletion policy. See the [native data lifecycle](../../specs/native-data-lifecycle.md)
for the remaining account export/erasure and restore-after-deletion requirements
of VL-055.

The `headless-counter` ruleset remains a synthetic three-turn transport fixture.
The `pet-arena-pve` ruleset runs the pinned `aetheria-pet-arena::combat::Combat` reducer.
It additionally requires server-selected `pet` (0–7) and `stage` (0–5). The client
cannot select those fields or supply entropy, damage, outcomes or reward values.
Obtain its adapter content hash with:

```sh
artifacts/rust/target/debug/aetheria-game-runtime --ruleset-content-hash pet-arena-pve
```

Use that exact hash for the allocator and scoped ticket configuration. The
adapter hash binds the combat hash and native membership/terminal contract;
it is intentionally different from the pure combat content hash.

Send `GameIntent.kind = pet.intent.v1` with UTF-8 JSON
`{"epoch":1,"action":{"kind":"start"}}`. Actions are `start`, `skill`, `pass`,
or `{"kind":"swap","first":0,"second":1}`. All reject unknown fields. The
protobuf envelope supplies the immutable command UUID, match UUID and expected
state version. Reuse the same UUID and payload for ambiguous-result retries.
`pet.view.v1` with an empty action payload reads the caller's current projection.
Only the configured participant may command, read or replay this match. The
projection contains board, combat health in fixed-point raw units, cooldown,
phase and committed telegraph; it excludes checkpoint secrets and RNG state.

Both wins and losses commit a terminal checkpoint, authenticated receipt,
nonprivate completion proposal and outbox atomically. The Nest worker requires
an explicit `NATIVE_REWARD_POLICY_FILE` with `completionKind` set to
`pet-arena.completed.v1`, matching world/ruleset/version/content hash and an
approved `rewardKey`. Only a winning outcome and a currently eligible active
receipt actor receive that nonmonetary completion marker. Losses reconcile as
`DECLINED`. No currency amounts or wallet writes are accepted. Before the worker
commits, caller projections return `REWARD_PENDING`; repeated delivery, receipt
replay and reconnect expose the reconciled result without a second grant.

Unity scene integration and actual Editor/player execution remain VL-081.

With explicit Aurora movement enabled, `fixture.advance.v1` also requires the
account's canonical zone position within the exported activity-terminal radius.
The manifest references the terminal collider GUID; its center and Unity's
interaction radius are exported together. All sockets for one account serialize
movement and game execution until the durable effect finishes. Host policy,
membership and receipt authentication still apply. New remote commands return
`NOT_IN_PROXIMITY`; an immutable committed retry remains readable after walking
away or restarting. Views and Pet Arena battle actions have their own admission
and do not inherit the synthetic terminal requirement. Movement remains opt-in;
nonmovement headless fixtures retain their existing command contract.

Liveness remains distinct from readiness: `/health/live` reports the process;
`/health/ready` checks the zone, owner lease, checkpoint and stored journal integrity.
`/metrics` contains aggregate receipt/rejection counters only; successful receipt
replays count as receipts. The checked-in OCI image keeps gameplay disabled.

## `arena8-pve`: data-bound 8x8 Arena8 ruleset

`arena8-pve` is a new versioned native ruleset. It reuses the same
`aetheria-persistence::Host` single-writer command/checkpoint/journal/admission
path and the same gateway as `pet-arena-pve`; only the domain reducer, the strict
intent parser and the authored projection differ. The frozen `pet-arena-pve`
V1 adapter and its receipts are untouched.

The match is allocated from an immutable snapshot built by the versioned Arena8
content binding (`crates/aetheria-pet-arena/src/arena8/binding.rs`,
`aetheria-pet-arena-arena8-binding` v2, pinned digest
`198351cc3b4f8c2e493e5f60602fddf2c368c6052f176d904060d508ffa5b5ae`). The
snapshot binds the canonical roster identity, account, owned Pet id, level,
base/grown/effective stats, equipped Artifact definitions and levels, bounded
modifiers, complete authored skills available from Pet Lv1, the encounter and
its revision, and the binding and rules digests. A later loadout change never
alters an allocated match; a new match is required. Restoring a rewritten
snapshot fails closed. Pet level gates Artifact ranks, never skill access.

The allocation is server-authored private configuration. It is not an intent
field and no client can send it:

```json
{
  "ruleset": "arena8-pve",
  "arena8": {
    "petId": "fire-coalwhisk",
    "ownedPetId": "<owned pet UUID>",
    "level": 20,
    "encounterId": "cinder-terraces-regular",
    "bindingVersion": 2,
    "artifacts": [
      {"definitionId": "core-emberglass", "upgradeLevel": 1},
      {"definitionId": "aegis-bastionplate", "upgradeLevel": 5}
    ]
  }
}
```

The rest of the file keeps the existing required fields (`player`, `match_id`,
keys, CA, role, origin, engine hash, and so on). `pet`/`stage` are rejected for
`arena8-pve`, and an `arena8` object is rejected for every other ruleset.

Obtain the adapter content hash for the allocator, ticket scope and reward
policy with:

```sh
artifacts/rust/target/debug/aetheria-game-runtime --ruleset-content-hash arena8-pve
```

Send `GameIntent.kind = arena8.intent.v1` with UTF-8 JSON
`{"epoch":1,"action":{"kind":"start"}}`. Actions are `start`,
`{"kind":"swap","first":0,"second":1}`, `skill`, `signature`, `fireZone`,
`ultimate` and `guard`. Every payload rejects unknown fields; there is no seed,
damage, target, outcome, reward or loadout field. `arena8.view.v1` with an empty
payload reads the caller's projection. Both rulesets reuse the existing
`pet-arena` proximity interaction id.

The projection exposes the bound pet identity and level, base/grown/effective
stats, each equipped Artifact and its modifiers, the available skills, the
encounter revision, the 64-cell board, resources, committed telegraph and the
snapshot digest. It never contains the account, seed, checkpoint or RNG state.
`modifiers.speed` is projected with `"active": false` and an explicit reason:
Arena8 has no initiative or turn-order model, so speed is recorded but has no
combat effect. `hp`, `attack` and `defense` are active and bounded.

Both a win and a loss commit a terminal checkpoint and the existing
`pet-arena.completed.v1` completion proposal, so settlement reuses the existing
nonmonetary reward worker path.

## `arena8-coop-pve`: configuration-bound four-seat cooperative ruleset

`arena8-coop-pve` runs the cooperative reducer from an engine-validated bundle.
Publication is authorized by `aetheria-game-runtime --check-gameplay-config
<bundle>`, which prints the canonical configuration digest and the adapter
content hash. The runtime never carries fallback balance values: a missing,
malformed or incompatible bundle refuses to start. The allocator writes the
published bundle to a private file and starts the runtime with
`AETHERIA_GAMEPLAY_BUNDLE=<absolute file>` in addition to the existing
`AETHERIA_GAMEPLAY_CONFIG`, `AETHERIA_GAME_DATABASE_URL` and TLS settings.

The allocation is a server-authored four-seat roster inside the settings file:

```json
{
  "ruleset": "arena8-coop-pve",
  "coop": {
    "seats": [
      {"account": "<account UUID>", "petId": "icarus", "level": 1, "artifactPowerPm": 1000},
      {"account": "<account UUID>", "petId": "coralline", "level": 1, "artifactPowerPm": 1000},
      {"account": "<account UUID>", "petId": "volt", "level": 1, "artifactPowerPm": 1000},
      {"account": "<account UUID>", "petId": "terran", "level": 1, "artifactPowerPm": 1000}
    ]
  }
}
```

Every seat must be distinct and authorized by the allocator; `pet`, `stage` and
`arena8` are rejected for this ruleset. Each of the four authenticated sessions
is projected its own `you` seat and the shared committed state. Intents use
`GameIntent.kind = arena8-coop.intent.v1` with
`{"epoch":1,"action":{"kind":"start"}}`, `swap` (`first`, `second`), `guard`,
`skill`, `signature`, `ultimate` or `fireZone`; unknown fields are rejected.
`arena8-coop.view.v1` with an empty payload reads the caller's projection.
Durable restore revalidates the configuration digest, the four seat identities
and the committed state; a later published bundle never resumes an old match.

### Comparing cooperative encounters

Use the runtime executable offline with an exported bundle file. A single
simulation accepts an optional boss ID after the seed count. Without it, the
command uses the first authored encounter. A comparison runs all four policies
for each of one or two explicitly selected encounters, using seeds 1 through
the supplied count for every row.

```sh
aetheria-game-runtime --simulate-coop config/gameplay/arena8-coop-v2.seed.json tactical 12 tideglass-lagoon-warden
aetheria-game-runtime --compare-coop config/gameplay/arena8-coop-v2.seed.json 12 cinder-terraces-warden tideglass-lagoon-warden
```

The Admin gameplay workspace uses the saved version and supports 1–200 seeds
for a single run or 1–25 per comparison row. Pass `--party <file.json>` after the encounter arguments to simulate four
specified Pets with their levels, Skill Levels and Artifact loadouts. With no
party argument the harness uses the first four authored Pets in seat order,
cycling through shorter catalogs, at level 1 with zero Artifact power. Each row reports the selected boss and the engine's
canonical bundle digest. Multiplier occurrence counts matches where a
multiplier tile appeared on a committed board. Duration uses one simulated
second per accepted action. Contribution totals are summed across seeds per
seat. These runs measure the supplied party and automated policies.
