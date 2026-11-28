#!/usr/bin/env bash
set -euo pipefail
umask 077
# Only Gamescope's child should receive a display. Local tools fail if auth is needed.
unset DISPLAY WAYLAND_DISPLAY SSH_AUTH_SOCK
export DBUS_SESSION_BUS_ADDRESS=unix:path=/dev/null
export GIT_TERMINAL_PROMPT=0 GH_PROMPT_DISABLED=1 GIT_ASKPASS=/bin/false
export SSH_ASKPASS=/bin/false SSH_ASKPASS_REQUIRE=never
export GIT_SSH_COMMAND='ssh -oBatchMode=yes'
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=''
# The disposable database starts its child with a restricted environment.
# Carry review inputs across that boundary as validated arguments.
if [[ ${1:-} == "--inside-disposable-db" ]]; then
  export PACKAGED_QA_SIZE="${7:?missing player size}" PACKAGED_QA_BOARD="${8:?missing board contract}"
  export PACKAGED_QA_SCOPE="${9:?missing acceptance scope}" PACKAGED_QA_PLAYER_REVISION="${10:?missing package source}"
  export PACKAGED_QA_FOUR_ROTATION="${11:?missing rotation flag}"
fi
case "${PACKAGED_QA_FOUR_ROTATION:-0}" in
  0|1) ;;
  *) echo "Invalid four-client rotation flag" >&2; exit 2 ;;
esac
case "${PACKAGED_QA_SCOPE:-full}" in
  full|board|feedback|four-clients) export PACKAGED_QA_SCOPE="${PACKAGED_QA_SCOPE:-full}" ;;
  *) echo "Unsupported packaged acceptance scope" >&2; exit 2 ;;
esac
case "${PACKAGED_QA_SIZE:-1024x768}" in
  1024x768|1280x720|1920x1080|2560x1440|3840x2160) export PACKAGED_QA_SIZE="${PACKAGED_QA_SIZE:-1024x768}" ;;
  *) echo "Unsupported packaged player resolution" >&2; exit 2 ;;
esac
case "${PACKAGED_QA_BOARD:-functional}" in
  functional|elemental|advanced-water) ;;
  shared-rng)
    [[ "$PACKAGED_QA_SCOPE" == board || "$PACKAGED_QA_SCOPE" == feedback || "$PACKAGED_QA_SCOPE" == four-clients ]] || { echo "Shared RNG requires a board scope" >&2; exit 2; }
    ;;
  *) echo "Unsupported packaged board fixture" >&2; exit 2 ;;
esac
if [[ ( "$PACKAGED_QA_SCOPE" == four-clients || "$PACKAGED_QA_SCOPE" == feedback ) && "${PACKAGED_QA_BOARD:-functional}" != shared-rng ]]; then
  echo "This scope requires shared-rng" >&2
  exit 2
