# VL-013 runtime ticket trust slice

Historical first-slice scope below. The current default-off durable admission
continuation is [DURABLE-ADMISSION.md](DURABLE-ADMISSION.md); it adds registered
migration 0049 and a real SQL authorization boundary without completing VL-013.

This is a default-off internal implementation slice, not complete VL-013
acceptance or a live Windows login service. `RuntimeTicketIssuer` is not composed
by `app.ts`, and `vl-security` is not linked into the health-only game executable.
No endpoint, production key, migration, gameplay persistence or second legacy
writer is activated.

## Trust Boundaries

The identity-owned issuer authenticates an existing credential, starts the
existing PG transaction and takes the canonical account lock. It authenticates
again after the lock wait, then asks an explicit admission port for policy under
that same lock. There is no permissive default policy port. Caller input supplies
only destination boot/world/content/protocol scope; identity comes from the
session owner. This adapter does not extend the Android native API to Windows.

Tickets use Ed25519 JWS, an explicit `vl-runtime-ticket+jwt` type, trusted `kid`,
issuer `vl-platform-v1`, audience `vl-native-runtime-v1`, new `native:` world ID,
boot UUID, content SHA256, protocol v1 and exact connect/command scopes. Nonces are
128 random bits. TTL is at most 30 seconds and also bounded by session expiry and
the policy port's validity. Generation is canonical decimal text, avoiding JS
uint64 precision ambiguity. Private signing keys are injected only on Nest; only
public keys reach Rust. No keys or tokens are logged or sent via a URL.

Rust uses pinned `jsonwebtoken` 11.1.0 with RustCrypto and only accepts EdDSA.
It rejects oversized input before decoding, unknown key IDs, caller key URLs,
embedded JWKs, critical extensions, wrong type/version/audience/issuer, malformed
IDs/nonces/generations, extra claims, future/expired grants and wrong boot/world/
content/protocol/scope. Trusted configuration validates raw public-key length
before calling the crypto library. Configuration also parses the actual curve
point and rejects weak/small-order keys; strict Ed25519 signature verification
runs before JWT claim decoding. Clock movement backwards fails closed.

`TrustDomain` is one synchronous runtime owner's bounded admission model. It
consumes each nonce once until expiry; a new unpredictable boot ID must be
provisioned on every restart. It requires a trusted account/session/world policy
snapshot no more than five seconds old, rejects generation rollback and changing
allow/deny within the same generation, and checks again immediately before the
synchronous in-memory effect. An admitted session is private and cannot be
constructed from public claims. Sessions carry an unforgeable in-process identity
for the exact issuing TrustDomain, so equal nonce/expiry on another domain cannot
transfer authority. The callback must return unit; an async callback fails to
compile and has a compile-fail regression. Signing alone does not authorize a command.

## Actual Verification

```sh
node scripts/with-test-db.mjs pnpm exec tsx --test tests/unit/runtime-tickets.test.ts
cargo run --locked --package vl-security --bin ticket-check -- artifacts/desktop-first/vl013/tickets.json
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
pnpm --filter @virtual-city/platform-api typecheck
```

Use the pinned repository Rust toolchain. On this CachyOS session the isolated
homes are `artifacts/toolchains/{rustup,cargo}`; no shell profile or OS change is
required. Ubuntu CI performs the same Node/PG issuance and Rust consumption.

The Node tests use a new disposable PG schema and the real IdentityService,
canonical locks and session records. They test revocation during an actual lock
wait, unavailable/mismatched policy and TTL bounds. An ephemeral Ed25519 keypair
produces a fresh cross-language fixture on every run, including 18 signed negative
tokens. Private keys are neither serialized nor committed. Rust consumes that
fixture and tests forgery, key retirement/rotation, replay, expiration and policy
revocation/rollback; rejected effects do not invoke the in-memory sink. Four Rust
unit tests separately exercise malformed configuration and stale/bounded policy.
An independent review reproduced acceptance of unsigned grants under a configured
weak key and an async-callback escape on the first committed slice. The correction
rejects weak keys, performs strict verification, binds domain identity and narrows
the callback result; five Rust unit tests plus a compile-fail regression cover it.
The disposable DB wrapper drops containers/volumes on completion.

## Remaining Acceptance

The internal admission port still needs a real native-world allocator and a
durable generation owner. Trusted policy delivery requires authenticated internal
service transport and synchronization; accepting a snapshot is a trusted code
interface, not an authenticated RPC implementation. Snapshot availability and
freshness must fail closed. No production signing key or rotation distribution
has been configured.

The five-second snapshot validity is a bounded-staleness model, not immediate
durable revocation at a SQL mutation boundary. The synchronous callback is only
an in-memory effect and must not wrap an async/SQL operation. VL-016/017 must check
policy/session generation under their durable mutation lock, persist the receipt
and state atomically, and prove that rejected commands write nothing in actual
PostgreSQL. Multiple owners additionally require durable nonce/fencing state;
the single-owner model does not claim multi-replica replay protection.

Consequently VL-013 remains IN_PROGRESS: expired/forged/replayed/revoked primitive
negatives are demonstrated, but no unauthorized *game command persistence* gate
is claimed. Independent review and source-bound Ubuntu CI are still required for
the committed slice. Windows/Unity/WSS login remains later gated work.
