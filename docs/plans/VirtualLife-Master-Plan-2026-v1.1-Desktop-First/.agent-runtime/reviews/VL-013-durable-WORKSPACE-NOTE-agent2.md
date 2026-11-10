# VL-013 independent workspace observations

This is a **workspace note, not an APPROVED review or canonical handoff**. The new durable admission source is uncommitted. Do not ingest this note to verify VL-013 or unlock VL-017. Agent 2 authored only this note, a separate VL-016 CI review and ignored diagnostic artifacts; source, live-state, reservations, original reviews and owner IDE/CA files remain untouched.

Observed committed HEAD: `a407653eb12face850e85d23ab2e9c5181e5bb0b`. The actual tested dirty/untracked input hashes are listed below. New behavior is not attributed to that commit.

## Actual independent checks

| Command | Actual outcome |
| --- | --- |
| `env -u TEST_DATABASE_URL node scripts/with-test-db.mjs pnpm exec vitest run --project integration tests/integration/runtime-admission.test.ts` | Initial sandbox Docker access denied, exit 1; approved outside-sandbox rerun exit 0, 6/6 tests. Includes capacity1 race among eight accounts, unknown/closed world refusal, durable generations, owner replacement/expiry, canonical identity lock versus logout, session replacement and deletion cascade. |
| `env RUSTUP_HOME=<repo>/artifacts/toolchains/rustup CARGO_HOME=<repo>/artifacts/toolchains/cargo CARGO_TARGET_DIR=<repo>/artifacts/rust/target artifacts/toolchains/cargo/bin/cargo build --offline --locked --package vl-security --bin durable-check` | Exit 0, actual current Rust binary built with existing cached dependencies; no install or lockfile mutation. |
| `env -u TEST_DATABASE_URL node scripts/with-test-db.mjs node --import tsx scripts/runtime-admission-durable-check.mjs` | Exit 0, all 11 actual Node issuer → Rust verifier → PG transaction scenarios PASS. Authorized commit persists one state transition/receipt; forged/expired/wrong scope/generation/revoked/replayed/foreign-domain/rollback cases preserve rejection behavior. |
| `env -u TEST_DATABASE_URL node scripts/with-test-db.mjs node --import tsx artifacts/desktop-first/vl013/agent2-durable-post-admission.mjs` | Exit 0, six additional independent post-admission revocations PASS: account suspension, expired admission, disabled world, consumed nonce removal, owner boot replacement and new account allocation generation. Every rejected command leaves state_version=0 and receipts=0. |

`node docs/execution/desktop-first/verify-adoption.mjs` was also rerun in this session: exit1, `Unregistered additive migration` for0049. This remains an integration blocker, not a passing preservation gate.

All three wrapper-owned disposable PostgreSQL projects were removed on exit (42d180e7, 4f741ebf, b9b75167); each command exited0 after cleanup. The failed initial sandbox invocation did not create a container. These are synthetic storage effects in real local PG, not final game rules, public endpoints or deployment transport.

## Evidence and remaining acceptance

- Input/output hash inventory: `artifacts/desktop-first/vl013/agent2-durable-followup-facts.json`, SHA256 `2b816684648ad0018c6a7f275edf6f10ebb77bdadbe2a2bd36b1d7c5030ba96d`.
- Base harness output: `artifacts/desktop-first/vl013/durable-33669903/facts.json`, SHA256 `1a9c8ad31759de4ec6307ec9816181f5b227b91cda02655f7a36589780a8b13c`.
- Independent additional probes: `artifacts/desktop-first/vl013/durable-49940dda/facts.json`, SHA256 `de6a0c9e058853b9d01c28205ee084d401fd5fc206e1ffa9d4c156fb4acab9a7`.
- Probe source: `artifacts/desktop-first/vl013/agent2-durable-post-admission.mjs`, SHA256 `56ffdfb49fdad6863c4de2a4548263ae6b846e004a8dcbfc844b209897b50236`.

Bounded tests demonstrate no unauthorized game writes for the listed negatives; they do not complete the full security gate. No new demonstrated defect was found in the reviewed allocator/transaction boundary at these inputs. Remaining requirements:

1. Coordinator reconciles migration0049 with preservation and architecture ownership under the existing reservation. The current preservation verifier only recognizes additive0048; the fresh actual workspace invocation again failed on0049. Preserve all original47SQL and the immutable plan files; do not silently whitelist a new migration without its contract/rollback evidence.
2. Publish the durable source and reproducible evidence at an exact commit, then a canonical source-bound handoff for independent review. This workspace note cannot supply committed-source acceptance.
3. The production authenticated/restricted DB-role/TLS path is assumed by the injected Rust client; the disposable checker explicitly uses NoTls. No production role isolation or authenticated service transport was exercised. Keep activation default off until the deployed connection and composition contract have their own evidence.
4. Complete migration expansion/rollback compatibility for0049 and current exact-source quality checks. Neither the old48-compatible policy nor the VL-016 approval qualifies49 automatically.
5. Storage callback effects remain trusted adapter code. The probe proves a native match state/receipt transaction and rollback, not complete seat/match membership/domain rules, reward consumption or cross-world travel.

Next exact action: coordinator resolves the0049 verifier/ownership/compatibility integration, commits the source and publishes the actual security handoff. Agent2 then reviews that committed handoff and runs any remaining required security negatives. VL-013 stays IN_PROGRESS; no state transition was performed here.

## Tested input hashes

| Path | SHA256 |
| --- | --- |
| `Cargo.lock` | `9d203fde3646e9a3e2be154b5269d8a7448cbdb547028884dd9346e2f0aeaed5` |
| `crates/vl-security/Cargo.toml` | `6ed3b5168bbf311477f2895d003051d2868f4bcb93553a209c05d6a067108821` |
| `crates/vl-security/src/lib.rs` | `77d3338f4e48a191334769255ded5ecaa386bae417a1ecbf56957e99a1c946e8` |
| `crates/vl-security/src/durable.rs` | `f73f6eed14966c1311ef35653812ed046c5264235023b569583dd2e944abb1b0` |
| `crates/vl-security/src/bin/durable-check.rs` | `b4908c2406e2f5df4694e835fb6f7dfbc3518ee2bc7da9dc10684301a4c1323d` |
| `apps/platform-api/src/db/migrations/0049_native_runtime_admission.sql` | `e8f43942d13e190918f17df9eb25617a15b733a702483ce94c504a688e43df67` |
| `apps/platform-api/src/identity/runtime-admission.ts` | `be39fefa00977765bdc1ae1faf5ef101a02492d3a87f2a70ad0b2d1f48d4868e` |
| `apps/platform-api/src/identity/runtime-tickets.ts` | `51472cb340690bb0a0cd44912f0bd9a09be86cde309c0a49c44057fa0bea87a6` |
| `scripts/runtime-admission-durable-check.mjs` | `bc7cd2a655be819bd6a704e5a24b029ac0d12cff52d634c386df2713e88106e8` |
| `tests/integration/runtime-admission.test.ts` | `d2aa6a2c83f4d91ac9af5e2ea4cb6381b08af9e7cbf4e643fb87bdeac43cf6bc` |
