"""Refine a private walk-only cloth overlay from its remaining visible contacts.

Move the original garment toward the unobstructed camera directions at contacts.
Use a fixed smooth rest-space field across the walk and apply the same offsets
at coincident seams. Preserve all posed Body vertices and the 12 mm study cap.
"""
import argparse
import json
from pathlib import Path

import numpy as np

from icarus_skirt_local_clearance import SOURCE_SHA, original_skirt, sections, sha, smooth


def visible_field(rest, faces, witnesses):
    directions = {"+z": (0, 0, 1), "-z": (0, 0, -1), "+x": (1, 0, 0), "-x": (-1, 0, 0)}
    # Accumulate distinct directions for each face. A long-lived intersection
    # should not move its panel farther just because it appears in more frames.
    hits = {}
    for entry in witnesses:
        hits.setdefault(entry["skirtTriangle"], set()).update(entry["views"])
    if not hits:
        raise ValueError("No visible skirt contacts to refine")
    votes = np.zeros((len(rest), 3))
    falloff = np.zeros(len(rest))
    for face, views in hits.items():
        points = rest[faces[face]]
        distance = np.linalg.norm(rest[:, None] - points, axis=2).min(axis=1)
        influence = smooth(1 - distance / .028)
        falloff = np.maximum(falloff, influence)
        for key in views:
            votes += influence[:, None] * directions[key]
    return falloff[:, None] * votes / np.maximum(np.linalg.norm(votes, axis=1, keepdims=True), 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("vrm", "baseline", "prior_target", "prior_native", "witnesses", "output"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    original, faces = original_skirt(args.vrm)
    refs = json.loads(args.witnesses.read_text())
    if refs["sourceSha256"] != SOURCE_SHA or refs["posesSha256"] != sha(args.prior_native):
        raise ValueError("Witnesses belong to another take")
    offset, base = sections(args.baseline)
    _, prior = sections(args.prior_target)
    _, native = sections(args.prior_native)
    if (not np.array_equal(base[:, :-len(original)], prior[:, :-len(original)]) or
            np.max(np.linalg.norm(native - prior, axis=2)) > .001):
        raise ValueError("Previous overlay or native playback differs from supplied baseline/target")
    field = visible_field(original, faces, refs["witnesses"])
    prior_delta = prior[:, -len(original):] - base[:, -len(original):]
    delta = prior_delta + .009 * field
    # Use one scale across every frame of each welded set to avoid popping.
    _, welded = np.unique(original.round(5), axis=0, return_inverse=True)
    peaks = np.zeros(welded.max() + 1)
    np.maximum.at(peaks, welded, np.linalg.norm(delta, axis=2).max(axis=0))
    delta *= np.minimum(1., .012 / np.maximum(peaks, 1e-9))[welded, None]
    selected = np.flatnonzero(np.linalg.norm(delta, axis=2).max(axis=0) > 1e-9)
    args.output.mkdir(parents=True, exist_ok=False)
    cache = args.output / "localized-skirt.bin"
    with args.baseline.open("rb") as source, cache.open("xb") as dest:
        dest.write(source.read(offset))
        for frame, change in zip(base, delta):
            frame[:-len(original)].tofile(dest)
            (frame[-len(original):] + change).astype("<f4").tofile(dest)
    receipt = {"sourceSha256": SOURCE_SHA, "baselineSha256": sha(args.baseline),
               "priorTargetSha256": sha(args.prior_target), "priorNativeSha256": refs["posesSha256"],
               "witnessSha256": sha(args.witnesses), "cacheSha256": sha(cache),
               "visibleContactCount": len(refs["witnesses"]), "vertices": selected.tolist(),
               "maximumDisplacementMeters": float(np.linalg.norm(delta, axis=2).max()),
               "scope": "Private walk-only correction. Remeasure contact, contour and Unity playback."}
    (args.output / "localized-skirt.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
