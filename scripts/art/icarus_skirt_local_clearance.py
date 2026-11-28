"""Prepare a bounded private garment trial from measured Unity vertex motion.

Use original vertex IDs, shared seam positions and the measured 4-to-8-degree skirt-root increment.
Keep a fixed local mask across all poses and cap the largest vertex shift. Emit
a posed ICL1 review cache for the independent contact and contour measurements.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

from icarus_chin_weights import SOURCE_SHA


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sections(path):
    with path.open("rb") as file:
        def integer():
            return struct.unpack("<i", file.read(4))[0]
        if integer() != 0x314C4349:
            raise ValueError("Expected Unity ICL1 capture")
        sizes = []
        for _ in range(3):
            sizes.append(integer())
            file.seek(4 * integer(), 1)
        frames = integer()
        offset = file.tell()
    poses = np.memmap(path, dtype="<f4", mode="r", offset=offset)
    if sizes != [23922, 23922, 6718] or frames != 32 or len(poses) != frames * sum(sizes) * 3:
        raise ValueError("Unexpected original capture shape")
    return offset, poses.reshape(frames, sum(sizes), 3)


def original_skirt(path):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise ValueError("Expected original mesh")
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    node, = [n for n in doc["nodes"] if n.get("name") == "Spring_06_skirt" and "mesh" in n]
    primitive, = doc["meshes"][node["mesh"]]["primitives"]
    def read(key, width, dtype):
        accessor = doc["accessors"][key]
        view = doc["bufferViews"][accessor["bufferView"]]
        return np.ndarray((accessor["count"], width), dtype, data, 28 + length + view.get("byteOffset", 0) +
                          accessor.get("byteOffset", 0), (view.get("byteStride", np.dtype(dtype).itemsize * width),
                                                           np.dtype(dtype).itemsize))
    dtype = {5123: "<u2", 5125: "<u4"}[doc["accessors"][primitive["indices"]]["componentType"]]
    return read(primitive["attributes"]["POSITION"], 3, "<f4"), read(primitive["indices"], 1, dtype).reshape(-1, 3)


def smooth(value):
    t = np.clip(value, 0, 1)
    return t * t * (3 - 2 * t)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("vrm", "baseline", "four", "eight", "witnesses", "directory"):
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    original, triangles = original_skirt(args.vrm)
    base_hash = sha(args.baseline)
    refs = json.loads(args.witnesses.read_text())
    if refs["sourceSha256"] != SOURCE_SHA or refs["posesSha256"] != base_hash:
        raise ValueError("Contact witnesses do not describe this baseline")
    offset, baseline = sections(args.baseline)
    four_offset, four = sections(args.four)
    eight_offset, eight = sections(args.eight)
    if (offset != four_offset or offset != eight_offset or
            not np.array_equal(four[:, :-6718], eight[:, :-6718])):
        raise ValueError("The measured 4-to-8-degree increment changed the actor body or topology")
    with args.baseline.open("rb") as file, args.four.open("rb") as lower, args.eight.open("rb") as higher:
        header = file.read(offset)
        if header != lower.read(offset) or header != higher.read(offset):
            raise ValueError("Take headers differ")
    affected = np.unique(triangles[[entry["skirtTriangle"] for entry in refs["witnesses"]]])
    if len(affected) == 0:
        raise ValueError("No visible collision witnesses")
    # Work in rest-space metres so seam duplicates on layered cloth receive the
    # same falloff. Neither the source texture, UVs nor original VRM is edited.
    minima = np.full(len(original), np.inf)
    for batch in np.array_split(affected, max(1, len(affected) // 64)):
        minima = np.minimum(minima, np.linalg.norm(original[:, None, :] - original[batch][None, :, :], axis=-1).min(axis=1))
    mask = smooth((.05 - minima) / .03)
    base_skirt = baseline[:, -6718:]
    # All authored trial clips share exactly the same body pose. Re-saving their
    # source animation slightly changed some joint interpolation versus the original.
    # Only transfer the isolated garment increment between matched trials, while
    # keeping every original Body vertex and original baseline sample unchanged.
    delta = 2 * np.array(eight[:, -6718:] - four[:, -6718:])
    # Protect exposed perimeter vertices in every pose. Use the complete body as
    # an occluder and symmetrically shield inward and outward silhouette shifts.
    views = np.arange(16) * np.pi / 8
    axes = np.stack([np.cos(views), np.sin(views)])
    minimum_margin = np.full(len(original), np.inf)
    for frame, cloth in zip(baseline, base_skirt):
        geometry = frame[23922:]
        slices = np.floor(geometry[:, 1] / .02).astype(int)
        projections = geometry[:, [0, 2]] @ axes
        bounds = np.full((slices.max() - slices.min() + 1, len(views)), -np.inf)
        np.maximum.at(bounds, slices - slices.min(), projections)
        margin = (bounds[(slices - slices.min())[-6718:]] - projections[-6718:]).min(axis=1)
        minimum_margin = np.minimum(minimum_margin, margin)
    mask *= smooth((minimum_margin - .003) / .012)
    peak = np.linalg.norm(delta, axis=2).max(axis=0)
    cap = .012
    mask *= np.minimum(1., cap / np.maximum(peak, 1e-12))
    # Seams with identical rest positions share the most conservative mask.
    _, welded = np.unique(original.round(5), axis=0, return_inverse=True)
    bound = np.full(welded.max() + 1, 1.)
    np.minimum.at(bound, welded, mask)
    mask = bound[welded]
    selected = np.flatnonzero(mask > 1e-5)
    if not len(selected):
        raise ValueError("No local vertices available inside the protected outline")
    args.directory.mkdir(parents=True, exist_ok=False)
    cache = args.directory / "localized-skirt.bin"
    with cache.open("xb") as out:
        out.write(header)
        for frame, displacement in zip(baseline, delta):
            frame[:-6718].tofile(out)
            (frame[-6718:] + mask[:, None] * displacement).astype("<f4").tofile(out)
    (args.directory / "localized-skirt.json").write_text(json.dumps({
        "sourceSha256": SOURCE_SHA, "baselineSha256": base_hash, "fourDegreeSha256": sha(args.four),
        "eightDegreeSha256": sha(args.eight), "incrementScale": 2,
        "referenceBodyPoseMaxDeltaMeters": float(np.linalg.norm(baseline[:, 23922:-6718] - four[:, 23922:-6718], axis=2).max()),
        "cacheSha256": sha(cache), "originalSkirtVertexCount": len(original),
        "sourceWitnessVertices": len(affected), "affectedSkirtVertices": len(selected),
        "maximumDisplacementMeters": float(np.max(peak * mask)), "vertices": selected.tolist(),
        "blend": mask[selected].tolist(),
        "scope": "Localized measured panel increment applied to the unmodified baseline; no rig or release acceptance."
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
