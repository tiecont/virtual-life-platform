"""Measure the change in the exterior outline of two real Unity garment takes.

Compare support lines of the complete Body and skirt at horizontal slices from
ankle to waist. This measures the outside contour; holes and overlapping layers
are evaluated separately by blender_icarus_skirt_regions.py.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

from icarus_chin_weights import SOURCE_SHA


def source_edges(path):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise ValueError("Expected designated Icarus body")
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    result = []
    for name in ("Body", "Spring_06_skirt"):
        node, = [node for node in doc["nodes"] if node.get("name") == name and "mesh" in node]
        faces, start = [], 0
        for p in doc["meshes"][node["mesh"]]["primitives"]:
            attr = doc["accessors"][p["indices"]]
            view = doc["bufferViews"][attr["bufferView"]]
            dtype = {5123: "<u2", 5125: "<u4"}[attr["componentType"]]
            values = np.frombuffer(data, dtype, attr["count"], 28 + length + view.get("byteOffset", 0) + attr.get("byteOffset", 0))
            faces.append(values.astype(int).reshape(-1, 3) + start)
            start += doc["accessors"][p["attributes"]["POSITION"]]["count"]
        triangles = np.concatenate(faces)
        edges = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
        result.append((start, np.unique(np.sort(edges, axis=1), axis=0)))
    return result


def contours(path, geometry):
    # Opposed support directions give both edges of each of eight orthographic views.
    angles = np.arange(16) * np.pi / 8
    directions = np.stack([np.cos(angles), np.sin(angles)])
    with path.open("rb") as source:
        def number():
            return struct.unpack("<i", source.read(4))[0]
        if number() != 0x314C4349:
            raise ValueError("Expected ICL1 capture")
        counts = []
        for _ in range(3):
            counts.append(number())
            indices = number()
            if not 0 < indices < 1000000:
                raise ValueError("Invalid index count")
            source.seek(indices * 4, 1)
        if counts != [geometry[0][0], geometry[0][0], geometry[1][0]]:
            raise ValueError("Source topology mismatch")
        frames = number()
        if not 16 <= frames <= 120:
            raise ValueError("Expected dense walk sample")
        result = []
        heights = np.arange(.28, 1.101, .02)
        for _ in range(frames):
            original, body, skirt = [np.fromfile(source, "<f4", n * 3).reshape(n, 3) for n in counts]
            if not np.array_equal(original, body):
                raise ValueError("Mismatched body poses")
            edges = np.concatenate([verts[indices] for (_, indices), verts in zip(geometry, (body, skirt))])
            lower = np.minimum(edges[:, 0, 1], edges[:, 1, 1])
            upper = np.maximum(edges[:, 0, 1], edges[:, 1, 1])
            sections = []
            for height in heights:
                cut = edges[(lower <= height) & (upper > height)]
                a, b = cut[:, 0], cut[:, 1]
                ratio = (height - a[:, 1]) / (b[:, 1] - a[:, 1])
                crossing = a + (b - a) * ratio[:, None]
                sections.append(np.max(crossing[:, [0, 2]] @ directions, axis=0))
            result.append(sections)
        if source.read(1):
            raise ValueError("Unexpected trailing bytes")
        return np.array(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vrm", type=Path)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("candidates", nargs="+", type=Path)
    args = parser.parse_args()
    geometry = source_edges(args.vrm)
    baseline = contours(args.baseline, geometry)
    report = {"source": SOURCE_SHA, "baselineSha256": hashlib.sha256(args.baseline.read_bytes()).hexdigest(),
              "method": "16 horizontal support directions at 2 cm height intervals, y=0.28..1.10 m, Body plus skirt",
              "frames": len(baseline), "candidates": []}
    for path in args.candidates:
        candidate = contours(path, geometry)
        if candidate.shape != baseline.shape:
            raise ValueError("Snapshot sample counts differ")
        change = np.abs(baseline - candidate) * 1000
        frame, section, angle = np.unravel_index(change.argmax(), change.shape)
        report["candidates"].append({"name": path.name, "posedSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                                     "outlineMedianMm": float(np.median(change)), "outlineP95Mm": float(np.percentile(change, 95)),
                                     "outlineMaxMm": float(change.max()), "worstFrame": int(frame),
                                     "worstHeightMeters": .28 + int(section) * .02, "worstViewDegrees": int(angle) * 22.5})
    with args.output.open("x") as output:
        json.dump(report, output, indent=2)
        output.write("\n")


if __name__ == "__main__":
    main()
