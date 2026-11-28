"""Read-only Blender 5.3 review of actual wing connectivity across provider UV seams."""

from argparse import ArgumentParser
from array import array
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy
import numpy as np


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def parse_glb(payload):
    magic, version, size, json_size, json_type = struct.unpack_from("<4sIIII", payload)
    if (magic, version, size, json_type) != (b"glTF", 2, len(payload), 0x4E4F534A):
        raise ValueError("Expected a complete GLB v2 source")
    document = json.loads(payload[20:20 + json_size])
    binary_size, binary_type = struct.unpack_from("<II", payload, 20 + json_size)
    if binary_type != 0x004E4942 or 28 + json_size + binary_size != size:
        raise ValueError("Expected one embedded binary GLB chunk")
    return document, memoryview(payload)[28 + json_size:]


def accessor(document, binary, index, width, expected_types):
    row = document["accessors"][index]
    view = document["bufferViews"][row["bufferView"]]
    kind = row["componentType"]
    types = {5123: np.dtype("<u2"), 5125: np.dtype("<u4"), 5126: np.dtype("<f4")}
    if view.get("buffer", 0) != 0 or kind not in expected_types or "sparse" in row:
        raise ValueError("Expected dense source values in the embedded GLB buffer")
    dtype = types[kind]
    offset = view.get("byteOffset", 0) + row.get("byteOffset", 0)
    stride = view.get("byteStride", width * dtype.itemsize)
    return np.ndarray((row["count"], width), dtype, binary, offset, (stride, dtype.itemsize))


def face_components(face_count, left, right):
    parents = array("I", range(face_count))
    ranks = bytearray(face_count)

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for i, j in zip(left.tolist(), right.tolist(), strict=True):
        i, j = root(i), root(j)
        if i == j:
            continue
        if ranks[i] < ranks[j]:
            i, j = j, i
        parents[j] = i
        if ranks[i] == ranks[j]:
            ranks[i] += 1

    return np.fromiter((root(index) for index in range(face_count)), dtype=np.int32, count=face_count)


