#!/usr/bin/env python3
"""Compose the offline opening animatic from actual game captures and the local score."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

SHOTS = (
    ("01-central-plaza-spawn.png", "Central Plaza", 18, -8),
    ("cinder-terraces-arena.png", "Cinder Terraces", -33, 12),
    ("tideglass-lagoon-arena.png", "Tideglass Lagoon", 33, -12),
    ("dawn-prism-sanctum-arena.png", "Dawn Prism Sanctum", 0, -25),
)
FPS = 30
SHOT_FRAMES = 210
DISSOLVE = .8
DURATION = SHOT_FRAMES / FPS * len(SHOTS) - DISSOLVE * (len(SHOTS) - 1)
SERIF = "DejaVu Serif"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text(value, font_size, y, enable=None):
    style = (f"drawtext=font='{SERIF}':text='{value}':fontsize={font_size}:fontcolor=0xffeccd"
             f":x=(w-tw)/2:y={y}:shadowcolor=0x1a130c:shadowx=1:shadowy=2")
    if enable:
        style += f":enable='{enable}'"
    return style


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path)
    parser.add_argument("score", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--capture-revision", required=True)
    parser.add_argument("--source-revision", required=True)
    args = parser.parse_args()
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    sources = [args.captures / shot[0] for shot in SHOTS]
    output = args.output / "soulbound-opening-animatic.mp4"
    graph = []
    for i, (_, label, x, y) in enumerate(SHOTS):
        graph.append(
            f"[{i}:v]scale=2560:1440,"
            f"zoompan=z='1.04+0.00018*on':x='iw/2-iw/zoom/2+({x})*on/{SHOT_FRAMES}'"
            f":y='ih/2-ih/zoom/2+({y})*on/{SHOT_FRAMES}':d={SHOT_FRAMES}:s=1280x720:fps={FPS},"
            "setsar=1,format=yuv420p,drawbox=x=0:y=0:w=iw:h=36:color=0x111213:t=fill,"
            "drawbox=x=0:y=ih-75:w=iw:h=75:color=0x111213:t=fill,"
            f"{text(label, 20, 'h-49')}[s{i}]"
        )
    left = "s0"
    for i in range(1, len(SHOTS)):
        offset = i * (SHOT_FRAMES / FPS - DISSOLVE)
        graph.append(f"[{left}][s{i}]xfade=transition=fade:duration={DISSOLVE}:offset={offset:.1f}[mix{i}]")
        left = f"mix{i}"
    ending = "gte(t,22.1)"
    graph.append(f"[{left}]fade=t=in:st=0:d=0.8,"
                 f"{text('AETHERIA', 59, 'h*0.38', ending)},"
                 f"{text('S O U L B O U N D', 26, 'h*0.49', ending)},"
                 f"fade=t=out:st={DURATION - 1.1:.1f}:d=1.1,format=yuv420p[out]")
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-filter_complex_threads", "2"]
    for source in sources:
        cmd.extend(["-i", str(source)])
    cmd.extend(["-i", str(args.score), "-filter_complex", ";".join(graph), "-map", "[out]",
                "-map", f"{len(sources)}:a", "-af", "apad,afade=t=out:st=24:d=1.4",
                "-t", f"{DURATION:.1f}", "-c:v", "libx264", "-threads", "4", "-crf", "18",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output)])
    subprocess.run(cmd, check=True)
    proof = subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(output)])
    info = json.loads(proof)
    assert len(info["streams"]) == 2
    video, audio = info["streams"]
    assert (video["codec_name"], video["width"], video["height"], video["avg_frame_rate"]) == ("h264", 1280, 720, "30/1")
    assert (audio["codec_name"], audio["channels"], int(audio["sample_rate"])) == ("aac", 2, 48000)
    manifest = {
        "sourceRevision": args.source_revision, "captureRevision": args.capture_revision,
        "briefRevision": "soulbound-opening-animatic-r1",
        "provenance": "Local composition using four rendered Unity captures and original local score.",
        "kind": "Still-image animatic with pans, dissolves and title. Character animation absent.",
        "shots": [{"file": path.name, "sha256": digest(path), "scene": shot[1],
                   "startSeconds": i * (SHOT_FRAMES / FPS - DISSOLVE)}
                  for i, (path, shot) in enumerate(zip(sources, SHOTS, strict=True))],
        "score": {"file": args.score.name, "sha256": digest(args.score)},
        "video": {"file": output.name, "sha256": digest(output), "bytes": output.stat().st_size,
                  "seconds": float(info["format"]["duration"]), "fps": FPS, "size": [1280, 720]},
        "rights": "PENDING_REVIEW", "publication": "UNPUBLISHED",
        "runtimeIntegration": "NOT_RUN", "privateDelivery": "NOT_RUN",
    }
    (args.output / "animatic.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
