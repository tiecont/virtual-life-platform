"""Reimport and measure a private Pet wingbeat across its entire loop in Blender."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import struct
import sys

import bpy
import numpy as np
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_pose_reviewed_pet_wings import SOURCES
from blender_normalize_r2_batch import sha256_file


def load(path):
    # Blender may create an Icosphere as the armature display widget. Bind the
    # inventory to actual mesh nodes serialized in the GLB, before importing.
    with path.open('rb') as f:
        magic, version, length, size, kind = struct.unpack('<4s4I', f.read(20))
        if (magic, version, length, kind) != (b'glTF', 2, path.stat().st_size, 0x4E4F534A):
            raise ValueError("Expected a GLB 2 container")
        data = json.loads(f.read(size))
    names = [node['name'] for node in data['nodes'] if 'mesh' in node]
    if len(set(names)) != len(names) or any(not n.startswith('tripo_part_') for n in names):
        raise ValueError("Unexpected mesh nodes in the actual GLB")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return {name: bpy.data.objects[name] for name in sorted(names)}, data


def positions(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    points = np.empty(len(evaluated.data.vertices) * 3, dtype=np.float32)
    evaluated.data.vertices.foreach_get('co', points)
    world = np.asarray(evaluated.matrix_world)
    return points.reshape(-1, 3) @ world[:3, :3].T + world[:3, 3]


def faces(obj, points):
    # Compare directed textured triangles in rest space. Reindexing vertices
    # or rotating a triangle's first corner is harmless; a flipped face is not.
    mesh = obj.data
    uv = mesh.uv_layers.active.data
    result = []
    for poly in mesh.polygons:
        if poly.loop_total != 3:
            raise ValueError("Expected triangulated source")
        result.append([[*points[mesh.loops[i].vertex_index], *uv[i].uv] for i in poly.loop_indices])
    return np.asarray(result)


def compare_rest(name, original, decoded):
    if original.shape != decoded.shape:
        raise ValueError(f"{name}: source and exported triangle counts differ")
    centers = original[:, :, :3].mean(axis=1)
    index = KDTree(len(original))
    for i, center in enumerate(centers):
        index.insert(center, i)
    index.balance()
    unused = set(range(len(original)))
    worst_position, worst_uv = 0., 0.
    for triangle in decoded:
        center = triangle[:, :3].mean(axis=0)
        nearby = [i for _, i, _ in index.find_range(center, .000003) if i in unused]
        if not nearby:
            raise ValueError(f"{name}: no matching directed triangle near {center}")
        # Check all cyclic rotations, keeping winding and UVs tied to each
        # corner. A fixed decimal-rounding grid can split two nearly equal
        # coordinates that happen to lie on opposite sides of its midpoint.
        results = []
        for i in nearby:
            for shift in range(3):
                errors = original[i] - np.roll(triangle, shift, axis=0)
                position = float(np.linalg.norm(errors[:, :3], axis=1).max())
                uv = float(np.linalg.norm(errors[:, 3:], axis=1).max())
                results.append((max(position, uv), position, uv, i))
        distance, position, uv, match = min(results)
        if distance > .000003:
            raise ValueError(f"{name}: directed rest triangle differs (position {position:g}, UV {uv:g})")
        unused.remove(match)
        worst_position, worst_uv = max(worst_position, position), max(worst_uv, uv)
    return worst_position, worst_uv


def verify(asset, source, target):
    digest, wing_ids, _ = SOURCES[asset]
    if sha256_file(source) != digest:
        raise ValueError("Unexpected original UV master")
    model, _ = load(source)
    original = {name: faces(obj, positions(obj)) for name, obj in model.items()}
    model, doc = load(target)
    if original.keys() != model.keys() or len(doc.get('animations', [])) != 1 or not doc.get('skins'):
        raise ValueError("Invalid output inventory or animation")
    scene = bpy.context.scene
    scene.frame_set(1)
    neutral = {name: positions(obj) for name, obj in model.items()}
    rest_errors = [compare_rest(name, original[name], faces(obj, neutral[name])) for name, obj in model.items()]
    groups = defaultdict(list)
    offset = 0
    for points in neutral.values():
        for i, point in enumerate(points):
            groups[tuple(np.round(point, 6))].append(offset+i)
        offset += len(points)
    pairs = np.asarray([(group[0], i) for group in groups.values() for i in group[1:]])
    moving = {f'tripo_part_{i}' for i in wing_ids}
    gaps, body, rest = 0., 0., 0.
    peaks = {name: 0. for name in moving}
    for frame in range(1, 50):
        scene.frame_set(frame)
        all_points = []
        for name, obj in model.items():
            points = positions(obj)
            delta = float(np.linalg.norm(points - neutral[name], axis=1).max())
            if frame in (25, 49):
                rest = max(rest, delta)
            if name in moving:
                peaks[name] = max(peaks[name], delta)
            else:
                body = max(body, delta)
            all_points.append(points)
        joined = np.concatenate(all_points)
        gaps = max(gaps, float(np.linalg.norm(joined[pairs[:, 0]] - joined[pairs[:, 1]], axis=1).max()))
    if max(gaps, rest, body) > .00001 or max(peaks.values()) < .05:
        raise ValueError(f"Private wing animation failed: seam={gaps}, return={rest}, body={body}, peak={max(peaks.values())}")
    return {"identity": asset, "sourceSha256": digest, "outputSha256": sha256_file(target),
            "meshParts": len(model), "texturedRestTriangles": sum(map(len, original.values())),
            "maxRestPositionError": max(e[0] for e in rest_errors),
            "maxRestUvError": max(e[1] for e in rest_errors), "framesMeasured": 49, "maxCoincidentVertexGap": gaps, "maxReturnDelta": rest,
            "maxStaticBodyDelta": body, "wingPeakDisplacement": peaks, "scope": "private two-wing loop"}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset', choices=SOURCES)
    for key in ('source', 'target', 'receipt'):
        parser.add_argument(key, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    result = verify(args.asset, args.source, args.target)
    with args.receipt.open('x') as out:
        json.dump(result, out, indent=2)
        out.write('\n')
