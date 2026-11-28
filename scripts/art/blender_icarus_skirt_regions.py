"""Separate true thigh-surface crossings from costume-to-costume intersections.

Run with Blender in background on ICL1 output from IcarusLayerSurfaceExport.
The source GLB attributes and connected components are pinned to one intake.
Cardinal occlusion is measured against the entire posed Body and Spring_06_skirt
meshes. It does not include hair, attachments, lighting or texture transparency.
"""
import argparse
import hashlib
import json
import struct
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from mathutils import Vector
from mathutils.geometry import intersect_ray_tri
from mathutils.bvhtree import BVHTree

SOURCE = "f1d2b65daca064e5e04af5c12235b5ea2bc6cb6a246399ec621723c575e0286a"
# Exact welded component sizes from this VRM's original lower-body primitive.
REGIONS = {4511: "waist-costume", 2479: "left-boot", 2344: "right-boot",
           1599: "pelvis-and-thighs", 685: "thigh-band", 399: "front-ornament",
           132: "detached-trim", 3: "isolated-face"}


def source_geometry(path):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE:
        raise ValueError("Expected the designated Icarus intake")
    size = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + size])

    def attribute(key):
        accessor = doc["accessors"][key]
        view = doc["bufferViews"][accessor["bufferView"]]
        dtype = {5123: "<u2", 5125: "<u4", 5126: "<f4"}[accessor["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[accessor["type"]]
        start = size + 28 + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return np.ndarray((accessor["count"], width), dtype, data, start,
                          strides=(view.get("byteStride", width * np.dtype(dtype).itemsize), np.dtype(dtype).itemsize))

    def primitives(name):
        node, = [n for n in doc["nodes"] if n.get("name") == name and "mesh" in n]
        return doc["meshes"][node["mesh"]]["primitives"]

    lower, upper = primitives("Body")
    skirt, = primitives("Spring_06_skirt")
    points = attribute(lower["attributes"]["POSITION"])
    faces = attribute(lower["indices"]).reshape(-1, 3)
    _, welded = np.unique(np.round(points, 5), axis=0, return_inverse=True)
    parents = list(range(int(welded.max()) + 1))

    def root(index):
        while index != parents[index]:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for a, b, c in welded[faces]:
        parents[root(b)] = root(a)
        parents[root(c)] = root(a)
    roots = [root(index) for index in welded]
    counts = Counter(roots)
    if sorted(counts.values()) != [3, 3, 132, 132, 132, 399, 685, 1599, 2344, 2479, 4511]:
        raise ValueError("Original lower-body component topology changed")
    regions = [REGIONS[counts[index]] for index in roots]
    body = np.concatenate([faces, attribute(upper["indices"]).reshape(-1, 3).astype(int) + len(points)])
    regions.extend(["upper-body"] * len(attribute(upper["attributes"]["POSITION"])))
    return body, attribute(skirt["indices"]).reshape(-1, 3), np.array(regions), attribute(lower["attributes"]["TEXCOORD_0"])


def topology_key(faces):
    return {tuple(sorted(map(int, tri))) for tri in faces}


def crossing(first, second):
    # Möller–Trumbore against finite segments in each direction. Ignore coplanar
    # touches for optical sampling, keep them in the geometric pair count.
    hits = []
    for edges, target in ((first, second), (second, first)):
        for index in range(3):
            start, end = edges[index], edges[(index + 1) % 3]
            segment = end - start
            if segment.length_squared == 0:
                continue
            hit = intersect_ray_tri(*target, segment.normalized(), start, True)
            if hit is not None and (hit - start).dot(segment) >= -1e-10 and (hit - start).length <= segment.length + 1e-6:
                hits.append(hit)
    return sum(hits, Vector()) / len(hits) if hits else None


def inspect(source, posed):
    body_faces, skirt_faces, regions, uv = source_geometry(source)
    body_set, skirt_set = topology_key(body_faces), topology_key(skirt_faces)
    actual_thigh = body_faces[np.all(regions[body_faces] == "pelvis-and-thighs", axis=1)]
    directions = {"+z": Vector((0, 0, 1)), "-z": Vector((0, 0, -1)),
                  "+x": Vector((1, 0, 0)), "-x": Vector((-1, 0, 0))}
    with posed.open("rb") as file:
        def integer():
            return struct.unpack("<i", file.read(4))[0]

        if integer() != 0x314C4349:
            raise ValueError("Expected Unity ICL1 capture")
        surfaces = []
        for expected in (body_set, body_set, skirt_set):
            count, indices = integer(), integer()
            if not (0 < count < 100000 and 0 < indices < 1000000 and indices % 3 == 0):
                raise ValueError("Invalid captured topology size")
            tris = np.fromfile(file, "<i4", indices).reshape(-1, 3)
            if not topology_key(tris).issubset(expected):
                raise ValueError("Unity indices do not match the source primitive")
            surfaces.append((count, tris))
        frames = integer()
        if not 16 <= frames <= 120:
            raise ValueError("Expected dense walk samples")
        _, weighted_legs = surfaces[1]
        _, weighted_skirt = surfaces[2]
        results, witnesses = [], []
        for frame in range(frames):
            arms, body, skirt = [np.fromfile(file, "<f4", n * 3).reshape(n, 3) for n, _ in surfaces]
            if not np.array_equal(arms, body):
                raise ValueError("Mismatched posed Body")
            b, s = [list(map(Vector, vertices)) for vertices in (body, skirt)]
            def tree(vertices, faces):
                return BVHTree.FromPolygons(vertices, faces.tolist(), all_triangles=True)
            full_body, full_skirt = tree(b, body_faces), tree(s, skirt_faces)
            broad = tree(b, weighted_legs).overlap(tree(s, weighted_skirt))
            broad_regions = Counter(regions[weighted_legs[i, 0]] for i, _ in broad)
            exact = tree(b, actual_thigh).overlap(full_skirt)
            visible, valid = Counter(), 0
            for i, j in exact:
                tri = actual_thigh[i]
                first = [b[index] for index in tri]
                point = crossing(first, [s[index] for index in skirt_faces[j]])
                if point is None:
                    continue
                valid += 1
                seen = []
                for key, direction in directions.items():
                    origin = point + direction * .0001
                    if all(t.ray_cast(origin, direction, 5)[0] is None for t in (full_body, full_skirt)):
                        visible[key] += 1
                        seen.append(key)
                if seen:
                    # Source texture coordinates at the actual intersection point.
                    matrix = np.array([np.array(first[1]) - first[0], np.array(first[2]) - first[0]]).T
                    weights = np.linalg.lstsq(matrix, np.array(point) - first[0], rcond=None)[0]
                    sample = uv[tri[0]] + weights[0] * (uv[tri[1]] - uv[tri[0]]) + weights[1] * (uv[tri[2]] - uv[tri[0]])
                    witnesses.append({"frame": frame, "bodyTriangle": int(i), "skirtTriangle": int(j),
                                      "gltfUv": sample.tolist(), "views": seen})
            results.append({"frame": frame, "weightedPairsByBodyRegion": dict(broad_regions),
                            "fullThighSkirtPairs": len(exact), "intersectionWitnesses": valid,
                            "unoccludedDirections": dict(visible)})
        if file.read(1):
            raise ValueError("Trailing capture data")
    return {"sourceSha256": SOURCE, "posesSha256": hashlib.sha256(posed.read_bytes()).hexdigest(),
            "scope": "Actual welded pelvis/thigh component against all original skirt faces. Cardinal sightlines use posed Body and skirt only.",
            "thighTriangles": len(actual_thigh), "skirtTriangles": len(skirt_faces),
            "worstFullThighSkirtPairs": max(r["fullThighSkirtPairs"] for r in results),
            "totalFullThighSkirtPairs": sum(r["fullThighSkirtPairs"] for r in results),
            "unoccludedWitnesses": len(witnesses), "samples": results, "witnesses": witnesses}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "poses", "out"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    result = inspect(args.source, args.poses)
    with args.out.open("x") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
