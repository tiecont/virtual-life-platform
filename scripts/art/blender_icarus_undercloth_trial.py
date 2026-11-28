"""Study local thigh clearance with every original garment vertex held fixed.

Use original walk surface samples. Move only a small neighborhood on the actual
pelvis/thigh component, retreating from the unobstructed sight lines recorded
at skin/cloth intersections. Output a private fit trial for contact and contour
checks; a separate native textured comparison is required before adoption.
"""
import argparse
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_icarus_skirt_regions import SOURCE, source_geometry
from icarus_skirt_local_clearance import sections, sha, smooth


def study(source, baseline, witnesses, output):
    body, _, regions, _ = source_geometry(source)
    offset, poses = sections(baseline)
    report = json.loads(witnesses.read_text())
    if report["sourceSha256"] != SOURCE or report["posesSha256"] != sha(baseline):
        raise ValueError("Use intersections from this original Unity take")
    indices = np.flatnonzero(regions == "pelvis-and-thighs")
    faces = body[np.all(regions[body] == "pelvis-and-thighs", axis=1)]
    if len(faces) != report['thighTriangles'] or not report['witnesses']:
        raise ValueError("No matching lower-body witnesses")
    n = len(regions)
    rest = poses[0, :n]
    groups = {}
    for row in report["witnesses"]:
        groups.setdefault(row["bodyTriangle"], set()).update(row["views"])
    vectors = {"+x": (1, 0, 0), "-x": (-1, 0, 0), "+z": (0, 0, 1), "-z": (0, 0, -1)}
    vote = np.zeros((len(indices), 3))
    reach = np.zeros(len(indices))
    for face, views in groups.items():
        distance = np.linalg.norm(rest[indices, None] - rest[faces[face]], axis=2).min(axis=1)
        influence = smooth(1 - distance / .025)
        reach = np.maximum(reach, influence)
        for view in views:
            vote -= influence[:, None] * vectors[view]
    field = .006 * reach[:, None] * vote / np.maximum(np.linalg.norm(vote, axis=1, keepdims=True), 1)
    if not np.isfinite(field).all() or np.max(np.linalg.norm(field, axis=1)) > .00601:
        raise ValueError("Invalid undercloth displacement")
    output.mkdir(parents=True, exist_ok=False)
    cache = output / "undercloth-walk.bin"
    with baseline.open('rb') as original, cache.open('xb') as target:
        target.write(original.read(offset))
        for frame in poses:
            if not np.array_equal(frame[:n], frame[n:2*n]):
                raise ValueError("Original arm/body streams differ")
            changed = frame[:n].copy()
            changed[indices] += field
            changed.tofile(target)
            changed.tofile(target)
            frame[2*n:].tofile(target)
    (output / "undercloth-study.json").write_text(json.dumps({
        "sourceSha256": SOURCE, "originalPosesSha256": sha(baseline), "posesSha256": sha(cache),
        "witnessesSha256": sha(witnesses), "vertices": indices[np.linalg.norm(field, axis=1) > 0].tolist(),
        "sourceContactFaces": len(groups), "maxThighDisplacementMeters": float(np.linalg.norm(field, axis=1).max()),
        "frames": len(poses), "garment": "All original posed garment vertices retained byte-for-byte",
        "scope": "Private geometric trial on the original walk; native visual comparison required."
    }, indent=2) + "\n")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('source', 'baseline', 'witnesses', 'output'):
        parser.add_argument(key, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    study(args.source, args.baseline, args.witnesses, args.output)
