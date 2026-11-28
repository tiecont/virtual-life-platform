# Unity developer blockout

Open this project with Unity 6000.3.14f1 and URP 17.3.0. The pinned
manifest uses Unity Test Framework 1.6.0. The Editor prepares URP settings,
a resource material and the scene build list on import. The package lock,
project settings and generated developer materials are resolved by the pinned
Editor and maintained in source. Temporary art stays under Aetheria.

Open Assets/Aetheria/Scenes/AuroraBlockout.unity and enter Play mode.
WASD moves the capsule. Approach the blue terminal and press E for the local
three-turn input rehearsal. The scene uses temporary developer primitives.
The client displays its offline mode. The explicitly configured development connection panel routes terminal input
to the native synthetic match. Windows player qualification remains separate.

## Playable Pet Arena MVP

Wave A targets the **8x8** tactical board. The developer training scene now builds
an 8x8 board and keeps Icarus on the approved base silhouette at every level.
Every authored skill is usable from Pet Lv1; Pet level grows stats, raises the
Skill-Level upgrade cap and gates Artifacts (D1/C10/B20/A40/S60), not skill access.
The action-based Wave 1 campaign remains a frozen local compatibility slice. See
[the Wave A specification](../../specs/pet-arena/mvp-wave-a.md).

From the repository root, start local PostgreSQL, apply the migrations and run
the platform API on loopback:

```sh
pnpm setup:local
pnpm db:up
pnpm db:migrate
pnpm build:packages
LOCAL_PET_ARENA_WAVE1=1 node --env-file=.env --import tsx apps/platform-api/src/main.ts
```

From a shell with `AETHERIA_WAVE1_API=http://127.0.0.1:4300`, open the Unity
project and play `Assets/Aetheria/Scenes/PetArenaPve.unity`. The Linux or Windows
development player also opens that scene automatically when launched with
this variable. Set `AETHERIA_WAVE1_WEB_ORIGIN` if the API's `WEB_ORIGIN`
differs from `http://127.0.0.1:3300`. The session screen offers guest access
and sign-in for an existing local account. Use Tab and Enter to navigate,
and select an active Pet from the saved party before entering a map.

The campaign uses the PostgreSQL-backed Wave 1 API for combat previews and
settlement, wallet, collection, evolution and gacha. The stage uses developer
primitives, reduced-motion elemental marks and procedural audio. See the
[Wave 1 rules and API](../../specs/pet-arena/mvp-phase2.md).

Opening PetArenaPve without the client environment variable runs the original
offline training scene. Its keyboard controls are `1` Intro, `N` Normal,
`R` Rage, `F` FIRE_ZONE, `Tab` next opponent, `L` next evolution stage and
`X` reset. Rebuild its scene and profile/settings assets through
`Aetheria > Pet Arena > Build playable MVP scene`.

To verify the entire local loop and restart recovery on Linux,
set `UNITY_EDITOR` to the licensed Unity 6000.3.14f1 executable and run from
the repository root:

```sh
pnpm build:packages
node scripts/unity-native-prepare.mjs
node scripts/with-test-db.mjs node --import tsx scripts/wave1-unity-smoke.mjs
```

Future Pets and Arena Maps are loaded through Addressables groups delivered
from the private R2 asset pipeline. `R2RemoteContentSettings.asset` is disabled
by default so the local scene remains playable without network access. Its
manifest is strict, HTTPS-only, bounded to 96 entries and keyed by stable Pet
and map IDs. A published Addressables remote catalog and manifest must be
uploaded together under an immutable content version; changing remote entries
does not require a new client binary. No production R2 endpoint, content or
credentials are committed here.

## Central Plaza and developer arenas

Central Plaza connects to six developer arena compositions built from the shared
modular world kit:

| Arena | Element |
| --- | --- |
| Cinder Terraces | Fire |
| Tideglass Lagoon | Water |
| Stormcoil Fields | Electric |
| Lantern Necropolis | Ghost |
| Ochre Labyrinth | Ground |
| Dawn Prism Sanctum | Light |