fi
export PACKAGED_QA_WIDTH="${PACKAGED_QA_SIZE%x*}" PACKAGED_QA_HEIGHT="${PACKAGED_QA_SIZE#*x}"
driver_dir="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ ${1:-} != "--inside-disposable-db" ]]; then
  if [[ $# != 3 ]]; then
    printf 'Usage: %s BUILD_RECEIPT RUNTIME_BINARY TESSDATA_DIR\n' "$0" >&2
    exit 2
  fi
  cd "$(git rev-parse --show-toplevel)"
  qa_report="$(realpath -- "$1")"
  qa_engine="$(realpath -- "$2")"
  qa_tessdata="$(realpath -- "$3")"
  mkdir -p artifacts/packaged-coop-runs
  qa_run="$(mktemp -d "$PWD/artifacts/packaged-coop-runs/run-XXXXXXXX")"
  qa_revision="$(git rev-parse HEAD)"
  git diff --no-ext-diff --ignore-space-at-eol --exit-code HEAD -- apps crates config/gameplay scripts contracts packages
  [[ -r "$qa_tessdata/eng.traineddata" ]]
  qa_player="$PWD/apps/unity-client/Builds/Linux/Aetheria"
  [[ -x "$qa_player" && -x "$qa_engine" ]]
  qa_build_revision=$(node --input-type=module -e '
    import assert from "node:assert/strict";
    import {readFileSync} from "node:fs";
    const [path] = process.argv.slice(1);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(receipt.classification, "PASS");
    assert.equal(receipt.action, "linux");
    assert.match(receipt.sourceRevision, /^[a-f0-9]{40}$/);
    assert.ok(receipt.commands.every(command => command.exitCode === 0));
    process.stdout.write(receipt.sourceRevision);
  ' "$qa_report")
  if [[ "$qa_build_revision" != "$qa_revision" ]]; then
    [[ "$PACKAGED_QA_SCOPE" == four-clients || "$PACKAGED_QA_SCOPE" == feedback ]] || { echo "Linux package requires current source SHA" >&2; exit 2; }
    # Driver-only corrections affect the fixture and its evidence, not the
    # packaged game under test. Reject any other source-tree difference.
    git diff --no-ext-diff --exit-code "$qa_build_revision" "$qa_revision" -- . ':(top,exclude)scripts/packaged-coop/**'
  fi
  cp -- "$qa_report" "$qa_run/build-receipt.json"
  printf '%s\n' "$qa_revision" > "$qa_run/source-sha.txt"
  printf '%s\n' "$qa_build_revision" > "$qa_run/player-source-sha.txt"
  {
    node --version
    uname -sr
    if [[ "$PACKAGED_QA_SCOPE" == four-clients ]]; then
      printf 'Four independent Unity players, profiles and private Gamescope displays\n'
    else
      printf 'Unity player with three independently authenticated integration clients\n'
    fi
    printf 'Disposable local PostgreSQL, loopback Nest and Rust WSS, %s Gamescope and XTest input\n' "$PACKAGED_QA_SIZE"
  } > "$qa_run/environment.txt"
  (cd "$(dirname "$qa_player")" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$qa_run/player-package.sha256"
  sha256sum "$qa_run/player-package.sha256" "$qa_engine" > "$qa_run/build.sha256"
  printf 'Acceptance evidence will be saved in %s\n' "$qa_run"
  exec node scripts/with-test-db.mjs bash "$driver_dir/run.sh" --inside-disposable-db \
    "$qa_run" "$qa_engine" "$qa_revision" "$qa_player" "$qa_tessdata" "$PACKAGED_QA_SIZE" "${PACKAGED_QA_BOARD:-functional}" "$PACKAGED_QA_SCOPE" "$qa_build_revision" "${PACKAGED_QA_FOUR_ROTATION:-0}"
fi

shift
export PACKAGED_QA_RUN="$1" PACKAGED_QA_ENGINE="$2" PACKAGED_QA_REVISION="$3" PACKAGED_QA_TESSDATA="$5"
qa_player="$4"
qa_backend_pid=''
qa_game_pid=''
qa_sampler_pid=''
qa_xdg_dir=''
cleanup() {
  if [[ -n "$qa_sampler_pid" ]]; then
    if ! touch "$PACKAGED_QA_RUN/player-sampling-stop"; then
      kill "$qa_sampler_pid" 2>/dev/null || true
    fi
    wait "$qa_sampler_pid" || true
  fi
  if [[ -n "$qa_game_pid" ]]; then kill "$qa_game_pid" 2>/dev/null || true; fi
  if [[ -n "$qa_backend_pid" ]]; then kill "$qa_backend_pid" 2>/dev/null || true; fi
  if [[ -n "$qa_game_pid" ]]; then wait "$qa_game_pid" || true; fi
  if [[ -n "$qa_backend_pid" ]]; then wait "$qa_backend_pid" || true; fi
  if [[ -n "$qa_xdg_dir" ]]; then rm -rf -- "$qa_xdg_dir"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
qa_run="$PACKAGED_QA_RUN"
node --import tsx "$driver_dir/backend.mjs" > "$qa_run/backend.log" 2>&1 &
qa_backend_pid=$!
for ((attempt=0; attempt<120; attempt++)); do
  if [[ -s "$qa_run/game-endpoint" && -s "$qa_run/game-ca" ]]; then break; fi
  kill -0 "$qa_backend_pid"
  sleep .25
done
export AETHERIA_COOP_API="$(cat "$qa_run/game-endpoint")"
export AETHERIA_ARENA8_NATIVE_CA="$(cat "$qa_run/game-ca")"
qa_pulse="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/pulse/native"
if [[ -z "${PULSE_SERVER:-}" && -S "$qa_pulse" ]]; then export PULSE_SERVER="unix:$qa_pulse"; fi
if [[ "$PACKAGED_QA_SCOPE" == four-clients ]]; then
  "$driver_dir/four-clients.sh" "$qa_player"
  wait "$qa_backend_pid"
  qa_backend_pid=''
  python3 "$driver_dir/verify-four-clients.py" "$qa_run" "$PACKAGED_QA_SIZE" | tee "$qa_run/four-client-acceptance.json"
  exit 0
fi
qa_xdg_dir="$(mktemp -d "${TMPDIR:-/tmp}/aetheria-x11-XXXXXXXX")"
export XDG_RUNTIME_DIR="$qa_xdg_dir" XDG_CONFIG_HOME="$qa_run/profile"
mkdir -m 700 "$XDG_CONFIG_HOME"

if [[ "$PACKAGED_QA_BOARD" == shared-rng ]]; then export AETHERIA_QA_JEWEL_FEEDBACK=1; fi
python3 "$driver_dir/measure_player.py" "$qa_player" "$qa_run" "$PACKAGED_QA_SIZE" > "$qa_run/player-sampling.log" 2>&1 &
qa_sampler_pid=$!
gamescope --backend headless -w "$PACKAGED_QA_WIDTH" -h "$PACKAGED_QA_HEIGHT" \
  -W "$PACKAGED_QA_WIDTH" -H "$PACKAGED_QA_HEIGHT" -r 60 -- bash -ceu '
  unset WAYLAND_DISPLAY
  export SDL_VIDEODRIVER=x11
  printf "%s\n" "$$" > "$PACKAGED_QA_RUN/player-pid"
  printf "%s\n" "$DISPLAY" > "$PACKAGED_QA_RUN/display"
  exec "$1" -force-glcore -screen-width "$PACKAGED_QA_WIDTH" -screen-height "$PACKAGED_QA_HEIGHT" -screen-fullscreen 0 \
    -logFile "$PACKAGED_QA_RUN/game.log"
' launch-player "$qa_player" > "$qa_run/gamescope.log" 2>&1 &
qa_game_pid=$!
for ((attempt=0; attempt<120; attempt++)); do
  if [[ -s "$qa_run/display" ]]; then break; fi
  kill -0 "$qa_game_pid"
  sleep .25
done

phases=(fire first recover)
if [[ "$PACKAGED_QA_SCOPE" == full ]]; then phases+=(resume water); fi
if [[ "$PACKAGED_QA_BOARD" == shared-rng ]]; then phases=(fire shared-board); fi
for phase in "${phases[@]}"; do
  printf 'Running %s\n' "$phase" | tee -a "$qa_run/ui.log"
  # The full battle includes multiple button captures, OCR passes and a
  # packaged UI round-trip on every host turn.
  case "$phase" in
    resume|shared-board) phase_timeout=420s ;;
    *) phase_timeout=180s ;;
  esac
  timeout "$phase_timeout" python3 "$driver_dir/drive.py" "$phase" 2>&1 | tee -a "$qa_run/ui.log"
done
if [[ "$PACKAGED_QA_BOARD" == shared-rng ]]; then
  touch "$qa_run/player-sampling-stop"
  wait "$qa_sampler_pid"
  qa_sampler_pid=''
  wait "$qa_backend_pid"
  qa_backend_pid=''
  node "$driver_dir/verify-board.mjs" "$qa_run" "$PACKAGED_QA_SIZE" shared-rng | tee "$qa_run/board-acceptance.json"
  exit 0
fi
if [[ "$PACKAGED_QA_SCOPE" == board ]]; then
  # The recovery driver releases the backend after observing the packaged HUD.
  # Wait for proof that the authenticated host consumed a new ticket first.
  for ((attempt=0; attempt<80; attempt++)); do
    if [[ -s "$qa_run/host-renewed.json" ]]; then break; fi
    kill -0 "$qa_backend_pid"
    sleep .25
  done
  [[ -s "$qa_run/host-renewed.json" ]]
  touch "$qa_run/player-sampling-stop"
  wait "$qa_sampler_pid"
  qa_sampler_pid=''
  kill -TERM "$qa_backend_pid"
  backend_status=0
  wait "$qa_backend_pid" || backend_status=$?
  qa_backend_pid=''
  [[ "$backend_status" == 143 ]]
  node "$driver_dir/verify-board.mjs" "$qa_run" "$PACKAGED_QA_SIZE" | tee "$qa_run/board-acceptance.json"
  exit 0
fi
wait "$qa_backend_pid"
qa_backend_pid=''
node "$driver_dir/verify.mjs" "$qa_run" | tee "$qa_run/acceptance.json"
