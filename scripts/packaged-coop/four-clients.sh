#!/usr/bin/env bash
set -euo pipefail
player="$1"
driver_dir="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
run="$PACKAGED_QA_RUN"
game_pids=()
driver_pids=()
runtime_dirs=()
cleanup_players() {
  for pid in "${driver_pids[@]}" "${game_pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${driver_pids[@]}" "${game_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  for runtime_dir in "${runtime_dirs[@]}"; do rm -rf -- "$runtime_dir"; done
}
trap cleanup_players EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for seat in 0 1 2 3; do
  client="$run/client-$seat"
  mkdir -p -m 700 "$client"/{profile,data}
  runtime_dirs+=("$(mktemp -d "${TMPDIR:-/tmp}/aetheria-four-XXXXXXXX")")
  PACKAGED_QA_RUN="$client" XDG_RUNTIME_DIR="${runtime_dirs[$seat]}" XDG_CONFIG_HOME="$client/profile" XDG_DATA_HOME="$client/data" \
    gamescope --backend headless -w "$PACKAGED_QA_WIDTH" -h "$PACKAGED_QA_HEIGHT" \
    -W "$PACKAGED_QA_WIDTH" -H "$PACKAGED_QA_HEIGHT" -r 60 -- bash -ceu '
    unset WAYLAND_DISPLAY
    export SDL_VIDEODRIVER=x11
    printf "%s\n" "$$" > "$PACKAGED_QA_RUN/player-pid"
    printf "%s\n" "$DISPLAY" > "$PACKAGED_QA_RUN/display"
    exec "$1" -force-glcore -screen-width "$PACKAGED_QA_WIDTH" -screen-height "$PACKAGED_QA_HEIGHT" \
      -screen-fullscreen 0 -logFile "$PACKAGED_QA_RUN/game.log"
  ' four-client-player "$player" > "$client/gamescope.log" 2>&1 &
  game_pids+=("$!")
  for ((attempt=0; attempt<120; attempt++)); do
    if [[ -s "$client/display" ]]; then break; fi
    kill -0 "${game_pids[$seat]}"
    sleep .25
  done
  [[ -s "$client/display" ]]
done

drive() {
  local seat="$1" phase="$2" limit=180s
  if [[ "$phase" == four-lobby ]]; then limit=360s; fi
  PACKAGED_QA_RUN="$run/client-$seat" PACKAGED_QA_SEAT="$seat" \
    timeout "$limit" python3 "$driver_dir/drive.py" "$phase" >> "$run/client-$seat/ui.log" 2>&1
}
drive_all() {
  local phase="$1" state=0
  driver_pids=()
  for seat in 0 1 2 3; do
    drive "$seat" "$phase" &
    driver_pids+=("$!")
  done
  for pid in "${driver_pids[@]}"; do wait "$pid" || state=1; done
  driver_pids=()
  return "$state"
}
drive_all four-lobby
drive 0 four-host-room-start
drive_all four-battle
for seat in 0 1 2 3; do
  client="$run/client-$seat"
  kill -0 "$(cat "$client/player-pid")"
  PACKAGED_QA_RUN="$client" python3 "$driver_dir/window.py" > "$client/window-id"
done