Open a scene and enter Play mode. WASD moves the local `CharacterController`
inside authored bounds. **E** uses a portal or return gate, and **M** toggles
ambient movement. Reduced motion is on by default. Each arena has an 8×8
developer board, walkable collision, an entry spawn, a return anchor in Central
Plaza and distinct lighting and environment dressing. The developer primitives
are interim assets. In the cooperative player, the server still decides which
encounters are available to the signed-in account.

Rebuild the scenes and their URP materials after changing layout data:

```sh
UNITY_EDITOR=/absolute/path/to/6000.3.14f1/Editor/Unity
"$UNITY_EDITOR" -batchmode -nographics -projectPath apps/unity-client \
  -executeMethod Aetheria.Editor.WorldSceneBuilder.BuildAll -quit
```

Validate and capture rendered evidence from a Linux development player:

```sh
node scripts/unity-validate.mjs tests
node scripts/unity-validate.mjs world
```

`world` builds the Linux development player, drives portal and return interactions
across all six arenas, renders 1280×720 screenshots and writes
`facts.json` under the ignored `artifacts/unity/` run directory. It requires a
real Linux graphics device and does not qualify Windows.

## Native protocol adapter

Run `node scripts/unity-native-prepare.mjs` before opening the project. This
stages the existing generated `contracts/generated/csharp/Public.cs` and
checksum-pinned Google.Protobuf 3.36.2 / Unsafe 4.5.2 libraries into ignored
Unity folders. .NET Standard 2.1 supplies Memory/Span APIs. `unzip` and access
to NuGet are required on the first preparation; subsequent runs use the
verified cache under artifacts/unity-packages. Do not edit staged bindings.

`Aetheria.Native` has no UnityEngine dependency. `PlatformSession` logs in
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
pnpm --filter @aetheria/platform-api build
cargo build --locked --package aetheria-game-runtime
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

### Icarus Import Audit

Audit an actual candidate FBX without changing its source or the main Unity
project:

```sh
UNITY_EDITOR=/absolute/path/to/6000.3.14f1/Editor/Unity node scripts/art/icarus-unity-audit.mjs --model /absolute/path/to/icarus.fbx
```

The runner creates an isolated pinned Unity/URP project under ignored
`artifacts/character-production/icarus-unity-audit/`, copies the FBX and its
existing `.meta` if present, and imports as Generic with readable meshes and
untruncated weights. Embedded FBX textures are supported; unresolved external
texture references remain missing and fail. It writes the actual Editor log,
source revision, FBX/importer hashes and import facts; exit 1 reports failed requirements and
exit 2 means no Editor was configured.

The import contract measures one actual LODGroup containing three levels,
including geometry outside the group that persists at every level. It checks
triangle, joint, material and texture size budgets, all skin weights and joints,
and all sixteen canonical actions from the maintained Limited profile. Each
clip is sampled at seventeen times after restoring the rest pose; all LODs must
deform, curve paths must resolve, and identical sampled transform sequences
cannot qualify as different actions. FBX take namespaces ending in `|action`
are recorded with their original clip names. The audit creates no animations,
prefab, materials or gameplay bindings.

`IMPORT_CONTRACT_PASS` covers only these measured import requirements. It cannot
establish likeness, topology quality, expressive timing, material packing/BC7,
reduced motion, rig controls, collision clearance, rendered motion, rights or
player performance. Art and runtime acceptance remain separate; the report
always leaves production and gameplay disabled.

`linux-player-tests` builds and launches a rendered Linux test player. Both
blockout tests must pass without skips. Routes physically move the capsule
from spawn to cafe/Arena approaches, check a solid cafe collision and district
bounds, and require a real graphics device outside the Editor.

