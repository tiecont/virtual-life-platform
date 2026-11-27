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
