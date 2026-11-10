# VL-019 zone actor and AOI prototype

`crates/vl-world` is a default-off trusted-host library. The production executable
does not import or instantiate it. No new network route, database writer, migration,
platform role or legacy RoomAuthority composition is introduced.

Each zone owns its state in one Tokio task. Its membership/query mailbox uses
bounded Tokio mpsc (1..256 slots), with explicit `Backpressure` before acceptance.
Each actor has one Tokio watch buffer for its latest movement intent; sequence
regression is rejected and bursts coalesce before the next tick. Actor capacity is
1..256 and timing samples retain at most4096 entries. Command replies use oneshot;
the embedding host must bound its own outstanding requests and connection count.
No game-turn/seat/reward commands use this ephemeral prototype mailbox.

The host chooses actor IDs and spawn points; a private zone/generation-bound handle
owns movement. Leaving and rejoining produces a fresh handle; old handles cannot
move or remove the replacement. Dropping the input handle removes the actor at the
next tick. No public DTO or client-authored position is accepted by this library.
Admission and revocation must be composed at a future network boundary; a Rust
handle is not evidence that a remote user has authenticated.

Movement runs at20Hz, using integer millimeters, a100mm maximum per tick and a
conservative L1 diagonal cap. Only the latest input acts, once; absent fresh input,
the actor stops. This is a bounded rectangular prototype, not a navmesh, obstacle
collision, acceleration model or completed movement protocol. AOI uses5m grid
cells and an exact5m radius, including negative coordinates and cell crossings.
Its snapshots are internal geometric candidate sets, not safety/privacy-filtered
public projections. No private game state is stored here. VL-020 and later world
composition retain recipient policy and authenticated fanout responsibilities.

## Verification

With the repository's exact task-local Rust1.99.1 toolchain:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo run --locked --package vl-world --example zone-probe
node --test tests/governance/*.test.mjs
pnpm ci:check
```

Five new tests cover overflow/backpressure, input burst/coalescing and stale
sequence, stale actor/foreign zone identity, disconnect cleanup, bounded metrics,
grid vs brute-force geometry over64actors x60ticks, and real mailbox replies/
shutdown with the task joined. Existing Rust tests/doctest remain green. The
read-only Ubuntu workflow runs the live20actor probe and retains its raw sample
array in the job log. `vl-world`'s sole normal dependency is Tokio; it has no SQL,
filesystem or external effect adapter and cannot write to PG on any frame.

The local probe prequeues20joins into32slots, runs2000directional inputs across
100scripted steps, then joins shutdown. It measures tick computation separately
from scheduling: `compute_overruns` counts computation longer than50ms;
`late_wakes` counts wakes at least50ms after their scheduled deadline. It reports
raw microsecond samples and nearest-rank p95 without discarding slow values.
These are a short local prototype observation, not capacity/GPU or long soak
qualification. `LOCAL-CHECKS.json` binds the recorded run and environment.

Acceptance still requires a separate source-locked audit labeled non-independent
under the explicit owner policy, plus successful CI at the exact committed SHA.
Do not infer aggregate Quality,Windows,Unity,GPU or production readiness.
