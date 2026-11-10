# VL-013 PostgreSQL TLS and restricted-role continuation

The durable probe now uses a separately authenticated non-inheriting login role
and TLS for every Rust connection. `connect_runtime_postgres` requires an explicit
CA, verifies the hostname through native-tls, disables built-in trust roots,
requires TLS1.2 or newer and SCRAM channel binding, and bounds connection and role
validation time. It verifies current/session identity, rejects privileged flags,
memberships and schema/table/database ownership. It does not provision a role or
activate a route. Direct SQL policy reads use this authenticated connection;
there is no new internal policy RPC in this slice.

The checked-in privilege profile is an inactive disposable-proof specification.
Only its wrapper-owned test harness creates credentials/grants. It can read
required policy columns, insert used nonces and synthetic receipts, and update
only checkpoint state_version. The invoker receipt trigger reads all checkpoint
columns, so that SELECT list includes encrypted snapshots. No cleartext snapshot
key is granted. Identity/session secrets, policy/allocator writes, owner epoch
takeover, legacy game writes, journal access and DDL are denied. This is the probe
profile, not a claim of all future orchestration privileges or row-level isolation
between independent worlds. Trusted Rust code still enforces world/account scope.

Actual local PostgreSQL17 checks pass: 17 durable command scenarios, 12 forbidden
privileges and six transport negatives (plaintext server, untrusted CA, hostname,
password, role mismatch and DB owner). Each DB, schema and role was cleaned up.
The test PKI is freshly generated under ignored artifacts; no owner CA or private
key enters source/evidence. Initial trigger-privilege and Compose lookup failures
are retained in TLS-ROLE-CHECKS.json. Locked Rust workspace tests, compile-fail
doctest, Clippy and focused JS lint pass at their recorded local scope.

The earlier 0848ff8 Rust hosted CI passes and governance passes119/119, but does
not contain this continuation. Exact-source CI and independent source review
remain required. Production credentials, PKI operations, a composed command
endpoint, actual game turn logic and Windows/Unity qualification remain separate.
VL-013 is IN_PROGRESS and VL-017 remains dependency-gated.