def topology(triangles, positions, uv, identity):
    """Connect faces by shared edges, preserving the original pose and attributes."""
    face_count = len(triangles)
    source_edges = np.concatenate((triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]))
    keys = identity[source_edges]
    swap = keys[:, 0] > keys[:, 1]
    source_edges[swap] = source_edges[swap, ::-1]
    keys[swap] = keys[swap, ::-1]
    valid = keys[:, 0] != keys[:, 1]
    collapsed = int(np.count_nonzero(~valid))
    joined = keys[valid]
    radix = np.uint64(identity.max()) + np.uint64(1)
    ids = joined[:, 0].astype(np.uint64) * radix + joined[:, 1]
    faces = np.tile(np.arange(face_count, dtype=np.int32), 3)[valid]
    order = np.argsort(ids)
    ordered = ids[order]
    sorted_faces = faces[order]
    links = ordered[1:] == ordered[:-1]
    starts = np.concatenate(([0], np.flatnonzero(~links) + 1, [len(ordered)]))
    valences = np.diff(starts)
    labels = face_components(face_count, sorted_faces[:-1][links], sorted_faces[1:][links])
    counts = np.bincount(labels, minlength=face_count)
    roots = np.flatnonzero(counts)
    largest = roots[np.argsort(counts[roots])[::-1][:24]]
    large = []
    for key in largest:
        points = positions[triangles[labels == key]]
        low = points.min(axis=(0, 1))
        high = points.max(axis=(0, 1))
        large.append({"faces": int(counts[key]), "min": low.tolist(), "max": high.tolist()})

    matching_left, matching_right = order[:-1][links], order[1:][links]
    sorted_source = source_edges[valid]
    paired_left, paired_right = sorted_source[matching_left], sorted_source[matching_right]
    duplicate_edge_pairs = np.any(paired_left != paired_right, axis=1)
    seam_pairs = np.any(uv[paired_left] != uv[paired_right], axis=(1, 2))
    return {
        "components": int(len(roots)),
        "componentsWithAtLeast100Faces": int(np.count_nonzero(counts >= 100)),
        "componentsWithAtLeast1000Faces": int(np.count_nonzero(counts >= 1000)),
        "largestComponentShare": int(counts[largest[0]]) / face_count,
        "oneFaceEdges": int(np.count_nonzero(valences == 1)),
        "edgesWithMoreThanTwoFaces": int(np.count_nonzero(valences > 2)),
        "zeroLengthEdgeOccurrences": collapsed,
        "pairedEdgesWithDifferentSourceIndices": int(np.count_nonzero(duplicate_edge_pairs)),
        "pairedEdgesWithDifferentUvs": int(np.count_nonzero(seam_pairs)),
        "largestComponents": large,
    }


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--expected-sha256", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("Private mesh analysis requires Blender 5.3")
    source = args.source.resolve(strict=True)
    payload = source.read_bytes()
    hash_before = checksum(payload)
    if hash_before != args.expected_sha256:
        raise ValueError("The provider source no longer matches the input pin")
    document, binary = parse_glb(payload)
    (mesh,) = document["meshes"]
    (primitive,) = mesh["primitives"]
    if primitive.get("mode", 4) != 4:
        raise ValueError("Expected one authored triangular primitive")
    attributes = primitive["attributes"]
    positions = accessor(document, binary, attributes["POSITION"], 3, {5126})
    normals = accessor(document, binary, attributes["NORMAL"], 3, {5126})
    uv = accessor(document, binary, attributes["TEXCOORD_0"], 2, {5126})
    indices = accessor(document, binary, primitive["indices"], 1, {5123, 5125}).reshape(-1, 3)
    if (len(indices) == 0 or indices.max() >= len(positions) or
            len(positions) != len(uv) or len(positions) != len(normals) or
            not all(np.isfinite(values).all() for values in (positions, uv, normals))):
        raise ValueError("Invalid indexed geometry in the exact source")

    _, welded = np.unique(positions, axis=0, return_inverse=True)
    raw = topology(indices, positions, uv, np.arange(len(positions), dtype=np.int32))
    spatial = topology(indices, positions, uv, welded.reshape(-1))
    del welded
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.ops.import_scene.gltf(filepath=str(source)) != {"FINISHED"}:
        raise RuntimeError("Blender did not import the original provider export")
    imported = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        imported.append({
            "object": obj.name,
            "vertices": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "triangles": len(obj.data.loop_triangles),
            "uvLayers": [layer.name for layer in obj.data.uv_layers],
            "materials": [value.name for value in obj.data.materials if value],
        })
    if sum(part["triangles"] for part in imported) != len(indices):
        raise ValueError("Blender import did not preserve the indexed triangle count")
    textures = []
    for image in document.get("images", []):
        view = document["bufferViews"][image["bufferView"]]
        low = view.get("byteOffset", 0)
        data = binary[low:low + view["byteLength"]]
        textures.append({"name": image.get("name"), "bytes": len(data), "sha256": checksum(data)})
    if checksum(source.read_bytes()) != hash_before:
        raise RuntimeError("Provider GLB changed during the read-only review")

    report = {
        "classification": "PRIVATE_EXACT_SURFACE_TOPOLOGY",
        "source": source.name,
        "sourceSha256": hash_before,
        "blender": bpy.app.version_string,
        "triangles": len(indices),
        "sourceVertices": len(positions),
        "blenderImport": imported,
        "trianglePositionStreamSha256": checksum(positions[indices].tobytes()),
        "triangleUvStreamSha256": checksum(uv[indices].tobytes()),
        "normalStreamSha256": checksum(normals.tobytes()),
        "sourceMaterial": document["materials"][primitive["material"]],
        "embeddedTextures": textures,
        "indexedTopology": raw,
        "exactPositionWeldTopology": spatial,
        "method": "Read-only shared-edge connectivity. The position weld merges exact XYZ only for analysis.",
    }
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
