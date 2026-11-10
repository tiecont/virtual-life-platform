# VL-013 durable admission slice

This internal, default-off slice adds migration 0049 through the existing Nest
numbered checksum journal. It does not compose a public issuer, runtime command
endpoint, production credentials or a second legacy room writer. SQL worlds
start disabled. The original 47 migrations and native storage 0048 remain intact.

`RuntimeAdmissionStore` owns durable account/world generations, bounded leases,
one active native-world admission per account, capacity and canonical account
then allocator lock ordering. The issuer reads the real session, sanction and
admission within its transaction. Rust `DurableTrust` consumes a nonce durably,
binds sessions to its process domain, takes the same locks and checks policy both
before and after a trusted callback on the borrowed PostgreSQL transaction.
Callback errors, authorization failure and timeout roll back its SQL effects.
This trusted adapter API cannot prevent arbitrary trusted code from deliberately
using another connection or external side effects; callbacks must use its transaction.

Actual local checks on 2026-11-10:

- Rust 1.99.1 fmt, workspace check, Clippy `-D warnings`, 25 tests and one
  compile-fail doctest pass with the locked dependencies. The first sandboxed
  check failed on process permissions; the explicit approved rerun passed.
- Disposable PostgreSQL integration: 14/14 tests pass across runtime admission,
  native storage races and schema compatibility. The initial run was 13/14:
  the old storage test asserted 48 migrations before source 0049 was committed.
  It now derives manifest length and separately pins the 0048 checksum.
- `node scripts/with-test-db.mjs node --import tsx
  scripts/runtime-admission-durable-check.mjs`: 17/17 scenarios pass. One
  authorized command commits one version and receipt. Forgery, expiry, wrong
  scope/generation, pre-admission revocation, callback rollback, foreign-domain
  session and nine post-admission revocations leave version/receipt counts zero.
  Each admitted probe also rejects a second admission with the same nonce.
- Real archived APIs at 5386a8c (47 migrations) and aca14de (48) both pass
  expand/runtime rollback/current49 roll-forward, two concurrent migrators,
  checksums and unknown-future negatives, identity and old game-data retention.
  The historical 47-to-48 policy is preserved; separate exact 47/48-to-49 policies
  declare expansion without destructive down migration.
- API build, focused lint, legacy test TypeScript, architecture and CI contract
  pass. Precommit governance is 118/119 because its source-policy test compares
  HEAD48 to dirty49; rerun against the committed source is required.

Raw facts and hashes are in `DURABLE-ADMISSION-CHECKS.json`. Rust CI now builds
the durable probe into the declared target directory and runs it, the admission
integration tests and both archived-runtime compatibility checks on disposable PG.
No hosted success is inferred from these local results.

The probe deliberately uses localhost `NoTls` with the disposable DB owner.
Production TLS identity verification, restricted runtime DB role and authenticated
composition remain unfinished. Synthetic storage effects do not qualify actual
gameplay rules or turn orchestration. Task VL-013 remains IN_PROGRESS; this agent
is now the implementer/coordinator under the owner's single-agent direction and
does not author independent approval for its own changes. VL-017 stays gated.
