# Unity developer blockout

Open this project with Unity 6000.3.14f1 and URP 17.3.0. The pinned
manifest uses Unity Test Framework 1.4.6. The Editor prepares URP settings,
a resource material and the scene build list on import. Review and commit
the Editor-resolved Packages/packages-lock.json and generated settings after
the first licensed Editor import. Package resolution and C# compilation
remain pending until that import succeeds.

Open Assets/VirtualLife/Scenes/AuroraBlockout.unity and enter Play mode.
WASD moves the capsule. Approach the blue terminal and press E for the local
three-turn input rehearsal. The scene uses temporary developer primitives.
The client displays its offline mode. Native commands require the Rust
protocol integration tracked by VL-081.

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
validation; the test executable pins only its disposable fixture certificate.
There are no stored credentials or automatic native activation.

The connection permits one outstanding exchange, bounds frames and request
time, validates version/scope/correlation, and obtains a fresh ticket on each
reconnect. Reconnect resynchronizes own state. Keep a command's immutable ID
when retrying after an ambiguous result. Mutation retries are explicit; the
server remains authoritative for committed receipts and private projections.
Dispose connections and sessions when leaving a scene. Marshal results back
to the Unity main thread before updating presentation. The placeholder scene
continues to use the local input rehearsal until its native presentation is wired.

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
```

The runner writes batch logs and NUnit XML under ignored artifacts/unity/.
A missing Editor returns exit code 2 with MISSING_OPTIONAL_LOCAL_TOOLING.
Batch tests exercise rules, spawning, collision-controller movement and
interaction. Rendering and physical GPU performance require a separate
interactive player run.

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
