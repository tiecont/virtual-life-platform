"""Encode a private Unity performance take with its source voice at the authored cue."""
import argparse
import hashlib
import json
import math
from fractions import Fraction
from pathlib import Path
import subprocess
import tempfile

import numpy as np


def take_inputs(report_path):
    report = json.loads(report_path.read_text())
    count, fps = report["frames"], report["fps"]
    duration, cue = report["duration"], report["cueStart"]
    if fps not in (24, 60) or count != math.ceil(duration * fps) or not 0 <= cue < duration:
        raise ValueError("Invalid or incomplete performance timing")
    assets = Path(__file__).resolve().parents[2] / "apps/unity-client/Assets"
    voice = (assets.parent / report["voiceAsset"]).resolve()
    if not voice.is_relative_to(assets) or voice.suffix != ".ogg":
        raise ValueError("Expected an original Unity Ogg voice asset")
    return report, voice


def validate_take(report, video_path, voice):
    probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams",
                                               "-of", "json", str(video_path)]))["streams"]
    video, = [s for s in probe if s["codec_type"] == "video"]
    audio, = [s for s in probe if s["codec_type"] == "audio"]
    fps, cue, count = report["fps"], report["cueStart"], report["frames"]
    if ((int(video["nb_frames"]), video["width"], video["height"]) !=
            (count, report["frameWidth"], report["frameHeight"]) or Fraction(video["avg_frame_rate"]) != fps):
        raise ValueError("Encoded video differs from the Unity render profile")

    rate = 16000
    def samples(path, duration):
        data = subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-map", "0:a:0",
                                        "-t", str(duration), "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"])
        return np.frombuffer(data, dtype="<f4").astype(np.float64)

    # Match the source audio inside the decoded master. Search the whole take to
    # detect early cues, drifted starts or unrelated tracks with valid metadata.
    duration = count / fps
    reference = samples(voice, duration - cue)
    decoded = samples(video_path, duration)
    n = len(reference)
    if n < rate // 10 or len(decoded) < n:
        raise ValueError("Insufficient audio for source timing verification")
    reference -= reference.mean()
    energy = reference @ reference
    if energy <= 1e-10:
        raise ValueError("Silent source cannot establish cue timing")
    fft_size = 1 << (len(decoded) + n - 2).bit_length()
    dot = np.fft.irfft(np.fft.rfft(decoded, fft_size) * np.fft.rfft(reference[::-1], fft_size),
                       fft_size)[n - 1:len(decoded)]
    def window_sum(values):
        prefix = np.insert(values.cumsum(), 0, 0.)
        return prefix[n:] - prefix[:-n]
    variance = window_sum(decoded ** 2) - window_sum(decoded) ** 2 / n
    score = dot / np.sqrt(energy * np.maximum(variance, 1e-10))
    peak = int(np.argmax(score))
    measured = peak / rate + float(audio["start_time"]) - float(video["start_time"])
    error = measured - cue
    if score[peak] < .80 or abs(error) > 1 / fps:
        raise ValueError(f"Voice/cue mismatch: correlation {score[peak]:.3f}, offset {error:.4f} s")
    return {"measuredVoiceStartSeconds": measured, "authoredVoiceStartSeconds": cue,
            "errorMilliseconds": error * 1000, "correlation": float(score[peak]),
            "analyzedSourceSamples": n, "sampleRate": rate, "toleranceFrames": 1}


def encode(report_path, output):
    report, voice = take_inputs(report_path)
    count, fps, cue = report["frames"], report["fps"], report["cueStart"]
    frames = report_path.parent / "frames"
    if sorted(p.name for p in frames.glob("frame-*.png")) != [f"frame-{i:05}.png" for i in range(count)]:
        raise ValueError("Missing or unexpected frame in the exported sequence")
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
        verified = validate_take(report, temp, voice)
        output.hardlink_to(temp)
    return {"video": str(output), "frames": count, "fps": fps, "cueStart": cue,
            "timingVerification": verified, "audio": "offline source voice mux", "voiceSha256": hashlib.sha256(voice.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--verify-existing", action="store_true", help="Measure voice sync in an existing encoded take")
    args = parser.parse_args()
    if args.verify_existing:
        report, voice = take_inputs(args.report)
        print(json.dumps(validate_take(report, args.output, voice)))
    else:
        print(json.dumps(encode(args.report, args.output)))
