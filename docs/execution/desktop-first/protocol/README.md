# VL-012 — Versioned native wire contracts and binding tooling

This establishes the first native v1 codec baseline. It is not the existing
Android/Socket.IO protocol, an authenticated session, a running gRPC service or a
Unity networking proof. The health-only executable remains unchanged and gameplay
cannot be enabled. VL-013 owns ticket/service authentication; VL-017/022 own actual
game RPC/WSS handlers; VL-020 owns recipient privacy; VL-081 owns Unity integration.

## Boundaries

| Surface | Contract/tooling | Ownership and limits |
|---|---|---|
| Client WSS binary input | `proto/native/public.proto` | Public version1,16-byte command IDs, semantic hello/game/move intents; no actor/account/role/damage/reward authority fields |
| Server WSS binary output | Same public schema | Versioned per-command response; authorized projection is an opaque recipient-scoped payload whose actual filtering is later VL-020 work |
| Internal tonic gRPC | `proto/native/internal.proto` | Separate RPC version1 and signed-claim context; raw claims are untrusted data, not a verified runtime capability |
| Rust | Prost0.14.4/tonic0.14.9 generated at build time | Public/client validation plus bounded internal-server factory; no network service is registered here |
| TypeScript | Buf2.17.0 generated public schema and codec package | Binary contract only; no gameplay calculation or wallet mutation. Server contexts are absent from this package |
| C# | Protoc-generated public `Public.cs` | Source-only binding for future Unity client; internal service claims are not exported into it |

The public frame limit is65,536bytes,action data16,384bytes,ticket4096UTF-8bytes.
Internal envelopes are capped at131,072bytes. Rust and TypeScript check frame size
before protobuf decoding, reject unsupported versions, missing bodies/IDs and invalid
bounded intents. Internal Rust validation checks structure only; signature, current
policy, replay, caller identity and freshness remain mandatory VL-013 controls.
The provided tonic server constructor sets both encoding/decoding bounds rather
than relying on tonic's larger defaults. A raw generated type is never authority.

## Generation and source binding

`protoc-bin-vendored=3.3.0` supplies checksum-locked protoc36.2. Rust build scripts
use that explicit executable, not the workstation's different system protoc36.1.
The native-codegen tool generates C# and TypeScript public bindings on Linux x86_64:
CachyOS development or the Ubuntu CI lane. Windows builds consume the committed
generated C#; this tool does not claim Windows/C# execution.

```sh
pnpm install --frozen-lockfile
cargo run --locked --package vl-protocol --bin native-codegen
cargo run --locked --package vl-protocol --bin native-codegen -- --check
pnpm --filter @virtual-city/native-protocol typecheck
pnpm exec vitest run --project unit packages/native-protocol/test/wire.test.ts
```

Use the isolated task Rust environment described in `../rust/README.md` on this
host. Codegen's `--check` regenerates into an owned ignored temporary directory
and rejects byte drift. `contracts/generated/csharp/GENERATION.json` binds both
proto SHA256s,the actual compiler hash/version,TS generator pin and generated file
hashes. It explicitly records that C# runtime compilation has not run. No Unity
project,editor license,Google.Protobuf runtime binary or platform support is implied.
VL-081 must pin a Unity-compatible C# runtime,compile these bindings,enforce frame/
version limits before parsing,and prove actual client/server compatibility.

## Compatibility and actual test scope

The first frozen v1 hello fixtures are explicit synthetic bytes under
`proto/native/fixtures/`;they are not captured production credentials or a
previously deployed Windows protocol. Rust and TypeScript independently parse and
re-encode the same client/server bytes. A server version greater than JavaScript's
safe integer limit stays exact as `u64`/`bigint`,not a rounded JS number.
An additive unknown field is accepted without becoming actor authority. Tests also
cover malformed data,wrong versions,missing bodies,oversized frames/actions and
out-of-range movement. This is the initial backward-read fixture,not a claim of
full compatibility with a nonexistent native v0 or the Android JSON handshake.

Field numbers and reserved ranges are stable within v1;never reuse a removed tag.
Future incompatible changes need a new package/version and explicit compatibility
fixtures/review. Decode success is not authentication,canonical reducer validity,
membership,epoch ownership,signature freshness or a permission to settle rewards.
Do not echo unknown fields or copy internal claims into public projections/logs.

## Repository integration

The new Node codec participates in the existing pnpm build-all map with exact
dependency pins. The Rust workflow now checks generated-byte drift and TS fixtures
on Ubuntu24.04 along with workspace fmt/check/clippy/tests and OCI smoke. The
runtime Docker build copies the added Rust workspace member/proto source so the
locked workspace still resolves;it does not activate a protocol endpoint.

The adoption audit retains the original071 pnpm-lock hash and reports its current
hash/equality separately,allowing this reviewed dependency evolution. It still
enforces every historical SQL,legacy/input baseline and existing renderer/authority
source byte. Old lock evidence is not overwritten or relabeled as the new graph.

Primary references:
[Prost0.14.4](https://docs.rs/prost/0.14.4/prost/),
[tonic0.14.9](https://docs.rs/tonic/0.14.9/tonic/),
[vendored protoc3.3.0](https://docs.rs/protoc-bin-vendored/3.3.0/protoc_bin_vendored/).
