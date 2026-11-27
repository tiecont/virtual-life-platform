#!/usr/bin/env python3
"""Render the SoulBound private score audition from authored notes and synthesized voices."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import wave

import numpy as np

RATE = 48000
PITCH_CLASSES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
# D–F#–A–B introduces SoulBound. Later arrangements retain its contour.
MOTIF = (74, 78, 81, 83)
HARMONY = (
    (50, 57, 62, 66, 69),
    (47, 54, 59, 62, 66),
    (43, 50, 55, 57, 62),
    (45, 52, 57, 62, 64),
    (42, 49, 54, 57, 61),
    (43, 50, 55, 59, 62),
    (47, 54, 59, 62, 66),
    (45, 52, 57, 61, 64),
)
ARRANGEMENTS = {
    "main-theme": ("Title and opening", "A tender invitation, then a small lift", 80, 4, 8, "theme", 0),
    "central-plaza": ("Central Plaza", "Welcoming, warm and unhurried", 78, 3, 8, "plaza", 0),
    "cinder-exploration": ("Cinder Terraces", "Patient curiosity over ember-lit stone", 88, 4, 8, "cinder", -2),
    "tideglass-exploration": ("Tideglass Lagoon", "Fluid and luminous with chamber-scale motion", 75, 4, 8, "water", 5),
    "coop-boss": ("Cooperative boss", "Resolve and controlled pressure", 108, 4, 8, "boss", 0),
    "coop-boss-phase-2": ("Cooperative boss phase two", "The same harmony with climbing urgency", 108, 4, 8, "phase", 0),
    "victory": ("Victory reward", "A small, bright arrival", 108, 4, 2, "victory", 0),
    "defeat": ("Defeat result", "An unresolved sigh followed by reassurance", 72, 4, 2, "defeat", -2),
}


def voice(kind, note, frames):
    time = np.arange(frames) / RATE
    pitch = 440 * 2 ** ((note - 69) / 12)
    theta = math.tau * pitch * time
    sine = np.sin
    if kind == "harp":
        signal = sum(weight * sine(theta * partial) * np.exp(-time * decay)
                     for partial, weight, decay in [(1, 1, 2.6), (2, .35, 4), (3, .15, 7), (5, .07, 12)])
        attack, release = .010, .080
    elif kind == "bell":
        signal = sum(weight * sine(theta * partial) * np.exp(-time * decay)
                     for partial, weight, decay in [(1, 1, 1.5), (2.01, .30, 4), (3.95, .11, 7), (5.42, .06, 14)])
        attack, release = .004, .150
    elif kind == "flute":
        vibrato = .24 * sine(math.tau * 4.6 * time) * np.minimum(1, time * 3)
        phase = theta + vibrato
        signal = sine(phase) + .19 * sine(2 * phase) + .05 * sine(3 * phase)
        attack, release = .085, .160
    elif kind == "strings":
        phase = theta + .18 * sine(math.tau * 5 * time)
        signal = sum(sine(phase * partial + .27 * partial) / partial ** 1.55 for partial in range(1, 7))
        signal = .72 * signal + .28 * sine(theta * 1.002 + .7)
        attack, release = .160, .280
    else:
        signal = sine(math.tau * (pitch * .65 * time + 2.4 * (1 - np.exp(-time * 30)))) * np.exp(-time * 12)
        attack, release = .006, .040
    envelope = np.minimum(1, time / attack) * np.minimum(1, (frames - 1 - np.arange(frames)) / (release * RATE))
    return signal * envelope


def render(bpm, beats, bars, arrangement, transpose):
    loop = arrangement not in {"theme", "victory", "defeat"}
    total_beats = bars * beats
    buffer = np.zeros((round(RATE * (total_beats * 60 / bpm + (0 if loop else 1.4))), 2))
    voices = set()

    def add(kind, note, beat, length, gain, pan):
        voices.add(kind)
        start = round(beat * 60 / bpm * RATE)
        dry = voice(kind, note + transpose, round(length * 60 / bpm * RATE))[:, None]
        for delay, amount, position in [(0, 1, pan), (.087, .16, -pan), (.173, .09, pan * .5), (.311, .055, -.3)]:
            index = np.arange(len(dry)) + start + round(delay * RATE)
            stereo = dry * gain * amount * np.sqrt([(1 - position) / 2, (1 + position) / 2])
            if loop:
                np.add.at(buffer, index % len(buffer), stereo)
            else:
                valid = index < len(buffer)
                buffer[index[valid]] += stereo[valid]

    if arrangement in {"victory", "defeat"}:
        notes = MOTIF + (81, 86) if arrangement == "victory" else (81, 78, 74, 71, 73, 74)
        for i, note in enumerate(notes):
            add("flute", note, i * .72, 1.12, .094, -.14)
            add("bell", note - (12 if arrangement == "defeat" else 0), i * .72, 1.35, .04, .24)
        for a, chord in [(0, HARMONY[0] if arrangement == "victory" else HARMONY[1]), (3, HARMONY[0])]:
            for i, note in enumerate(chord):
                add("strings", note, a + i * .10, 3.6, .030, (i - 2) * .22)
    else:
        combat = arrangement in {"boss", "phase"}
        phrases = [(74, 78, 81, 83), (81, 78, 74), (79, 78, 74, 76), (73, 76, 78),
                   (78, 81, 85), (83, 81, 79), (74, 78, 81, 86), (85, 81, 76)]
        if arrangement == "theme":
            phrases[-1] = (81, 78, 74)
        for bar in range(bars):
            start = bar * beats
            chord = HARMONY[bar] if arrangement != "theme" or bar != bars - 1 else HARMONY[0]
            for i, note in enumerate((chord[0], chord[1], chord[3], chord[4])):
                add("strings", note, start, beats + (.26 if loop else .07), .042 if combat else .025, (i - 1.5) * .28)
            hits = beats * 2
            sequence = (0, 2, 1, 3, 4, 2, 3, 1) if arrangement != "water" else (0, 3, 2, 4, 1, 4, 3, 2)
            for step in range(hits):
                note = chord[sequence[step]] + (12 if arrangement in {"plaza", "water"} else 0)
                add("harp", note, start + step * .5, 2, .076 if step == 0 else .054, (-1) ** step * .38)
            if not combat or bar % 2 == 0 or arrangement == "phase":
                for i, note in enumerate(phrases[bar]):
                    position = (i * .70 if beats == 3 else [0, .75, 1.75, 2.75][i])
                    add("flute" if arrangement != "cinder" else "harp", note, start + position,
                        min(.98, beats - position + .15), .090 - i * .008, -.18)
            if arrangement in {"theme", "water", "phase"} and bar in {0, 2, 5, 6}:
                add("bell", chord[4] + 24, start + 1.5, 2.5, .041, .54)
            if combat or arrangement == "cinder":
                pulses = (0, 1.5, 2.5, 3.5) if arrangement == "phase" else ((0, 2.5) if combat else (0,))
                for pulse in pulses:
                    add("drum", 39 if combat else 42, start + pulse, .55, .11 if combat else .05, -.07)
    if not loop:
        fade = round(RATE * .50)
        buffer[-fade:] *= np.linspace(1, 0, fade)[:, None]
    max_level = float(np.max(np.abs(buffer)))
    return buffer * (10 ** (-4 / 20) / max_level), sorted(voices), loop


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New directory for private WAV masters and Ogg auditions")
    parser.add_argument("--source-revision", required=True, help="Git revision used for the score brief")
    args = parser.parse_args()
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    entries = []
    for name, arrangement in ARRANGEMENTS.items():
        title, mood, bpm, beats, bars, _, transpose = arrangement
        samples, voices, loop = render(*arrangement[2:])
        master, audition = (args.output / f"{name}.{extension}" for extension in ("wav", "ogg"))
        pcm = np.rint(samples * 32767).astype("<i2")
        with wave.open(str(master), "wb") as writer:
            writer.setparams((2, 2, RATE, len(pcm), "NONE", "not compressed"))
            writer.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(master),
                        "-c:a", "libvorbis", "-q:a", "5", str(audition)], check=True)
        neighbor = np.abs(np.diff(samples[np.r_[-512:0, :512]], axis=0))
        seam = float(neighbor[511].max())
        nearby = float(np.quantile(np.delete(neighbor, 511, axis=0), .99))
        if loop and seam > max(.003, nearby * 3):
            raise ValueError(f"{name} has a discontinuous loop boundary")
        entries.append({
            "trackId": name, "scene": title, "mood": mood, "voices": voices,
            "sampleRate": RATE, "channels": 2, "format": "WAV PCM 16-bit and Ogg Vorbis q5",
            "tempoBpm": bpm, "meter": f"{beats}/4", "bars": bars,
            "tonalCenter": PITCH_CLASSES[(2 + transpose) % 12],
            "motifMidi": [note + transpose for note in MOTIF],
            "durationSeconds": len(pcm) / RATE, "loop": loop,
            "transitionBeats": [b * beats for b in range(bars)] if loop else [0],
            "measuredPeakDbfs": round(float(20 * np.log10(np.max(np.abs(pcm)) / 32767)), 2),
            "rmsDbfs": round(float(20 * np.log10(np.sqrt(np.mean(samples ** 2)))), 2),
            "clippedPcmSamples": int(np.sum(np.abs(pcm.astype(int)) >= 32767)),
            "loopBoundaryStep": seam if loop else None,
            "nearbyStepP99": nearby if loop else None,
            "master": {"file": master.name, "sha256": sha256(master)},
            "audition": {"file": audition.name, "sha256": sha256(audition)},
        })
    manifest = {
        "sourceRevision": args.source_revision, "briefRevision": "soulbound-score-r1",
        "provenance": "Original note composition and local oscillator synthesis. No external samples.",
        "referenceAssets": [], "rights": "PENDING_REVIEW", "publication": "UNPUBLISHED",
        "runtimeIntegration": "NOT_RUN", "privateDelivery": "NOT_RUN",
        "tracks": entries,
    }
    (args.output / "score-audition.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
