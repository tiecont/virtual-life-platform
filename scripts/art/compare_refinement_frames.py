"""Compare the private Icarus URP stills at matching pose, resolution and camera."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


VIEWS = [f"icarus-{subject}-{i:02d}.png" for subject in
         ("charakuru-walk", "motion-chin", "motion-pelvis") for i in range(1, 5)]
VIEWS += ["icarus-face-walk-85pct.png", *[f"body-{view}-walk-10pct.png" for view in ("front", "back", "side")]]
PAIRS = {"rendering": ("A-original-v1", "B-render-v1"),
         "repeat": ("B-render-v1", "B-repeat-control"),
         "partition": ("B-render-v1", "C-partition-control"),
         "correction": ("C-partition-control", "C-undercloth-v1")}


def image(path):
    with Image.open(path) as source:
        if source.size != (720, 720) or source.format != "PNG" or source.mode != "RGB":
            raise ValueError(f"Unexpected benchmark output at {path}")
        return np.asarray(source).astype(np.int16)


def difference(left, right):
    difference = np.abs(left - right)
    changed = difference.max(axis=2) > 8
    y, x = np.nonzero(changed)
    return {"pixelsOver8": int(len(x)), "maxChannelDelta": int(difference.max()),
            "meanAbsoluteDelta": float(difference.mean()),
            "meanRgbShift": (right - left).mean(axis=(0, 1)).tolist(),
            "changedBoundsInclusive": [int(x.min()), int(y.min()), int(x.max()), int(y.max())] if len(x) else None}


def compare(root):
    receipt = json.loads((root / "garment-study.json").read_text())
    if receipt["source"] != "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a":
        raise ValueError("Unexpected original VRM")
    hashes, results = {}, {}
    variants = sorted({folder for pair in PAIRS.values() for folder in pair})
    for view in VIEWS:
        frames = {}
        for variant in variants:
            path = root / variant / view
            frames[variant] = image(path)
            hashes[f"{variant}/{view}"] = hashlib.sha256(path.read_bytes()).hexdigest()
        results[view] = {label: difference(frames[a], frames[b]) for label, (a, b) in PAIRS.items()}
    return {"source": receipt["source"], "motion": receipt["walk"], "pairs": PAIRS,
            "outputPixels": [720, 720], "measurements": results, "sha256": hashes}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = compare(args.captures)
    with args.output.open("x") as output:
        json.dump(result, output, indent=2, allow_nan=False)
        output.write("\n")
