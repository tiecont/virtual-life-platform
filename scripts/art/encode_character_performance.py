"""Encode a private Unity performance take with its source voice at the authored cue."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile


def encode(report_path, output):
    report = json.loads(report_path.read_text())
    count, fps = report["frames"], report["fps"]
    duration, cue = report["duration"], report["cueStart"]
    if fps not in (24, 60) or count != math.ceil(duration * fps) or not 0 <= cue < duration:
        raise ValueError("Invalid or incomplete performance timing")
    frames = report_path.parent / "frames"
    if sorted(p.name for p in frames.glob("frame-*.png")) != [f"frame-{i:05}.png" for i in range(count)]:
        raise ValueError("Missing or unexpected frame in the exported sequence")
    assets = Path(__file__).resolve().parents[2] / "apps/unity-client/Assets"
    voice = (assets.parent / report["voiceAsset"]).resolve()
    if not voice.is_relative_to(assets) or voice.suffix != ".ogg":
        raise ValueError("Expected an original Unity Ogg voice asset")
    if output.suffix != ".mp4" or output.exists():
        raise ValueError("Choose a new .mp4 output")
    # Encode to a sibling temporary file; publish only after independent stream inspection.
    with tempfile.TemporaryDirectory(dir=output.parent) as scratch:
        temp = Path(scratch) / "take.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-n", "-framerate", str(fps),
                        "-i", str(frames / "frame-%05d.png"), "-i", str(voice),
                        "-af", f"adelay={round(cue * 1000)}:all=1,apad", "-map", "0:v", "-map", "1:a",
                        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
                        "-t", f"{count / fps:.9f}", "-movflags", "+faststart", str(temp)], check=True)
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams",
                                                   "-of", "json", str(temp)]))["streams"]
        video = next(s for s in probe if s["codec_type"] == "video")
        if (int(video["nb_frames"]), video["width"], video["height"]) != (count, report["frameWidth"], report["frameHeight"]):
            raise ValueError("Encoded video differs from the Unity render profile")
        if not any(s["codec_type"] == "audio" for s in probe):
            raise ValueError("Missing encoded voice")
        output.hardlink_to(temp)
    return {"video": str(output), "frames": count, "fps": fps, "cueStart": cue,
            "audio": "offline source voice mux", "voiceSha256": hashlib.sha256(voice.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(encode(args.report, args.output)))
