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

One packaged player uses ordinary guest login, owned Pet selection, movement, room creation and battle actions. Three independently authenticated socket clients occupy the other seats. They use the committed board and authorized projections only. This fixture supplies the three partner Pets, uses reduced Fire difficulty and an earlier multiplier stage, and exercises the host's real reward settlement and starter Emberglass upgrade. The suite checks Fire victory, restart recovery from the same board, one fresh host admission, four payouts, and upgraded loadout binding in the Water lobby and native HUD. On the functional board the host then starts Water and swaps adjacent jewels. An authenticated peer reads both states, and the database journal verifies both commands came from the host.

The process produces source and package metadata, screenshot evidence, event projections and a checked result in ignored `artifacts/packaged-coop-runs/`. It does not exercise four packaged windows, human controls, physical Windows, or production balance. Set `PACKAGED_QA_SIZE` to `1280x720`, `1920x1080`, `2560x1440` or `3840x2160` to request a 16:9 review resolution. The default is `1024x768`. The runner sets the Gamescope nested and output modes to that resolution and checks the native dimensions of each captured player window. The runner publishes the functional candidate to its disposable database. Use `PACKAGED_QA_BOARD=elemental` for a historical regression run. The receipt identifies the observed board contract.

Read `player-performance.json` after the runner exits for the elapsed sampling
interval, combined user and system CPU seconds, mean CPU use relative to one
logical core, peak sampled RSS and the kernel RSS high-water mark. The runner
samples the packaged Unity process through Linux procfs every 250 ms, from its
first observed execution through cleanup or process exit. The measurements
exclude Gamescope, the API, Rust and PostgreSQL. CPU percent can exceed 100 on
multiple cores. Compare completed runs from the same build and fixture using
the same board contract. The metrics describe this scripted journey with its
input, OCR and recovery waits. Frame timing requires separate measurement.

Set `PACKAGED_QA_BOARD=advanced-water` to publish the schema 5 Water candidate after Fire allocates. The packaged host uses its earned 333-point Water gate, opens a timed board with three authored Frost tiles, and swaps the projected pair through the HUD. The authenticated observer checks the six-kind spawn pool, the post-swap Chill reduction and the host's journal receipts. The two Water PNGs retain the board before and after that swap.

To qualify the unmodified schema 5 candidate through Nest, PostgreSQL and authenticated Rust WSS, run the following command after building the packages and runtime. It publishes a replacement before the match starts, then checks that the original Frost reduction, journal and absolute deadline survive a Nest and Rust restart.

```sh
node scripts/with-test-db.mjs node --import tsx scripts/admin-gameplay-publication.mjs --advanced-coop
```

## Shared nine-jewel board

```sh
PACKAGED_QA_SCOPE=board PACKAGED_QA_BOARD=shared-rng PACKAGED_QA_SIZE=1280x720 \
  bash scripts/packaged-coop/run.sh "$BUILD_RECEIPT" "$RUNTIME_BINARY" "$TESSDATA_DIR"
```

This publishes the schema 6 nine-jewel candidate in the disposable database
with only the Fire room hosting threshold set to zero. Start and the first
legal swap are sent through the packaged HUD. Three authenticated protocol
peers join and observe. The verifier matches the two exact actions against
the host's durable journal fingerprints and saves time-stamped clicks, the
published digest, two screenshots with 64 rendered cells and the tile kind
counts actually observed. An individual board can have fewer than nine
distinct kinds. The scope ends after the first swap. Timed restart, full
combat, settlement and four-human play remain separate qualifications.

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
| Combat | In seat order, swap adjacent tiles for a match. Try a guard, a skill, a signature and an ultimate as resources permit. Check which skills are ready while the board stays visible. | First independently found legal move, mana/rage and cooldown comprehension, visibility of the active seat, multipliers and Boss warning, time to phase change and outcome. |
| Recovery | After one committed move, record turn, active seat, Boss HP and multiplier locations. Disconnect one client. Have that player reconnect. On a separate run restart the test match process. | Time until the same board returns, whether an action is repeated or lost, agreement of the four views. |
| Progression | Record the four reward receipts. Return to Plaza, check balances, equip/upgrade a Core if affordable, and try entry to Water. | First-clear and replay rewards, changes in materials and Pet level, Water prerequisites and observable equipped stats. Record a loss or locked room as the outcome when it occurs. |

After the run, ask each person which move they intended, how they recognized the
Boss warning, what made the fight easy or difficult, and which visual or audio
cue they missed. Record role, map, build hash, digest, turn and observable
effect beside each issue. Compare difficulty across parties only when their
level, gear, seed and configuration are recorded. Label any granted AP,
materials or reduced difficulty explicitly. Save anonymized observations under
ignored artifacts and report the actual number of people who finished.

For four packaged clients on one shared RNG board, set
`PACKAGED_QA_SCOPE=four-clients PACKAGED_QA_BOARD=shared-rng PACKAGED_QA_SIZE=1280x720`
and pass the matching Linux build receipt, runtime binary and Tesseract data to
`scripts/packaged-coop/run.sh`. The four processes each use their own private
display and Unity profile. They create guest sessions through the player UI,
enter Cinder Terraces, join and ready in the same room, and consume separate
session-bound Rust tickets. The host commits Start from the HUD after all four
are admitted. Each client contributes its own rendered 8×8 board capture.
The acceptance JSON binds the four windows and observed seats to one allocation
and the digest published through the existing operator fixture.
