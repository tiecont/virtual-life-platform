# VL-004 — Rust foundation, Linux development and OCI smoke

This is a minimal health-only executable, not a gameplay server. Rust 1.99.1,
Axum 0.8.9 and Tokio 1.54.1 are exact pins; `Cargo.lock` binds transitive crate
checksums. The official stable manifest observed 2026-11-10 is dated 2026-10-15.
The isolated local toolchain is `/tmp/virtual-life-{cargo,rustup}`; no shell profile
or primary development OS was changed. Restore it from the pinned toolchain file
when that temporary directory is unavailable.

Run `cargo fmt --all -- --check`, `cargo check --workspace --all-targets --locked`,
`cargo clippy --workspace --all-targets --locked -- -D warnings` and
`cargo test --workspace --locked`. Local commands in this session prefix
`RUSTUP_HOME=/tmp/virtual-life-rustup CARGO_HOME=/tmp/virtual-life-cargo` and use
`/tmp/virtual-life-cargo/bin/cargo`. Build outputs stay in ignored `artifacts/rust`.

The default listener is `127.0.0.1:4400`. `VL_RUNTIME_BIND` accepts an explicit
socket address. Gameplay remains unavailable: unset/`0` is allowed and every other
`VL_GAMEPLAY_ENABLED` value is rejected. `/health/live` returns 200;
`/health/ready` returns 503 `GAMEPLAY_NOT_IMPLEMENTED`; `/rt/v1` is absent. No DB,
ticket, movement, reward, migration or legacy RoomAuthority adapter is installed.
The binary's bounded `--healthcheck` probes liveness, not gameplay readiness.

The two-stage Dockerfile pins official Rust and Debian index digests. Its runtime
uses UID/GID 65532, no package installation and no credentials. The smoke script
starts one named disposable read-only, capability-dropped, memory/pid-bounded
container on a loopback-only ephemeral port; checks health/readiness/route/method,
denied gameplay activation and graceful SIGTERM; then removes that owned container.
It does not touch retained project stacks or databases.

`.github/workflows/rust-runtime.yml` uses Ubuntu 24.04, read-only permissions,
pinned checkout, checksum-pinned rustup bootstrap and exact toolchain. It runs all
four Rust gates plus OCI smoke. A local pass is not a hosted CI run; the handoff
must record the actual hosted result before claiming the task's CI acceptance.
No registry publishing, Windows GPU benchmark or Unity build is part of this lane.

The preservation checker now inventories newly tracked native source separately
instead of rejecting all Rust files forever. It still checks every original
legacy/input/SQL/source hash; its new-source inventory grants no native acceptance.
Runner allocation follows `DESKTOP-EXECUTION-DECISION.md`: CachyOS development,
supported Ubuntu Unity Linux CI, Windows functional builds and physical-GPU
Windows self-hosted graphics qualification.

Primary references used for API/version checks:
[Axum](https://docs.rs/axum/0.8.9/axum/),
[Tokio](https://docs.rs/tokio/1.54.1/tokio/),
[official Rust stable manifest](https://static.rust-lang.org/dist/channel-rust-stable.toml).
