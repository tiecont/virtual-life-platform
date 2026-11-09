# Unity Windows native client architecture — assemblies, scenes, reliability

## Pinning & packages
Pin Unity 6.3 LTS editor patch + packages (`Universal RP`, Input System, Addressables, Animation Rigging, TextMeshPro/UI Toolkit or UGUI as chosen, profiling). Agent must record exact editor/build profile/checksum in `packages-lock.json` and CI; never float versions on release branch.

## Assembly boundaries (Unity `asmdef` folders suggested)
```
GameClient/
  Assets/VirtualLife/
    Bootstrap/        # boot, config, secure ticket handoff, patch compatibility
    Contracts/        # generated C# proto, schema IDs, version negotiation
    Transport/        # authenticated WSS client, reconnect, ack/dedupe, clock sync
    World/            # visual entity/scene ownership, AOI presentation only
    Movement/         # input prediction, camera, client smoothing
    Characters/       # rigs, morph targets, emotes, cosmetics, IK
    Rendering/        # URP assets, toon materials, post FX, quality profiles
    Activities/       # café/table/board/pet battle local interaction UIs
    UI/               # inventory, map M, accessibility/reduced motion
    Content/          # Addressables groups, catalogs and release integrity
    Observability/    # FPS/GPU frame/memory/crash/crash token version logs
  Packages/manifest.json
  ProjectSettings/
```

## World pipeline
- `Boot → login via system browser/OAuth PKCE → scoped session ticket → WSS Rust hello → snapshot → spawned client`. No hard-coded long-lived tokens in scene files/logs.
- Client Input System converts keyboard/mouse/controller/click-to-move into semantic intents, sequenced and rate-limited. Camera and animations are **local**. Rust clamps move speed, collision/path/interaction permissions and returns state delta.
- Unity ECS/DOTS is **not mandatory** for scene objects; use profiling first. Avoid GameObject per invisible NPC or game-state authority in MonoBehaviours. Pool network avatar presentations; LOD & AOI.
- Scene loading: `Boot / Auth / City_Shell / District_Aurora / Interior_Cafe / PetArena / Activity_UI`. Keep persistent transport/identity scene. Addressables loads the scene-specific art ahead of Rust reservation. Never commit teleport merely because assets finished loading.
- Use safe main-thread dispatch and thread boundaries when receiving events; never block Unity main thread on network/DB.

## Failure handling
1. Lost WSS: stop sending authoritative intents, display reconnect UX, keep last safe visual pose; request canonical snapshot after new ticket.
2. Unknown move command receipt: reconcile from seq/tick. Unknown **reward** receipt: same commandId query, never re-roll or retry with a fresh ID.
3. Asset version mismatch: show update required; do not deserialize unknown schema into live session.
4. GPU device lost/crash/driver fail: capture anonymized crash+GPU tier, choose lowest profile on safe restart, never expose private account/card info in logs.

## Tests
C# edit mode/player unit, runtime playmode network simulation, native Windows build smoke, scripted camera path capture with profiler and screenshots, schema golden fixtures vs Rust, 1h soak; offline mock tests are **not** proof of production.
