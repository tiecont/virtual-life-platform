# VL-016 additive native storage

Migration `0048_native_game_storage.sql` is owned by the existing Nest numbered
checksum journal/advisory lock. The original47 SQL, legacy `engine_game_*` data,
identity, RoomAuthority and immutable planning ledgers are preserved. No Rust
automigrator, production DDL, role provisioning or runtime activation is added.
The historical0048 reservation remains unchanged; its implementation addendum is
`migration-reservations/0048-implementation.json`.

## Data contract

Separate `game_native_*` tables hold native matches, accepted receipts, encrypted
canonical events, one settlement proposal and its outbox. They use the deployment's
existing configured search path, as do the legacy tables. This is an additive table
namespace, not an already provisioned schema/SQL privilege boundary. A runtime DB
role must later receive only explicitly required native DML rights; this migration
does not grant roles, passwords or access to platform tables. No caller currently
uses these tables in production. Never use the migration owner as runtime identity.

Matches pin native-world namespace, ruleset/content/engine SHA256, protocol,
canonical/RNG versions, owner boot UUID and forward-only epoch/version. SQL triggers
reject rule/seed reinterpretation, clock/cursor regression and owner changes
without epoch advance. A row lock at receipt/settlement insertion rechecks the
current checkpoint epoch/version; settlement additionally requires SETTLING.
Snapshot CAS must include owner_boot_id, epoch, expected version and lifecycle.
Epoch values and owner UUIDs alone are not proof of authority or a distributed
lease. The default is still one runtime owner. Actual ownership acquisition,
participant/session/policy validation, per-match command serialization and bounded
transaction/lock timeouts are VL-013/017 responsibilities, not SQL authentication.

Receipts key `(match_id, actor_id, command_id)` and record a SHA256 payload
fingerprint. A second unique `(match_id, committed_version)` prevents accepting two
transitions for one version, including actors with different command IDs. The
host must compare a duplicate fingerprint before replaying its original ACK;
ID collision must not be treated as successful retry. Rejected commands never
advance match state or create accepted receipt/event/settlement rows. Rejection
receipt policy is a future orchestration contract. The schema does not itself
execute reducers, enforce exact +1 transitions or make a checkpoint update and
receipt atomic; the host must commit them in one transaction. Tests exercise that
actual SQL transaction shape without claiming an implemented Rust command host.

Events require an existing receipt with matching epoch/version and an index0..511.
Settlement is unique per match and is an immutable-by-owner convention proposal,
not a wallet transaction. Outbox is unique per match/effect and per settlement/effect
and references its real settlement. Nest economy consumption, authenticated
transport, inbox deduplication, retries/dead letters, retention and reconciliation
are later tasks. No exactly-once transport or reward credit is claimed.

Match snapshots, ACK data and canonical events are private AEAD envelopes (12byte
nonce/16byte tag, key ID and bounded ciphertext). Host encryption must bind match,
version/epoch, content/rules and purpose as associated data with fresh nonce/key
lifecycle. SQL checks shape/size only and cannot prove encryption/authenticity.
Snapshot payload must include private reducer state and encrypted secret seed;
never write plaintext seed/cards/actions to columns, public projections or logs.
Settlement JSON is a bounded object for minimal authorized effect proposal only;
no secrets, hidden cards, arbitrary client fields or access credentials. Hashes
are server-only metadata; they do not provide privacy for low-entropy values.

SQL versions/epochs use positive signed bigint (version0 genesis); the host must
reject values above i64::MAX rather than truncate Rust u64. Logical tick/time and
RNG cursor use numeric(20,0), constrained to full u64 and transferred as decimal
strings. No floating conversion. Ruleset version uses positive signed32bit; host
validates bounds against the pinned Rust contract. JSON proposal content/hash
must be independently canonicalized/validated by the economy adapter.

## Migration And Rollback

Expand only; no down migration or data rewrite. The exact prior47 API source
`5386a8cd3cf3e4360fd55f8f06bc84d159ff540b` is archived and built from its committed
TypeScript, reusing installed external dependencies through isolated symlinks.
Its strict readiness/migrator reject48. The exact-prefix policy
`config/schema-compatibility-0047-native-expand.json` is a qualification candidate
until independent review; it permits only47..48 with original and new checksums.
No deployment uses this file automatically. Never replace a checksum policy with
an unbounded wildcard. Older46 rollback policies are not extended to48.

The compatibility harness starts the actual prior API on47, issues a browser
identity, creates a legacy fixture, expands with two current migrators while the
old API runs, restarts strict-old (refusal), restarts declared compatible-old
(ready), then rolls forward to current48. It verifies exact journal rows, identity,
legacy row and private AEAD fixture bytes/decryption; old/tail checksum corruption
and unknown suffix fail closed. Native gameplay recovery/drain is unqualified
until an actual Rust host exists. No production backup/rollback/release evidence.

## Checks

```sh
pnpm --filter @virtual-city/platform-api build
node scripts/with-test-db.mjs pnpm exec vitest run --project integration tests/integration/native-game-schema.test.ts
node scripts/with-test-db.mjs node --import tsx scripts/native-game-migration-compat.mjs
```

Six real-PG tests cover two concurrent migrators, eight racing finalizations with
one receipt/event/settlement/outbox, stale boot/epoch/version rejection, atomic
rollback on invalid event/settlement, canonical range/content/lifecycle negatives,
and cross-row effect integrity. Both commands use owned random schemas and the
wrapper's disposable DB, with schema/container/network cleanup. Same checks run
in read-only Ubuntu RustCI. Preservation separately proves original47SQL/105input/
209archive bytes unchanged; recognizing0048 does not qualify it as historical work.
