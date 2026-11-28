"""Record the packaged Linux player's CPU time and resident memory via procfs."""

import json
import os
from pathlib import Path
import sys
from time import monotonic, sleep

SAMPLE_INTERVAL_SECONDS = 0.25
LAUNCH_WAIT_SECONDS = 30
CLOCK_TICKS_PER_SECOND = os.sysconf("SC_CLK_TCK")


def sample(pid):
    process = Path("/proc") / str(pid)
    fields = (process / "stat").read_text().rpartition(") ")[2].split()
    memory = {}
    for line in (process / "status").read_text().splitlines():
        key, _, value = line.partition(":")
        if key in ("VmRSS", "VmHWM"):
            memory[key] = int(value.split()[0]) * 1024
    if "VmRSS" not in memory or fields[0] == "Z":
        raise ProcessLookupError(pid)
    return {
        "cpuTicks": int(fields[11]) + int(fields[12]),
        "startTicks": int(fields[19]),
        "rssBytes": memory["VmRSS"],
        "vmHwmBytes": memory.get("VmHWM"),
        "time": monotonic(),
    }


def measure(player, output, resolution):
    result = {
        "scope": "Unity player process only",
        "requestedResolution": resolution,
        "sampleIntervalSeconds": SAMPLE_INTERVAL_SECONDS,
        "status": "unavailable",
        "snapshotCount": 0,
    }
    stop = output / "player-sampling-stop"
    pid_file = output / "player-pid"
    until = monotonic() + LAUNCH_WAIT_SECONDS
    while not stop.exists() and monotonic() < until:
        try:
            pid = int(pid_file.read_text())
            if (Path("/proc") / str(pid) / "exe").readlink() == player:
                first = sample(pid)
                break
        except (OSError, ValueError):
            # The Gamescope shell records its PID immediately before exec.
            pass
        sleep(SAMPLE_INTERVAL_SECONDS)
    else:
        result["endReason"] = "player-not-observed"
        return result

    last = first
    result["snapshotCount"] = 1
    peak = first["rssBytes"]
    peak_kernel = first["vmHwmBytes"]
    end_reason = "runner-finished"
    while True:
        sleep(SAMPLE_INTERVAL_SECONDS)
        try:
            current = sample(pid)
        except (FileNotFoundError, ProcessLookupError):
            end_reason = "player-exited"
            break
        if current["startTicks"] != first["startTicks"]:
            end_reason = "pid-replaced"
            break
        last = current
        peak = max(peak, last["rssBytes"])
        if last["vmHwmBytes"] is not None:
            peak_kernel = max(peak_kernel or 0, last["vmHwmBytes"])
        result["snapshotCount"] += 1
        if stop.exists():
            break

    elapsed = last["time"] - first["time"]
    cpu = (last["cpuTicks"] - first["cpuTicks"]) / CLOCK_TICKS_PER_SECOND
    result.update(
        status="measured" if elapsed > 0 else "unavailable",
        endReason=end_reason,
        elapsedSeconds=round(elapsed, 3),
        playerCpuSeconds=round(cpu, 3),
        meanCpuPercentOfOneCore=round(cpu * 100 / elapsed, 2) if elapsed > 0 else None,
        peakRssBytesSampled=peak,
        peakRssBytesKernel=peak_kernel,
    )
    return result


if __name__ == "__main__":
    player_path, run_path = map(Path, sys.argv[1:3])
    result = measure(player_path.resolve(), run_path, sys.argv[3])
    (run_path / "player-performance.json").write_text(json.dumps(result, indent=2) + "\n")
