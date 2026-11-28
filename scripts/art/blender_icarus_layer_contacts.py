"""Count actual triangle crossings on posed Unity surfaces for the Icarus walk."""
import argparse
import json
import struct
import sys
from pathlib import Path

import numpy as np
from mathutils.bvhtree import BVHTree


def inspect(path):
    with path.open("rb") as source:
        def integer():
            return struct.unpack("<i", source.read(4))[0]

        if integer() != 0x314C4349:
            raise ValueError("Expected posed Icarus surfaces")
        surfaces = []
        for name in ["arms", "legs", "garment"]:
            count, indices = integer(), integer()
            faces = np.fromfile(source, "<i4", indices).reshape(-1, 3)
            if not (0 < count <= 100000 and indices > 0 and faces.min() >= 0 and faces.max() < count):
                raise ValueError(f"Invalid {name} topology")
            surfaces.append((name, count, faces))
        samples = []
        for frame in range(integer()):
            trees = {}
            for name, count, faces in surfaces:
                verts = np.fromfile(source, "<f4", count * 3).reshape(count, 3)
                trees[name] = BVHTree.FromPolygons(verts.tolist(), faces.tolist(), all_triangles=True)
            samples.append({"frame": frame, **{name: len(trees[name].overlap(trees["garment"])) for name in ("arms", "legs")}})
        if source.read(1):
            raise ValueError("Unexpected trailing bytes")
        return {"scope": "Triangle pairs intersecting the skirt-weighted garment, excluding mixed-weight seams.",
                "faces": {name: len(faces) for name, _, faces in surfaces}, "samples": samples,
                "worstFrameCounts": {name: max(s[name] for s in samples) for name in ("arms", "legs")}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.output.write_text(json.dumps(inspect(args.source), indent=2) + "\n")
