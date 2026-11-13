# Unity developer blockout

Open this project with Unity 6000.3.14f1 and URP 17.3.0. The pinned
manifest uses Unity Test Framework 1.6.0. The Editor prepares URP settings,
a resource material and the scene build list on import. The package lock,
project settings and generated developer materials are resolved by the pinned
Editor and maintained in source. Temporary art stays under VirtualLife.

Open Assets/VirtualLife/Scenes/AuroraBlockout.unity and enter Play mode.
WASD moves the capsule. Approach the blue terminal and press E for the local
three-turn input rehearsal. The scene uses temporary developer primitives.
The client displays its offline mode. The explicitly configured development connection panel routes terminal input
to the native synthetic match. Windows player qualification remains separate.

## Native protocol adapter

Run `node scripts/unity-native-prepare.mjs` before opening the project. This
stages the existing generated `contracts/generated/csharp/Public.cs` and
checksum-pinned Google.Protobuf 3.36.2 / Unsafe 4.5.2 libraries into ignored
Unity folders. .NET Standard 2.1 supplies Memory/Span APIs. `unzip` and access
to NuGet are required on the first preparation; subsequent runs use the
verified cache under artifacts/unity-packages. Do not edit staged bindings.

`VirtualLife.Native` has no UnityEngine dependency. `PlatformSession` logs in
over HTTPS with an in-memory cookie container, then posts the CSRF-protected
empty runtime-ticket request. The server chooses world/boot/session scope.
Pass `session.TicketAsync` to `NativeConnection` together with the configured
WSS origin, content hash and boot ID. Default TLS uses system certificate
validation. The standalone test executable pins its disposable fixture certificate.
There are no stored credentials or automatic native activation.

The connection permits one outstanding exchange, bounds frames and request
time, validates version/scope/correlation, and obtains a fresh ticket on each
reconnect. Reconnect resynchronizes own state. Keep a command's immutable ID
when retrying after an ambiguous result. Mutation retries are explicit; the
server remains authoritative for committed receipts and private projections.
Dispose connections and sessions when leaving a scene. Marshal results back
to the Unity main thread before updating presentation. The scene uses its local rehearsal when no development connection is configured.

Standalone validation uses SDK 8.0.428 (`DOTNET=/absolute/path/to/dotnet`):

```sh
node scripts/native-csharp.mjs
export PATH="$(dirname "$DOTNET"):$PATH"
pnpm build:packages
pnpm --filter @virtual-city/platform-api build
cargo build --locked --package vl-game-runtime
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay --csharp-client
```

These compile the actual adapter against .NET Standard 2.1, exercise mock
HTTPS/WSS failure cases, and prove HTTPS login -> ticket -> real Rust command
receipt -> reconnect -> PostgreSQL-backed process restart. They do not prove
Unity import, Mono player execution, rendering or Windows qualification.

## Linux validation

Set UNITY_EDITOR to the absolute executable path of the pinned, already
licensed Editor, then run from the repository root.

```sh
node scripts/unity-validate.mjs prepare
node scripts/unity-validate.mjs tests
node scripts/unity-validate.mjs linux
node scripts/unity-validate.mjs linux-player-tests
```

The runner writes batch logs and NUnit XML under ignored artifacts/unity/.
A missing Editor returns exit code 2 with MISSING_OPTIONAL_LOCAL_TOOLING.
Batch tests exercise rules, spawning, collision-controller movement and
interaction. Rendering and physical GPU performance require a separate
interactive player run.

`linux-player-tests` builds and launches a rendered Linux test player. Both
blockout tests must pass without skips. Routes physically move the capsule
from spawn to cafe/Arena approaches, check a solid cafe collision and district
bounds, and require a real graphics device outside the Editor.

The developer primitives and approach anchors are defined once in
`BlockoutGeometry.cs`. `ProjectBuild.Prepare` exports their stable shape GUIDs,
resolved Unity source/material GUIDs, source hash and integer millimeter AABBs
to `config/aurora-blockout-collision.json`. Commit this maintained configuration
after geometry edits. The export reserves capsule radius/skin and the allowed
center bounds for VL-028; it does not enable native movement or add an authority.
These approach anchors are temporary walk targets, not a baked production
navigation mesh or seated animation acceptance.

The Linux Mono player also needs the serializer section supplied by
`Editor/MonoConfiguration.cs`; Unity does not ship the usual machine.config
section for `DataContractJsonSerializer`. The corresponding linker entries
preserve configuration types. This changes neither the wire format nor the
shared adapter's authentication behavior.

To run the real rendered Unity test player against disposable Nest HTTPS,
Rust WSS and restricted PostgreSQL processes, first build the backend and
prepare the pinned CI browser assets as for the standalone interop suite, then:

