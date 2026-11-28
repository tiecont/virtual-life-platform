"""Prepare an owner-approved Tripo silhouette for private topology and UV review.

Run in Blender 5.3 background mode with --asset-id, --source and --output.
The exact source must match the campaign's recorded owner approval. The tool
keeps source axes, pivot and dimensions until an authorized game scale exists.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import zlib
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_normalize_r2_batch import BatchError, export_glb, repo_root, sha256_file


VIEWS = {
    "front": (0, -1, .07),
    "three-quarter": (1, -2, .7),
    "side": (1, 0, .07),
    "rear": (0, 1, .15),
    "top": (0, -.001, 1),
}


def inspect(mesh):
    mesh.calc_loop_triangles()
    with_bmesh = bmesh.new()
    try:
        with_bmesh.from_mesh(mesh)
        return {
            "vertices": len(mesh.vertices),
            "triangles": len(mesh.loop_triangles),
            "boundaryEdges": sum(edge.is_boundary for edge in with_bmesh.edges),
            "internalNonManifoldEdges": sum(not edge.is_manifold and not edge.is_boundary for edge in with_bmesh.edges),
            "degenerateTriangles": sum(triangle.area <= 1e-10 for triangle in mesh.loop_triangles),
            "uvLayers": len(mesh.uv_layers),
            "materialSlots": sum(material is not None for material in mesh.materials),
        }
    finally:
        with_bmesh.free()


def load_asset(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.ops.import_scene.gltf(filepath=str(path)) != {"FINISHED"}:
        raise BatchError(f"Blender could not import {path.name}")
    objects = list(bpy.context.scene.objects)
    if len(objects) != 1 or objects[0].type != "MESH" or objects[0].modifiers:
        raise BatchError("This review requires one static provider mesh without modifiers")
    return objects[0]


def triangles(obj, uv=False):
    mesh = obj.data
    mesh.calc_loop_triangles()
    if uv:
        layer = mesh.uv_layers.active
        if layer is None:
            raise BatchError("Missing exported UV coordinates")
        return np.asarray([[layer.data[index].uv[:] for index in tri.loops] for tri in mesh.loop_triangles])
    return np.asarray([[tuple(obj.matrix_world @ mesh.vertices[index].co) for index in tri.vertices]
                       for tri in mesh.loop_triangles])


def guarded_weld(mesh, epsilon):
    # Only consider duplicate boundary edges with opposed winding and locally
    # matching normals. An unpaired boundary or junction is intentionally left
    # visible for later review. This never caps holes or deletes surface faces.
    cage = bmesh.new()
    try:
        cage.from_mesh(mesh)
        cage.normal_update()
        cage.verts.index_update()

        def key(vert):
            return tuple(round(coordinate / epsilon) for coordinate in vert.co)

        grouped = defaultdict(list)
        for edge in cage.edges:
            if edge.is_boundary:
                loop = edge.link_loops[0]
                a, b = loop.vert, loop.link_loop_next.vert
                grouped[tuple(sorted((key(a), key(b))))].append((a, b, loop.face.normal.copy()))

        pairs = defaultdict(set)
        matched = 0
        for edges in grouped.values():
            if len(edges) != 2:
                continue
            (a, b, normal), (c, d, other_normal) = edges
            if (a.co - d.co).length > epsilon or (b.co - c.co).length > epsilon or normal.dot(other_normal) < .995:
                continue
            matched += 1
            for left, right in ((a, d), (b, c)):
                if left != right:
                    pairs[left].add(right)
                    pairs[right].add(left)

        remap = {}
        for vertex, partners in pairs.items():
            if len(partners) == 1:
                partner = next(iter(partners))
                if len(pairs[partner]) == 1 and vertex.index > partner.index:
                    remap[vertex] = partner
        if remap:
            bmesh.ops.weld_verts(cage, targetmap=remap)
            cage.to_mesh(mesh)
            mesh.update()
        return {"epsilon": epsilon, "matchedBoundaryEdgePairs": matched, "weldedVertices": len(remap)}
    finally:
        cage.free()


def unwrap(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        outcome = bpy.ops.uv.smart_project(angle_limit=math.radians(48), island_margin=.0018)
        if outcome != {"FINISHED"}:
            raise BatchError("Blender Smart UV Project did not finish")
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")


def uv_intersections(coords):
    """Find triangle interiors that overlap above normalized UV tolerance."""
    epsilon = 2e-8
    side = 48
    bins = defaultdict(list)
    low, high = coords.min(axis=1), coords.max(axis=1)
    steps = np.roll(coords, -1, axis=1) - coords
    normals = np.stack((-steps[:,:,1], steps[:,:,0]), axis=-1)
    lengths = np.linalg.norm(normals, axis=-1, keepdims=True)
    normals /= np.maximum(lengths, epsilon)
    offenders = set()
    pairs = 0
    for index, triangle in enumerate(coords):
        (x0,y0), (x1,y1) = np.floor(np.clip([low[index], high[index]], 0, 1) * side).astype(int)
        cells = [(x,y) for y in range(y0,y1+1) for x in range(x0,x1+1)]
        neighbors = {candidate for cell in cells for candidate in bins[cell]}
        if neighbors:
            others = np.fromiter(neighbors, dtype=np.int32)
            aabb = np.minimum(high[index], high[others]) - np.maximum(low[index], low[others])
            others = others[(aabb > epsilon).all(axis=1)]
            if others.size:
                axes = np.concatenate((np.broadcast_to(normals[index],(others.size,3,2)), normals[others]), axis=1)
                left = np.einsum('ud,ndk->nuk', triangle, axes.transpose(0,2,1))
                right = np.einsum('nud,ndk->nuk',coords[others],axes.transpose(0,2,1))
                depth = np.minimum(left.max(axis=1),right.max(axis=1))-np.maximum(left.min(axis=1),right.min(axis=1))
                intersections = others[(depth > epsilon).all(axis=1)]
                if intersections.size:
                    offenders.add(index)
                    offenders.update(intersections.tolist())
                    pairs += int(intersections.size)
        for cell in cells:
            bins[cell].append(index)
    return offenders, pairs


def separate_overlapping_uv_faces(obj):
    mesh = obj.data
    source = triangles(obj, uv=True)
    offenders, pairs = uv_intersections(source)
    if not offenders:
        return {"movedFaces": 0, "overlapPairsBeforeRepair": 0, "rejectedLargeRepair": False}
    if len(offenders) > .15*len(source) or any(polygon.loop_total != 3 for polygon in mesh.polygons):
        return {"movedFaces": 0, "overlapPairsBeforeRepair": pairs, "rejectedLargeRepair": True}

    layer = mesh.uv_layers.active.data
    reserved = .18
    for entry in layer:
        entry.uv.y *= 1 - reserved
    columns = math.ceil(math.sqrt(len(offenders)/reserved))
    rows = math.ceil(len(offenders)/columns)
    cell = np.array((1/columns, reserved/rows))
    for slot, index in enumerate(sorted(offenders)):
        coords = source[index]
        minimum, maximum = coords.min(axis=0), coords.max(axis=0)
        span = np.maximum(maximum-minimum, 1e-8)
        scale = min((cell*.88)/span)
        center = np.array(((slot % columns + .5)*cell[0], 1-reserved+(slot//columns + .5)*cell[1]))
        for loop, point in zip(mesh.loop_triangles[index].loops, coords):
            layer[loop].uv = tuple(center + (point-(minimum+maximum)/2)*scale)
    mesh.update()
    return {"movedFaces": len(offenders), "overlapPairsBeforeRepair": pairs, "rejectedLargeRepair": False}


def raster(projected, size, strict_inside=False):
    """Count triangle coverage on a fixed grid of pixel centers."""
    cover = np.zeros((size, size), dtype=np.uint16)
    tolerance = 1e-8 if strict_inside else -1e-8
    for tri in projected:
        a, b, c = tri
        v, w = b - a, c - a
        determinant = v[0] * w[1] - v[1] * w[0]
        if abs(determinant) <= 1e-10:
            continue
        (x0, y0), (x1, y1) = np.clip(
            [np.floor(np.min(tri, axis=0)), np.ceil(np.max(tri, axis=0)) + 1], 0, size,
        ).astype(int)
        y, x = np.ogrid[y0:y1, x0:x1]
        dx, dy = x + .5 - a[0], y + .5 - a[1]
        u = (dx*w[1] - dy*w[0]) / determinant
        v = (v[0]*dy - v[1]*dx) / determinant
        cover[y0:y1,x0:x1] += (u > tolerance) & (v > tolerance) & (u + v < 1 - tolerance)
    return cover


def uv_facts(obj):
    coords = triangles(obj, uv=True)
    delta = coords[:, 1:] - coords[:, :1]
    area_twice = delta[:,0,0]*delta[:,1,1] - delta[:,0,1]*delta[:,1,0]
    sample_size = 1536
    count = raster(coords * sample_size, sample_size, strict_inside=True)
    _, pairs = uv_intersections(coords)
    return {
        "method": "Blender Smart UV Project",
        "sampleGrid": sample_size,
        "coveragePercent": round(float(np.count_nonzero(count)) * 100 / count.size, 4),
        "overlappingSamplePixels": int(np.count_nonzero(count > 1)),
        "overlappingTrianglePairs": pairs,
        "degenerateUvTriangles": int(np.count_nonzero(np.abs(area_twice) < 1e-11)),
        "inUnitSquare": bool(np.isfinite(coords).all() and coords.min() >= -1e-6 and coords.max() <= 1 + 1e-6),
    }


def write_mask(path, image):
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
    height, width = image.shape
    lines = b"".join(b"\x00" + row.tobytes() for row in image)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(lines)) + chunk(b"IEND", b""))


def compare_views(before, after, output):
    points = before.reshape(-1, 3)
    low, high = points.min(axis=0), points.max(axis=0)
    center = (low + high) / 2
    span = np.linalg.norm(high - low) * 1.12
    size = 900

    def mask(world, right, up):
        centered = world - center
        view = np.stack((centered @ right, -(centered @ up)), axis=-1)
        return raster((view / span + .5) * size, size) > 0

    result = {}
    for view, direction in VIEWS.items():
        orientation = (-Vector(direction)).to_track_quat("-Z", "Y")
        right, up = (np.asarray(tuple(orientation @ axis)) for axis in (Vector((1,0,0)),Vector((0,1,0))))
        original, exported = mask(before, right, up), mask(after, right, up)
        union = np.count_nonzero(original | exported)
        changed = int(np.count_nonzero(original ^ exported))
        if union == 0:
            raise BatchError(f"Empty silhouette in {view}")
        result[view] = {"sampleGrid": size, "unionPixels": int(union), "changedPixels": changed,
                        "intersectionOverUnion": round(1 - changed / union, 8)}
        write_mask(output / f"{view}-source.png", original.astype(np.uint8)*255)
        write_mask(output / f"{view}-normalized.png", exported.astype(np.uint8)*255)
        write_mask(output / f"{view}-difference.png", (original ^ exported).astype(np.uint8)*255)
    return result, {"min": low.tolist(), "max": high.tolist(), "size": (high-low).tolist()}


def approval(asset_id, source):
    ledger = json.loads((repo_root() / "specs/pet-arena/campaign-v4-content.json").read_text())
    row = ledger.get("meshCandidates", {}).get(asset_id, {})
    if row.get("ownerSilhouetteReview") != "keep-for-mesh-processing" or row.get("glbSha256") != sha256_file(source):
        raise BatchError("The retained GLB does not match the exact approved silhouette")
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    if bpy.app.version[:2] != (5, 3):
        raise BatchError("Private normalization requires Blender 5.3")
    source = args.source.resolve(strict=True)
    output = args.output.resolve()
    if source.suffix.lower() != ".glb" or output.is_relative_to(repo_root()):
        raise BatchError("Use a retained GLB and a private output outside this checkout")
    accepted = approval(args.asset_id, source)
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    obj = load_asset(source)
    obj.name = args.asset_id
    mesh = obj.data
    before = triangles(obj)
    before_metrics = inspect(mesh)
    if before_metrics["triangles"] != accepted["triangles"] or before_metrics["degenerateTriangles"]:
        raise BatchError("Source topology differs from its retained review")
    pivot = np.asarray(tuple(obj.matrix_world.translation))
    if not np.allclose(pivot, (0,0,0), atol=1e-6) or abs(before[:,:,2].min()) > 1e-6:
        raise BatchError("The reviewed provider origin is not at its recorded floor plane")

    original = mesh.copy()
    epsilon = float(np.ptp(before.reshape(-1, 3), axis=0).max()) * 1e-7
    seam = guarded_weld(mesh, epsilon)
    welded = inspect(mesh)
    if (welded["triangles"] != before_metrics["triangles"] or welded["degenerateTriangles"] or
            welded["internalNonManifoldEdges"] > before_metrics["internalNonManifoldEdges"]):
        obj.data = original
        seam["reverted"] = True
        welded = before_metrics
    else:
        bpy.data.meshes.remove(original)
        seam["reverted"] = False

    unwrap(obj)
    repair = separate_overlapping_uv_faces(obj)
    candidate = output / (args.asset_id + ".glb")
    export_glb(candidate)
    reimported = load_asset(candidate)
    final_metrics = inspect(reimported.data)
    after = triangles(reimported)
    final_pivot = np.asarray(tuple(reimported.matrix_world.translation))
    if (final_metrics["triangles"] != before_metrics["triangles"] or
            final_metrics["materialSlots"] != before_metrics["materialSlots"] or
            final_metrics["degenerateTriangles"] or not np.allclose(final_pivot, pivot, atol=1e-6) or
            not np.allclose(before.min(axis=(0,1)), after.min(axis=(0,1)), atol=1e-6) or
            not np.allclose(before.max(axis=(0,1)), after.max(axis=(0,1)), atol=1e-6)):
        raise BatchError("Export changed the reviewed dimensions, geometry count, materials or pivot")

    views, bounds = compare_views(before, after, output)
    uv = uv_facts(reimported)
    exact_silhouette = all(view["changedPixels"] == 0 for view in views.values())
    uv_pass = uv["inUnitSquare"] and uv["overlappingSamplePixels"] == 0 and uv["overlappingTrianglePairs"] == 0 and uv["degenerateUvTriangles"] == 0
    report = {
        "classification": "PRIVATE_NORMALIZATION_REVIEW" if exact_silhouette and uv_pass else "PRIVATE_REVIEW_NEEDS_CORRECTION",
        "assetId": args.asset_id, "blender": bpy.app.version_string,
        "provider": accepted["provider"], "providerJobId": accepted["jobId"], "newCreditsSpent": 0,
        "ownerSilhouetteReview": accepted["ownerSilhouetteReview"], "sourceSha256": accepted["glbSha256"],
        "referenceSha256": accepted["referenceSha256"], "derivedFile": candidate.name,
        "derivedSha256": sha256_file(candidate), "derivedBytes": candidate.stat().st_size,
        "source": before_metrics, "afterGuardedWeld": welded, "reimportAfterUvSeamSplits": final_metrics,
        "weld": seam, "uv": {**uv, **repair}, "silhouette": views, "sameSampledSilhouette": exact_silhouette,
        "preservedProviderBounds": bounds, "preservedProviderPivot": pivot.tolist(),
        "scaleState": "source dimensions preserved; approved in-game dimensions and functional pivot pending",
        "topologyState": "boundary and internal non-manifold edges retained for targeted review",
        "lod0TriangleTarget": [10000,25000], "meetsLod0TriangleTarget": 10000 <= final_metrics["triangles"] <= 25000,
        "releaseState": "draft-only", "unityAdmission": False, "rigged": False, "textured": False,
    }
    if sha256_file(source) != accepted["glbSha256"]:
        raise BatchError("Original source changed during normalization")
    (output / "normalization-review.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report), flush=True)
    if not exact_silhouette or not uv_pass:
        raise BatchError("Private result retained for review; silhouette or sampled UV check needs correction")


if __name__ == "__main__":
    main()