The developer primitives and approach anchors are defined once in
`BlockoutGeometry.cs`. `ProjectBuild.Prepare` exports their stable shape GUIDs,
resolved Unity source/material GUIDs, source hash and integer millimeter AABBs
and interaction radius/target GUID to `config/aurora-blockout-collision.json`.
Rust derives the terminal center from that collider and checks canonical proximity
before new synthetic effects when Aurora movement is enabled. Commit this maintained configuration
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

## Local cooperative player

Build the existing Linux player with the local Unity validation runner. Launch
it with `AETHERIA_COOP_API` set to the loopback Nest API and
`AETHERIA_ARENA8_NATIVE_CA` set to the local TLS bridge's public CA file.
Enable the existing local Pet collection and cooperative routes for that API
and publish a validated cooperative bundle with the Fire and Water map
bindings. Keep the publication and all accounts in a disposable environment.

The player opens Central Plaza and offers guest login. Walk to the Fire or
Water portal and interact to open that arena's lobby. Select an owned Pet,
create a room or join by room UUID, and ready each account. The host starts
the room once all four seats are ready. Other seats can refresh the room to
enter the match. A returning guest can resume the saved account and use the
existing room UUID to obtain a fresh admission. Published room eligibility
still applies to the host.

`node scripts/with-test-db.mjs node --import tsx scripts/native-coop-process.mjs`
exercises the native process with its own test-only publication and accounts.
Packaged and four-human acceptance are recorded separately in the backlog.

## Play Pet Arena on Linux

From the repository root, with Docker available, Node/pnpm/Rust pinned as above
and the licensed Editor named by `UNITY_EDITOR`:

```sh
pnpm build:packages
pnpm --filter @aetheria/platform-api build
cargo build --locked -p aetheria-game-runtime
node scripts/unity-validate.mjs linux
pnpm play:linux
```

The launcher uses the same isolated native fixture as the process tests. Its
first run also needs the pinned Playwright Chromium cache (`pnpm exec playwright
install chromium`) and `openssl`. It starts a fresh disposable database, a
loopback Nest HTTPS/WSS gateway, the default-off Rust Pet Arena runtime with
movement explicitly enabled, and a restricted reward worker. The path printed
at startup contains the temporary account/password. Enter them in the player.
Use WASD to approach the purple Arena gate, then E. Select adjacent tiles forming
a match, use the pet skill when ready, or pass. The board marks the enemy's next
attack. Return to plaza resumes roaming. Reconnect refreshes the authoritative
result, including reward settlement; Retry resolves an ambiguous pending command
without creating another turn. Reduced motion defaults on.

Closing the player stops the local fixture and deletes the scope/login files
and disposable database. A new launch starts a new match. This is a development
prototype with original primitive pet figures, not production content or
Windows qualification. No production endpoints, purchases or signing are used.
The launcher creates an explicit local CA only for this process: the external
`developmentCaFile` option is loopback-only, bounded, unavailable in release
players, and restores Mono trust on scene disposal. Normal chain, expiry and
hostname validation remain enabled; the owner's trust stores are unchanged.

Rendered full-match regressions use actual Linux OS input:

```sh
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --pet-arena --unity-interactive --movement
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --pet-arena-loss --unity-interactive --movement
```

Run them sequentially. Each requires a real graphics device and X11/XWayland.
They cover spawn proximity rejection, walk-in, start with committed-but-lost ACK,
same-ID retry, skill/swap or pass, exact checkpoint after Rust SIGKILL, terminal
win/loss, one restricted worker settlement, reduced motion, return to roaming
and server logout. The Pet tests use the same local-CA path as the normal
development player. The separate adapter fixture retains wrong-CA rejection.

### Play the functional solo campaign

With the Linux development player, Rust runtime and workspace packages built
as above, run `pnpm play:linux:functional`. Docker and `openssl` provide the
disposable loopback backend and its local TLS certificate. The launcher publishes
the repository's functional candidate as authored into the fresh database.

