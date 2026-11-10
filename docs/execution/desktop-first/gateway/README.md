# VL-022 - Bounded Direct WSS Transport

The Rust `vl-gateway` library mounts `/rt/v1` only when explicitly enabled by a
trusted host. The shipped health-only runtime and production Nest composition
do not mount it. A production TLS terminator, origin, issuer keys, restricted DB
role, current native allocation and runtime boot must be supplied separately.

The optional Nest/Fastify ticket adapter uses the existing signed HttpOnly
session, CSRF validation, a fixed host-selected native scope and no-store replies.
It cannot allocate membership or accept client-selected worlds. Tickets travel
in the first binary Protobuf Hello, never in URL parameters or bearer headers.
The Rust adapter uses VL-013 signature/scope/expiry validation, a durable one-use
nonce and fresh account/session/world/sanction authorization for every response,
including cached retries. PostgreSQL verifies explicit CA, hostname, TLS>=1.2,
SCRAM channel binding and restricted role ownership/privileges.

The connection has a 4-second Hello deadline, 30-second lifetime, 750ms I/O and
policy budgets, 64KiB frames, 32 cached replies and bounded handshake/command
rates and capacity. IDs and sequences bind exact encoded requests. A duplicate
returns identical bytes after authorization; collision/gap/old evicted requests
cannot become new effects. Only the caller's own position/input/tick is projected
from the zone actor; geometric AOI candidates, identities and metrics stay private.
Resync ignores client state and returns current authorized server state. A fresh
ticket reconnects; cross-account rotation closes the connection. Movement/game
effects return unavailable until their own command adapters are verified. There
is no committed gameplay ACK, reward, seat, teleport or legacy writer cutover.

`scripts/native-wss-interop.mjs` starts an isolated Nest HTTPS host, a loopback Rust
example, real Chromium WSS and wrapper-owned TLS PostgreSQL. Its fresh disposable
role can read admission columns and insert nonces only, with no game privileges.
The fixture uses ephemeral certificates and browser ignoreHTTPSErrors; that is
not browser PKI or production certificate qualification. Rust PostgreSQL still
verifies the exact test CA/hostname. All processes, tunnels, roles and schemas are
closed on completion. Private fixture credentials/keys/raw logs stay in artifacts,
outside Git. The test HTML is a transport fixture, not a second game client.

Local reproduction:

```sh
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo run --locked --package vl-protocol --bin native-codegen -- --check
pnpm build:packages
cargo build --locked --package vl-gateway --example interop
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs
```

The read-only Ubuntu Rust workflow runs the browser/PG harness. Local results are
in `LOCAL-CHECKS.json`. Exact-source CI and a separate same-agent audit remain
required before acceptance. Generated C# is not compiled Unity/Windows evidence.
Legacy ledgers, immutable baseline, owner IDE files and owner CA remain unchanged.
