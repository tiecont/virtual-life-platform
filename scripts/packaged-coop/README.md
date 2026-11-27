# Packaged cooperative acceptance

Run from the repository root on a Linux workstation with the pinned, licensed Unity 6000.3.14f1 Editor, Docker, Gamescope with XWayland, libX11, libXtst, ImageMagick, Python Pillow and English Tesseract data. The rendered path uses a private XWayland display. It does not send input to the user's desktop.

```sh
pnpm install --frozen-lockfile
pnpm build:packages
cargo build --locked -p aetheria-game-runtime --bin aetheria-game-runtime
UNITY_EDITOR=/path/to/Unity node scripts/unity-validate.mjs linux
bash scripts/packaged-coop/run.sh /path/from/build/result.json \
  artifacts/rust/target/debug/aetheria-game-runtime /path/to/tessdata
```

Run both builds from the same clean revision. The runner requires a passing Linux build receipt for the checked-out commit and records package and runtime SHA-256 hashes. It starts Nest, Rust and disposable PostgreSQL on loopback ports. The policy fixture is generated from the committed cooperative bundle and published only in that database.

One packaged player uses ordinary guest login, owned Pet selection, movement, room creation and battle actions. Three independently authenticated socket clients occupy the other seats. They use the committed board and authorized projections only. This fixture supplies the three partner Pets, uses reduced Fire difficulty and an earlier multiplier stage, and exercises the host's real reward settlement and starter Emberglass upgrade. The suite checks Fire victory, restart recovery from the same board, one fresh host admission, four payouts, and upgraded loadout binding in the Water lobby and native HUD.

The process produces source and package metadata, screenshot evidence, event projections and a checked result in ignored `artifacts/packaged-coop-runs/`. It does not exercise four packaged windows, human controls, physical Windows, or production balance. UI automation assumes the 1024×768 development player layout.

## Four-person offline playtest

Use the Linux development player and local cooperative server setup in
[the Unity player guide](../../apps/unity-client/README.md#local-cooperative-player).
The facilitator records the player package manifest hash, runtime hash, published
config digest, room threshold and starting resources. Use the same build and
configuration for all four seats. The automated runner owns three seats and
exits after its scripted journey. Launch each human session separately against
one shared disposable Nest/Rust/PostgreSQL environment. Keep each client's
game profile in its own Linux user session. If using separate stations, check
that each can reach the configured loopback endpoints through the test lab's
existing routing and trust the configured public test CA before inviting players.

| Stage | Player task | Facilitator records |
| --- | --- | --- |
| Arrival | Four people start signed out and use separate guest accounts. Open the collection and select an owned Pet. | Time to first selection, confusion about duplicate species and ownership, missing or clipped labels. |
| Formation | Use WASD to reach Fire and E to enter. An eligible host creates the room. Three people join by room UUID, choose their Pets and ready up. | Starting AP, eligible host, time until all four can see the board, any assistance required. |
| Combat | In seat order, swap adjacent tiles for a match. Try a guard, a skill, a signature and an ultimate as resources permit. Scroll to inspect the controls. | First independently found legal move, mana/rage and cooldown comprehension, visibility of the active seat, multipliers and Boss warning, time to phase change and outcome. |
| Recovery | After one committed move, record turn, active seat, Boss HP and multiplier locations. Disconnect one client. Have that player reconnect. On a separate run restart the test match process. | Time until the same board returns, whether an action is repeated or lost, agreement of the four views. |
| Progression | Record the four reward receipts. Return to Plaza, check balances, equip/upgrade a Core if affordable, and try entry to Water. | First-clear and replay rewards, changes in materials and Pet level, Water prerequisites and observable equipped stats. Record a loss or locked room as the outcome when it occurs. |

After the run, ask each person which move they intended, how they recognized the
Boss warning, what made the fight easy or difficult, and which visual or audio
cue they missed. Record role, map, build hash, digest, turn and observable
effect beside each issue. Compare difficulty across parties only when their
level, gear, seed and configuration are recorded. Label any granted AP,
materials or reduced difficulty explicitly. Save anonymized observations under
ignored artifacts and report the actual number of people who finished.