Choose **Enter local arena** to create a guest, then select an owned starter Pet
and start the Fire regular encounter. Start the battle and swap adjacent tiles
to match three or more of the same functional kind. The campaign uses the
published Fire regular and Boss encounters to unlock Tideglass. Close the player
to clean up the temporary profile, certificates, API, runtime and database.
Each launch starts a fresh guest campaign. The player log stays under
`artifacts/functional-linux-play/`.

## Native developer scene controller

The `NativeSceneController` source wires the scene to the existing adapters via
`NativePlaySession` (`SyntheticPlaySession` or `PetArenaPlaySession`). It is enabled only in the Editor or a development build
of `AuroraBlockout`, and only when `AETHERIA_NATIVE_DEV_CONFIG` names an external JSON
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
Set `ruleset` to `pet-arena-pve` and `movement` to `true` for an allocated Pet
match; use the runtime's `--ruleset-content-hash pet-arena-pve` value. The local
launcher supplies that server-owned scope automatically.

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
loses the ACK after PostgreSQL confirms the turn committed, reconnects and retries
the same command ID. It verifies that E cannot submit another turn while that
intent is pending and that retry leaves the durable receipt count unchanged.
It then unloads the scene during a held ticket request, releases the handler after
a fresh controller exists, checks that no late state or credentials return, and
logs in again to recover the committed turn. Finally it interrupts another held ticket
request with Logout and ends the local session. The fixture checks actual session
revocation and rejects an unused ticket before it expires. A second player
repeats the flow after a Rust SIGKILL. XTest events
target only the test process's own window. This is automated OS input evidence;
physical owner keyboard acceptance and Windows qualification remain separate.
Ending a local session destroys its in-memory cookies and adapters, cancels
pending operations and clears its presentation. It does not revoke the server
identity session. The separate Logout button cancels the current gameplay
exchange, closes WSS and sends an Origin/CSRF-protected platform logout with a
fresh idempotency key. It clears local state and credentials in either case;
only a typed `loggedOut: true` response displays confirmed server revocation.
Timeout, cancellation and failed responses display that server logout was not
confirmed. Leaving the scene cancels this bounded operation and cannot restore
an old presentation result. A committed turn survives logout for the next login.

## Isolated Authoritative Movement

The runtime private configuration and the external developer scope each require
an explicit `movement: true` opt-in. Both default to false. The Rust zone uses
the reviewed collision export, a 50ms tick, a 100mm maximum step, a conservative
diagonal cap and a 20mm per-tick acceleration bound. Inputs contain direction,
sequence, server epoch/tick and freshness time; no client actor or position is
accepted. Nest policy locks cover each queued effect, and cancellation invalidates
the queue entry before those locks release. The writer checks the earliest
admission, world lease, identity-session and ticket expiry at its tick.

When enabled, Unity disables its offline movement path and reconciles the capsule
only from own Rust snapshots. It refreshes the scoped connection before ticket
expiry, without retrying mutations automatically. The isolated fixture renews
admission through its private control-plane hook; ordinary clients cannot select
or renew world allocations themselves. This prototype deliberately has no local
prediction and may pause under latency. It is not production navigation.

The same bounded actor is retained across socket reconnects for the lifetime of
this development runtime. Runtime restart creates a new movement incarnation and
returns to the manifest spawn; durable position restoration is not implemented.
The registry is capped at the zone actor limit and does not admit more accounts
once full. Production lease eviction and persistent movement remain separate.

```sh
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay --movement
node scripts/with-test-db.mjs node --import tsx scripts/native-wss-interop.mjs --runtime-gameplay --unity-interactive --movement
```

The WSS regression records actual exchanges with 40/80/150ms application-level
outbound delays and +/-10ms jitter. These are injected delays, not physical
network measurements. The rendered variant must prove OS input, authoritative
capsule reconciliation and a committed synthetic turn before and after restart.
