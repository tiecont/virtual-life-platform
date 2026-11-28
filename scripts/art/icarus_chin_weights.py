"""Build a private lower-jaw weight correction for the pinned Charakuru Icarus."""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

SOURCE_SHA = "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a"


def ramp(value, low, high):
    t = min(1., max(0., (value - low) / (high - low)))
    return t * t * (3. - 2. * t)


def build(source, output):
    data = bytearray(source.read_bytes())
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise ValueError("Expected the owner-designated source VRM")
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    obj, = [n for n in doc["nodes"] if n.get("name") == "Head" and "mesh" in n]
    primitive, = doc["meshes"][obj["mesh"]]["primitives"]
    names = [doc["nodes"][idx]["name"] for idx in doc["skins"][obj["skin"]]["joints"]]
    neck, skull = names.index("neck"), names.index("head")

    def stream(name, kind, layout):
        accessor = doc["accessors"][primitive["attributes"][name]]
        view = doc["bufferViews"][accessor["bufferView"]]
        if accessor["componentType"] != kind or "sparse" in accessor:
            raise ValueError("Unexpected pinned accessor layout")
        fmt = struct.Struct(layout)
        start = 28 + length + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride", fmt.size)
        return [(start + stride * i, fmt.unpack_from(data, start + stride * i))
                for i in range(accessor["count"])]

    joint_type = doc["accessors"][primitive["attributes"]["JOINTS_0"]]["componentType"]
    joints = stream("JOINTS_0", joint_type, {5121: "<4B", 5123: "<4H"}[joint_type])
    positions = stream("POSITION", 5126, "<3f")
    weights = stream("WEIGHTS_0", 5126, "<4f")
    changed = 0
    maximum_transfer = 0.
    bounds = [[math.inf] * 3, [-math.inf] * 3]
    for (_, (x, y, z)), (_, ids), (offset, row) in zip(positions, joints, weights, strict=True):
        # In this source's metre coordinates, the anterior chin projects to
        # z=.155 at y=1.419. The throat terminates near z=.108 at y=1.410.
        # Fade into the underside and the jaw corners. Keep all throat weights.
        influence = ramp(z, .112, .148) * ramp(y, 1.409, 1.418)
        if not influence or neck not in ids:
            continue
        values = list(row)
        ni = ids.index(neck)
        transfer = values[ni] * influence
        if transfer < 1e-6:
            continue
        if skull not in ids:
            raise ValueError("Pinned jaw vertex is missing the existing skull influence")
        hi = ids.index(skull)
        values[ni] -= transfer
        values[hi] += transfer
        if abs(sum(values) - 1.) > .0001:
            raise ValueError("Invalid normalized weights")
        struct.pack_into("<4f", data, offset, *values)
        changed += 1
        maximum_transfer = max(maximum_transfer, transfer)
        for i, coord in enumerate((x, y, z)):
            bounds[0][i] = min(bounds[0][i], coord)
            bounds[1][i] = max(bounds[1][i], coord)
    if not changed:
        raise ValueError("No jaw weights updated")
    output.mkdir(parents=True, exist_ok=False)
    (output / "Icarus-ChinReview.vrm").write_bytes(data)
    (output / "chin-weights.json").write_text(json.dumps({
        "sourceSha256": SOURCE_SHA, "candidateSha256": hashlib.sha256(data).hexdigest(),
        "changedHeadVertices": changed, "maximumNeckWeightMovedToHead": maximum_transfer,
        "affectedBoundsMeters": bounds, "scope": "Private Icarus lower jaw skin-weight candidate",
    }, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.source, args.output)
