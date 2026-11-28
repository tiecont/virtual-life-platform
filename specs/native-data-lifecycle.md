# Native Gameplay Data Lifecycle

Status: DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC. This is the maintained VL-055
privacy and recovery design. It records source behavior and required decisions;
it is not retention approval or authorization to delete production data.

## Historical draft baseline

This draft preserves the offline single-account implementation on the merged
`d4232328` baseline. Later main revisions assigned journal entry 0055 to Wave 1
state. A forward port requires a new additive migration, compatibility checks
against the current journal, and review of the current cooperative account
erasure and settlement contracts. Keep this migration confined to the
historical baseline.

## Offline implementation since migration 0055

The single-account Pet path records its participant and sealed genesis in the
allocation transaction. It retains sealed reducer inputs and replays accepted
commands on recovery. The identity privacy port discovers indexed matches even
with login features disabled. Offline export returns an account's match metadata
and settlement/reward summary; it never exports the RNG, keys or replay inputs.
Erasure fences admission and coordinates with native turns and reward delivery
using the canonical account lock. Unreconciled old Pet rows block the affected
privacy path; this migration cannot reconstruct missing historical inputs.

The supported logical restore target is an empty, isolated disposable database.
Before Pet serving resumes, the recovery adapter reconciles it against the
original authoritative database and invalidates restored admission and leases.
The original must still exist and be current. This is not an independently
custodied deletion register: it does not qualify source loss, physical clones,
in-place rollback, or production recovery. The offline path establishes no
retention period, production export policy, or key custodian.

## Ownership before migration 0055

Nest owns the SQL migration journal, identity account locks, privacy requests and
platform reward ledger. Rust owns new gameplay commands and encrypted match
state. Legacy room writes remain with Nest RoomAuthority. Runtime database roles
cannot delete journals, write platform rewards or bypass identity admission.

Migration 0048 stores encrypted snapshots, receipts and events. Receipt actor IDs
are plaintext account UUIDs without an identity foreign key. Snapshot payloads
can also identify the configured participant. A match has no separate account
index before its first receipt. Deleting an identity therefore does not erase or
anonymize the native game journal automatically.

Migration 0050 cascades account deletion to platform reward ledger rows. Its
reward inbox and native settlement/outbox remain independent records. Removing a
ledger row alone does not erase the native actor link or prove that a backup can
be restored without reviving deleted personal data.

The identity service's `registerExportOwner` and `registerDeletionOwner` ports
currently integrate the legacy game journal. `registerNativePrivacy` integrates
native device metadata only. Native gameplay journals and native completion
ledger exports do not yet have those handlers. Login flags must not hide data
from a future privacy handler.

## Baseline backup and recovery boundary (before 0055)

The Pet Arena win/loss process suites stop their source host, create an AES-GCM
PostgreSQL archive and restore it into a separate empty disposable database.
They compare exact hashes for matches, events, receipts, settlements, outbox,
reward inbox/ledger and migration rows. Authentication rejects a wrong archive
key or damaged ciphertext before any target SQL. An occupied target is refused.

Restored roles are recreated from the existing least-privilege contracts. Rust
uses explicit CA-verified PostgreSQL TLS and the original encrypted state keys.
The trusted fixture allocator must explicitly reacquire the restored scope;
an archived lease is not continuing authority to serve. Incorrect runtime keys
or an incompatible engine must fail before listening, while intact recovery
must expose the correct readiness ruleset without changing game data.

These tests cover the current fixture's full database dump. They do not establish
offsite custody, PITR, recovery time targets, production key rotation or retention
periods. Authenticated envelopes and contiguous recorded event indices do not
prove reducer replay from genesis or detect deletion of every event for a turn.

## Privacy requirements

1. Add a journaled participant ownership index covering a match at version zero.
   An additive migration and the Rust allocator must populate it consistently;
   receipt discovery alone cannot find an unstarted match. Shared matches need
   explicit participant and redaction semantics before they are introduced.
2. Register account-scoped export through the existing identity privacy port.
   Return approved own gameplay history and platform settlement information.
   Never return RNG state, storage keys, snapshot ciphertext, ticket/session
   credentials or another participant's private projection. Decryption belongs
   to a reviewed native owner adapter, not a second Nest gameplay authority.
3. Use the canonical account lock, revoke admission and fence the active writer
   before erasure. Coordinate match and outbox locks with the reward worker's
   account lock order. Test deletion racing a committed turn, worker retry,
   pending settlement and process restart. A deleted actor must not regain a
   grant through outbox redelivery or a restored checkpoint.
4. Apply the approved erase/redact policy to snapshots, receipts, events,
   settlements, outbox and platform reward links atomically. Do not remove a
   receipt from a live checkpoint and leave an unrecoverable match. Define the
   treatment of shared history before deleting data belonging to another actor.
5. Apply privacy tombstones or an approved equivalent before a restored database
   can serve. Tombstones need a defined retention/custody policy and must not
   become an indefinite shadow account directory. Prove restore after deletion,
   stale backup replay, wrong/missing tombstones and no post-deletion rewards.

## Decisions Still Required

- Owner-approved retention periods for active/finished journals, receipts,
  settlement deduplication, encrypted backups and deletion records.
- Approved export fields and the treatment of abandoned version-zero matches.
- Erasure versus anonymization for shared history and abuse/economy evidence.
- Backup key custody, rotation, expiry and how deletion survives archive restore.

No values are inferred from source implementation or a green CI run. Until the
owner decisions and recovery qualification are complete, VL-055 remains IN_PROGRESS and
native public rollout remains closed. Unrelated offline source work may proceed
under the repository's implementation/qualification separation.
