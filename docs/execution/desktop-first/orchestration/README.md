# VL-017 native command persistence

`vl-persistence` is an opt-in library. The shipped health executable does not
depend on it or mount a game route. No migration, grants or production activation
run at startup. The existing Nest migration journal and legacy writer remain.

The trusted allocator supplies a native world, logical boot, engine digest,
reviewed deterministic `Game` implementation and dedicated AES-256-GCM storage
key ring. The host holds a PostgreSQL session advisory lock for that world;
transactions verify the exact backend/lock and the current allocator boot/lease.
World allocation and command authorization use VL-013's existing lock order.
The role connects with explicit CA, hostname verification, TLS and channel binding.
The injected transaction clients must use that same trusted connection helper.

Each command revalidates the current admission, identity, session, sanctions and
consumed ticket nonce. Under the match row lock, it decrypts and validates the
snapshot, checks current membership, then looks up the actor/command receipt.
The same fingerprint returns the original recipient bytes; a changed action,
epoch or expected version under that ID fails as a collision. A new command must
match the authoritative version/epoch, ACTIVE state and domain turn authorization.
The actor comes only from the admitted session, never from a request field.

The pure reducer's next checkpoint, encrypted receipt/events and optional
completion settlement/outbox commit together. Domain errors roll back to a
savepoint; SQL errors, authorization/owner loss, timeout and cancellation cannot
return success. The outer trust boundary rechecks policy and commits before
`execute` returns the receipt. The host itself performs no publish or network I/O.
Fresh `projection` reads apply current policy and membership as well.

Snapshot envelopes bind world, match, rules/content/engine, epoch/version and
purpose. Receipt envelopes additionally bind actor and command; events bind
their index. The encrypted snapshot includes seed, RNG cursor, clocks, checkpoint
version and audit hash and verifies their SQL metadata on restore. Storage keys
are distinct from ticket signing keys. Fresh 96-bit nonces and authenticated tags
are mandatory; missing old keys or modified/swapped envelopes fail closed.
The key ring retains at most eight keys; state/projection/plaintext sizes are bounded.
Private decrypted envelope buffers and seeds use zeroizing wrappers. Domain-owned
state lifetime and recipient projection correctness still require domain review.

The three-turn example is synthetic, not Pet Arena or Lodge. Completion accepts
only a null sentinel and emits a fixed nonprivate completion proposal. It cannot
mint currency or forward arbitrary private settlement payloads. The platform
outbox consumer/ledger is VL-018; distributed takeover and epoch recovery are
VL-020. Restart proof retains the allocator's logical boot under a valid lease,
reacquires the single-owner lock and obtains fresh admissions/tickets. It does
not claim failover after boot replacement or legacy namespace cutover.

## Actual verification

```sh
CARGO_TARGET_DIR=artifacts/rust/target cargo build --locked --package vl-persistence --example orchestration
node scripts/with-test-db.mjs node --import tsx scripts/native-game-orchestration.mjs
```

The harness creates and cleans its own DB, schema, restricted role, ephemeral
TLS PKI and actual Rust children. It proves 24 scenarios and 12 denied privileges,
including concurrent retries/final turns, unread postcommit ACK recovery after
SIGKILL, precommit SIGKILL rollback, SQL event/outbox failure, transaction deadline,
lease expiry after writes, owner connection loss, turn/nonmember denials, key
rotation and ciphertext integrity. Keys, credentials, player state and raw Rust
responses stay in ignored private artifacts; committed evidence holds hashes.

The injected 2.5-second SQL sleep intentionally blocks VL-013's allocator lock.
Only lock-timeout errors observed during that named fault are recorded as expected
heartbeat failures; other heartbeat failures fail the harness. The existing global
admission lock and five-second lease limit throughput. No load/SLA qualification
or automatic heartbeat recovery service is claimed. Reducers are trusted bounded
code; the async effect deadline cannot preempt arbitrary synchronous plugin code.

Local results and retained failures are in `LOCAL-CHECKS.json`. Hosted CI at the
exact source and a separate same-agent audit are required before coordinator
verification; this document alone is not acceptance or a release approval.