```sh
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay --unity-player
```

The explicit test mode checks login, ticket, resync, a committed command,
same-ID replay, reconnect and another player after a Rust process restart.
It requires LinuxPlayer with a real graphics device, writes NUnit XML,
screenshots, public runtime facts and executable hashes under ignored artifacts,
and never counts an ignored Editor test as a player pass.

Unity Mono's WSS implementation does not use the per-socket certificate
callback used by the .NET test. This fixture therefore provisions its disposable
CA with Mono's explicit `TrustAnchors` API inside the isolated test player.
The test first requires a wrong CA to fail, then uses normal certificate chain,
expiry and hostname verification with the correct CA, and restores the previous
process settings. No certificate validation callback accepts arbitrary servers.
The fixture removes private inputs afterward.
It does not install a CA into the owner's account or change production TLS.

CachyOS is a local compatibility trial. Unity lists Ubuntu 22.04 and 24.04
for supported Linux Editor workstations. A supported Ubuntu workstation
can run the same project and commands. Review license entitlement for the
person and runner before installing or activating an Editor.
[Unity system requirements](https://docs.unity3d.com/6000.3/Documentation/Manual/system-requirements.html)

## Windows qualification

```sh
node scripts/unity-validate.mjs windows-mono
```

This attempts a Windows Mono development build when the Editor has the
Windows Build Support module. The build method checks module support and
fails when it is absent. The pinned Editor release lists that module for
Linux. Test the resulting player on physical Windows hardware.
[Editor and module downloads](https://unity.com/releases/editor/whats-new/6000.3.14f1)

Windows IL2CPP requires the Windows build environment, C++ tools and Windows
SDK. Record signing, install/update, input, graphics and crash acceptance
with build hashes on the related Windows tasks.
[Windows build requirements](https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/windows/requirements-and-compatibility)

## Native developer scene controller

The `NativeSceneController` source wires the scene to the existing adapters via
`SyntheticPlaySession`. It is enabled only in the Editor or a development build
of `AuroraBlockout`, and only when `VL_NATIVE_DEV_CONFIG` names an external JSON
file. No login happens automatically. The file must remain outside `Assets/` and
the packaged player's data directory; it contains scope only:

```json
{
  "httpsOrigin": "https://localhost:4443",
  "wssOrigin": "wss://localhost:4443/rt/v1",
  "contentHash": "5353535353535353535353535353535353535353535353535353535353535353",
  "bootId": "11111111-1111-4111-8111-111111111111",
  "matchId": "22222222-2222-4222-8222-222222222222"
}
```

Replace the sample UUIDs with the server allocator's actual leased scope and
match. Use an already configured isolated Nest login/admission service and Rust
synthetic runtime behind system-trusted HTTPS/WSS. The client cannot allocate its
own world or choose ticket scope. The JSON file has no credential fields. Enter
account/password in the panel at runtime; neither is serialized or logged.

Login performs HTTPS authentication, ticket admission, WSS connection, resync and
an authorized game-state view. Walk within terminal range and press E to request
one server turn. Keyboard movement pauses while typing or awaiting a request.
The panel shows connection/failure categories, committed version, turns and
pending/granted/declined reward status. Unity presentation updates drain through
`Update` on the main thread.

Reconnect obtains a fresh ticket and reads the authoritative state. If a command
was sent but its result is ambiguous, new turns stay blocked; choose **Retry same
command ID**. That intent remains immutable even when a view already shows the
server committed it. Cancellation aborts the exchange; leaving the scene cancels
and disposes both adapters. Credentials, tickets and projections are never logged.

Standalone tests build the scene use cases against .NET Standard 2.1 and prove
lost-ACK retry, cancellation and malformed-state rejection. The same use cases run
against actual Nest/Rust processes in the C# interop suite. The explicit Unity
player fixture exercises the same adapters and use cases in a rendered Linux
player. Physical keyboard, developer-panel interaction and Windows acceptance
still require their own checks; a standalone C# pass cannot replace them.

The rendered panel regression uses the actual X11/XWayland input path on Linux:

```sh
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay --unity-interactive
```

This isolated test player types disposable credentials into the IMGUI panel,
checks a failed login, connects, holds W to approach the terminal, presses E,
asserts the presented committed version, resynchronizes and ends the local
session. A second player repeats the flow after a Rust SIGKILL. XTest events
target only the test process's own window. This is automated OS input evidence;
physical owner keyboard acceptance and Windows qualification remain separate.
Ending a local session destroys its in-memory cookies and adapters, cancels
pending operations and clears its presentation. It does not revoke the server
identity session; platform logout/revocation acceptance remains outstanding.
