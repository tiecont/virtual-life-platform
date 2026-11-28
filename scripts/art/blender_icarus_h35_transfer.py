"""Audit one pinned H3.5 surface pair and optionally bake a private tangent normal map.

Run with Blender 5.3, --factory-startup --background --python-exit-code 1.
Inputs are static rest triangles in identity-authored GLB scenes. Register the
comparison explicitly in Blender meters. The output is a technical study.
"""

from argparse import ArgumentParser
from dataclasses import dataclass
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils.bvhtree import BVHTree
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_review_icarus_accessory_clay import file_hash, glb_document
from icarus_wing_parts import accessor


@dataclass
class Surface:
    vertices: np.ndarray
    faces: np.ndarray
    normals: np.ndarray | None
    uv: np.ndarray | None
    rejected_faces: int

    def bounds(self):
        return np.stack((self.vertices.min(axis=0), self.vertices.max(axis=0)))

    def tree(self):
        return BVHTree.FromPolygons(self.vertices.tolist(), self.faces.tolist(), all_triangles=True)


def read_surface(path, digest, name, transform, face_range):
    if file_hash(path) != digest:
        raise ValueError(f"{path.name}: input SHA-256 differs from the pinned digest")
    document = glb_document(path)
    nodes = document["nodes"]

    def walk(indices):
        for index in indices:
            node = nodes[index]
            yield node
            yield from walk(node.get("children", []))

    active = list(walk(document["scenes"][document.get("scene", 0)]["nodes"]))
    if any(key in node for node in active for key in ("matrix", "translation", "rotation", "scale")):
        raise ValueError("GLB scene contains authored transforms. Export identity-authored rest geometry for this audit.")
    matches = [node for node in active if node.get("name") == name and "mesh" in node]
    if len(matches) != 1 or "skin" in matches[0]:
        raise ValueError(f"{name}: expected one active, unskinned mesh")
    node = matches[0]
    mesh = document["meshes"][node["mesh"]]
    if any(node.get("weights", mesh.get("weights", []))):
        raise ValueError(f"{name}: export the neutral morph state for this audit")
    (primitive,) = mesh["primitives"]
    if primitive.get("mode", 4) != 4 or "indices" not in primitive or primitive.get("extensions"):
        raise ValueError(f"{name}: expected uncompressed indexed triangle geometry")

    with path.open("rb") as file:
        file.seek(12)
        json_size = struct.unpack("<I", file.read(4))[0]
        file.seek(20 + json_size)
        binary_size, tag = struct.unpack("<II", file.read(8))
        if tag != 0x004E4942 or file.tell() + binary_size != path.stat().st_size:
            raise ValueError("Expected one complete embedded GLB binary chunk")
    binary = np.memmap(path, mode="r", dtype=np.uint8, offset=28 + json_size, shape=(binary_size,))
    attributes = primitive["attributes"]
    if "POSITION" not in attributes:
        raise ValueError(f"{name}: expected float positions")

    def lane(field, width):
        if field in attributes:
            return accessor(document, binary, attributes[field], width, {5126})

    indices = accessor(document, binary, primitive["indices"], 1, {5123, 5125})
    faces = indices.reshape(-1, 3)
    if face_range:
        first, count = face_range
        if first < 0 or count <= 0 or first + count > len(faces):
            raise ValueError(f"{name}: triangle range lies outside the GLB index buffer")
        faces = faces[first:first + count]
    ids, inverse = np.unique(faces, return_inverse=True)
    faces = inverse.reshape(-1, 3)
    xyz = lane("POSITION", 3)[ids]
    if not np.isfinite(xyz).all():
        raise ValueError(f"{name}: positions must be finite")
    # glTF Y-up → Blender Z-up in the native right-handed bases.
    def to_blender(values):
        points = values[:, [0, 2, 1]].copy()
        points[:, 1] *= -1
        return points

    linear = transform[:, :3]
    vertices = to_blender(xyz) @ linear.T + transform[:, 3]
    geometric = triangle_vectors(vertices[faces])
    valid = np.linalg.norm(geometric, axis=1) > 1e-15
    if not valid.any():
        raise ValueError(f"{name}: selected region contains no nondegenerate triangles")
    used, inverse = np.unique(faces[valid], return_inverse=True)
    normals = lane("NORMAL", 3)
    if normals is not None:
        normals = to_blender(normals[ids[used]]) @ np.linalg.inv(linear)
        if not np.isfinite(normals).all() or np.any(np.linalg.norm(normals, axis=1) < 1e-6):
            raise ValueError(f"{name}: invalid shading normals")
        normals /= np.linalg.norm(normals, axis=1)[:, None]
    uv = lane("TEXCOORD_0", 2)
    if uv is not None:
        uv = uv[ids[used]].copy()
        uv[:, 1] = 1 - uv[:, 1]
    return Surface(vertices[used], inverse.reshape(-1, 3), normals, uv, int((~valid).sum()))


def triangle_vectors(points):
    return np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])


def samples(surface, count):
    points = surface.vertices[surface.faces]
    cross = triangle_vectors(points)
    area = np.linalg.norm(cross, axis=1)
    cumulative = np.cumsum(area, dtype=np.float64)
    rng = np.random.default_rng(204)
    faces = np.searchsorted(cumulative, (np.arange(count) + rng.random(count)) * cumulative[-1] / count)
    u, v = rng.random((2, count))
    root = np.sqrt(u)
    weights = np.stack((1 - root, root * (1 - v), root * v), axis=1)
    positions = np.einsum("ij,ijk->ik", weights, points[faces])
    normals = cross[faces] / area[faces, None]
    shading = normals
    if surface.normals is not None:
        shading = np.einsum("ij,ijk->ik", weights, surface.normals[surface.faces[faces]])
        length = np.linalg.norm(shading, axis=1)
        shading = np.where(length[:, None] > 1e-8,
                           shading / np.maximum(length[:, None], 1e-8), normals)
    # Area sampling could skip an isolated silhouette extremum or a thin trim.
    extreme = np.unique(np.concatenate((surface.vertices.argmin(axis=0), surface.vertices.argmax(axis=0))))
    return positions, normals, shading, surface.vertices[extreme]


def nearest_metrics(sampling, destination, cosine):
    points, normals, _, extrema = sampling
    hits = [destination.find_nearest(point) for point in points]
    distances = np.asarray([hit[3] for hit in hits])
    alignment = np.clip(np.einsum("ij,ij->i", normals, np.asarray([hit[1] for hit in hits])), -1, 1)
    return {
        "surfaceSamples": len(points), "extremumSamples": len(extrema),
        "p95Meters": float(np.percentile(distances, 95)),
        "sampleMaximumMeters": float(max(distances.max(), max(destination.find_nearest(p)[3] for p in extrema))),
        "normalAngleP95Degrees": float(np.degrees(np.arccos(np.percentile(alignment, 5)))),
        "normalBelowCosineFraction": float(np.mean(alignment < cosine)),
    }


def projection_metrics(sampling, high_tree, depth, cosine):
    positions, _, shading, _ = sampling
    rays = [high_tree.ray_cast(point + direction * depth, -direction, 2 * depth)
            for point, direction in zip(positions, shading, strict=True)]
    hits = [(row[1], direction, row[3]) for row, direction in zip(rays, shading, strict=True) if row[0] is not None]
    return {
        "samples": len(rays), "missFraction": (len(rays) - len(hits)) / len(rays),
        "badFacingHitFraction": sum(np.dot(n, d) < cosine for n, d, _ in hits) / len(rays),
        "maximumHitOffsetMeters": max((abs(depth - distance) for _, _, distance in hits), default=None),
    }


def object_from_surface(name, surface):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(surface.vertices.tolist(), [], surface.faces.tolist())
    mesh.update()
    if surface.normals is not None:
        mesh.polygons.foreach_set("use_smooth", np.ones(len(mesh.polygons), dtype=np.bool_))
        mesh.normals_split_custom_set_from_vertices(surface.normals.tolist())
    if surface.uv is not None:
        layer = mesh.uv_layers.new(name="Original UV")
        layer.uv.foreach_set("vector", surface.uv[surface.faces].astype(np.float32).ravel())
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def uv_triangles(obj):
    mesh = obj.data
    layer = mesh.uv_layers.active
    if layer is None:
        raise ValueError("Selected target has no active UV layer")
    uv = np.empty((len(mesh.loops), 2), dtype=np.float32)
    layer.uv.foreach_get("vector", uv.ravel())
    return uv.reshape(-1, 3, 2)


def uv_coverage(triangles, size):
    if not np.isfinite(triangles).all() or np.any((triangles < 0) | (triangles > 1)):
        raise ValueError("Bake UVs must be finite and inside one [0, 1] tile")
    grid = np.zeros((size, size), dtype=np.uint32)
    collapsed = 0
    with_no_texel = 0
    for triangle in triangles.astype(np.float64) * size:
        first, second = triangle[1] - triangle[0], triangle[2] - triangle[0]
        area = first[0] * second[1] - first[1] * second[0]
        if abs(area) < 1e-10:
            collapsed += 1
            continue
        if area < 0:
            triangle = triangle[[0, 2, 1]]
        (left, bottom) = np.maximum(0, np.ceil(triangle.min(axis=0) - .5).astype(int))
        (right, top) = np.minimum(size, np.floor(triangle.max(axis=0) - .5).astype(int) + 1)
        x, y = np.ogrid[bottom:top, left:right]
        inside = np.ones((top - bottom, right - left), dtype=np.bool_)
        for start, end in zip(triangle, np.roll(triangle, -1, axis=0), strict=True):
            dx, dy = end - start
            edge = dx * (x + .5 - start[1]) - dy * (y + .5 - start[0])
            boundary = (dy > 0 or (dy == 0 and dx < 0))
            inside &= (edge > 1e-8) | (boundary & (np.abs(edge) <= 1e-8))
        grid[bottom:top, left:right] += inside
        with_no_texel += not inside.any()
    return grid > 0, {
        "occupiedPixels": int(np.count_nonzero(grid)), "overlapPixels": int(np.count_nonzero(grid > 1)),
        "collapsedTriangles": collapsed, "noncollapsedTrianglesWithoutTexelCenter": with_no_texel,
    }


def uv_metrics(triangles, resolution, surface):
    covered, result = uv_coverage(triangles, resolution)
    area = float(np.linalg.norm(triangle_vectors(surface.vertices[surface.faces]), axis=1).sum() / 2)
    result["surfaceAreaSquareMeters"] = area
    result["occupiedPixelsPerMeter"] = float((result["occupiedPixels"] / area) ** .5)
    return covered, result


def active_uv(target, mode, resolution, margin):
    if mode == "smart":
        layer = target.data.uv_layers.new(name="Private bake UV")
        target.data.uv_layers.active = layer
        layer.active_render = True
        bpy.context.view_layer.objects.active = target
        target.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=(margin + 2) / resolution, margin_method="FRACTION")
        bpy.ops.object.mode_set(mode="OBJECT")
        target.select_set(False)
    return uv_triangles(target)


def bake_layer(target, material, label, size, kind, margin, output):
    image = bpy.data.images.new(label, width=size, height=size, alpha=True)
    image.colorspace_settings.name = "Non-Color"
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    material.node_tree.nodes.active = node
    result = bpy.ops.object.bake(type=kind, margin=margin, uv_layer=target.data.uv_layers.active.name)
    if result != {"FINISHED"}:
        raise RuntimeError(f"Cycles could not finish the {label} bake")
    image.filepath_raw = str(output)
    image.file_format = "PNG"
    image.save()
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return node, pixels.reshape(size, size, 4)


def bake(high, target, covered, args):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_cage = True
    scene.render.bake.cage_extrusion = args.ray_depth
    scene.render.bake.max_ray_distance = 2 * args.ray_depth
    scene.render.bake.normal_space = "TANGENT"

    source_material = bpy.data.materials.new("Private clay projection source")
    source_material.use_nodes = True
    source_material.node_tree.nodes.clear()
    emission = source_material.node_tree.nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (1, 1, 1, 1)
    material_output = source_material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    source_material.node_tree.links.new(emission.outputs["Emission"], material_output.inputs["Surface"])
    high.data.materials.append(source_material)
    material = bpy.data.materials.new("Private baked clay preview")
    material.use_nodes = True
    target.data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target

    mask_node, mask = bake_layer(target, material, "Projection hit mask", args.resolution, "EMIT", 0,
                                  args.output / "projection-hit.png")
    hits = covered & (mask[:, :, 0] > .5)
    miss_fraction = 1 - int(hits.sum()) / int(covered.sum())
    del mask
    bpy.data.images.remove(mask_node.image, do_unlink=True)
    material.node_tree.nodes.remove(mask_node)
    evidence = {"projectionHitMask": file_hash(args.output / "projection-hit.png"),
                "hitPixels": int(hits.sum()), "missFraction": miss_fraction}
    if not hits.any() or miss_fraction > args.max_misses:
        return evidence

    normal_node, normal = bake_layer(target, material, "H3.5 tangent normal", args.resolution, "NORMAL",
                                     args.margin, args.output / "normal.png")
    vectors = normal[hits, :3] * 2 - 1
    angles = np.degrees(np.arctan2(np.linalg.norm(vectors[:, :2], axis=1), vectors[:, 2]))
    evidence.update({"normalSha256": file_hash(args.output / "normal.png"),
                     "normalDeviationP95Degrees": float(np.percentile(angles, 95)),
                     "normalPixelsOverFiveDegrees": int((angles > 5).sum())})
    if not evidence["normalPixelsOverFiveDegrees"]:
        return evidence
    normal_node.image.pack()
    uv_map = material.node_tree.nodes.new("ShaderNodeUVMap")
    normal_map = material.node_tree.nodes.new("ShaderNodeNormalMap")
    uv_map.uv_map = normal_map.uv_map = target.data.uv_layers.active.name
    links = material.node_tree.links
    links.new(uv_map.outputs["UV"], normal_node.inputs["Vector"])
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], material.node_tree.nodes.get("Principled BSDF").inputs["Normal"])
    high.data.materials.clear()
    high.hide_render = True
    high.hide_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output / "normal-study.blend"), compress=True)
    evidence["editableSha256"] = file_hash(args.output / "normal-study.blend")
    return evidence


def main():
    parser = ArgumentParser(description=__doc__)
    for role in ("source", "target"):
        parser.add_argument(f"--{role}", type=Path, required=True)
        parser.add_argument(f"--{role}-sha256", required=True)
        parser.add_argument(f"--{role}-part", required=True)
        parser.add_argument(f"--{role}-faces", type=int, nargs=2, metavar=("FIRST", "COUNT"))
        parser.add_argument(f"--{role}-matrix", type=json.loads,
                            default=[[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]],
                            help="Explicit 3×4 affine matrix in Blender meters, applied after glTF axis conversion")
    parser.add_argument("--max-p95", type=float, required=True, help="Maximum p95 nearest distance in meters")
    parser.add_argument("--max-distance", type=float, required=True, help="Maximum sampled nearest distance in meters")
    parser.add_argument("--normal-cosine", type=float, required=True)
    parser.add_argument("--max-bad-normals", type=float, required=True, help="Maximum misoriented sample fraction")
    parser.add_argument("--ray-depth", type=float, required=True, help="Meters on either side of the target surface")
    parser.add_argument("--max-misses", type=float, required=True, help="Maximum sampled and baked miss fraction")
    parser.add_argument("--samples", type=int, default=12000)
    parser.add_argument("--bake", choices=("existing", "smart"))
    parser.add_argument("--resolution", type=int, choices=(256, 512, 1024, 2048, 4096), default=1024)
    parser.add_argument("--margin", type=int, default=8, help="Normal bake padding in pixels")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if (not 256 <= args.samples <= 100000 or not 0 <= args.margin <= 64
            or not 0 < args.max_p95 <= args.max_distance < np.inf
            or not 0 < args.ray_depth <= args.max_distance
            or not -1 <= args.normal_cosine <= 1 or not 0 <= args.max_misses < 1
            or not 0 <= args.max_bad_normals < 1):
        parser.error("Invalid sample or acceptance bounds")
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("Use Blender 5.3 for the audited transfer.")

    inputs, surfaces = {}, []
    for role in ("source", "target"):
        fields = vars(args)
        path, sha, part, face_range, matrix = (fields[role + suffix]
                                               for suffix in ("", "_sha256", "_part", "_faces", "_matrix"))
        matrix = np.array(matrix, dtype=np.float64)
        if (matrix.shape != (3, 4) or not np.isfinite(matrix).all()
                or np.linalg.det(matrix[:, :3]) <= 1e-9):
            parser.error(f"{role} matrix must be a finite, orientation-preserving 3×4 affine transform")
        surface = read_surface(path, sha, part, matrix, face_range)
        surfaces.append(surface)
        inputs[role] = {"file": path.name, "sha256": sha, "part": part, "triangleRange": face_range,
                        "blenderMatrix": matrix.tolist(), "boundsMeters": surface.bounds().tolist(),
                        "triangles": len(surface.faces), "zeroAreaTrianglesRemoved": surface.rejected_faces}
    high, low = surfaces
    high_tree, low_tree = high.tree(), low.tree()
    low_samples = samples(low, args.samples)
    nearest = {
        "sourceToTarget": nearest_metrics(samples(high, args.samples), low_tree, args.normal_cosine),
        "targetToSource": nearest_metrics(low_samples, high_tree, args.normal_cosine),
    }
    rays = projection_metrics(low_samples, high_tree, args.ray_depth, args.normal_cosine)
    failures = []
    for direction, row in nearest.items():
        for measurement, limit in (("p95Meters", args.max_p95), ("sampleMaximumMeters", args.max_distance),
                                   ("normalBelowCosineFraction", args.max_bad_normals)):
            if row[measurement] > limit:
                failures.append(f"{direction}.{measurement}")
    if rays["missFraction"] > args.max_misses:
        failures.append("sampledRayMissFraction")
    if rays["badFacingHitFraction"] > args.max_bad_normals:
        failures.append("sampledRayFacingFraction")
    if low.rejected_faces:
        failures.append("targetZeroAreaTriangles")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    args.output = args.output.resolve()
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    report = {"classification": "PRIVATE_SURFACE_TRANSFER_STUDY", "blenderVersion": bpy.app.version_string,
              "inputs": inputs, "nearest": nearest, "projectionRays": rays,
              "thresholds": {"p95Meters": args.max_p95, "maximumMeters": args.max_distance,
                             "normalCosine": args.normal_cosine, "badNormals": args.max_bad_normals,
                             "rayDepthMeters": args.ray_depth, "misses": args.max_misses},
              "bakeUvMode": args.bake, "resolution": args.resolution, "marginPixels": args.margin,
              "failures": failures}
    if low.uv is not None:
        try:
            _, report["originalUv"] = uv_metrics(low.uv[low.faces], args.resolution, low)
        except ValueError as error:
            report["originalUv"] = {"error": str(error)}
            if args.bake == "existing":
                failures.append("invalidTargetUv")
    if args.bake and not failures:
        target = object_from_surface("Production geometry – isolated part", low)
        if low.uv is None and args.bake == "existing":
            failures.append("missingTargetUv")
        else:
            covered, report["bakeUv"] = uv_metrics(active_uv(target, args.bake, args.resolution, args.margin),
                                                   args.resolution, low)
            uv = report["bakeUv"]
            if not uv["occupiedPixels"] or uv["overlapPixels"] or uv["collapsedTriangles"]:
                failures.append("targetUvNotBakeSafeAtResolution")
            else:
                source = object_from_surface("Pinned H3.5 high-poly part", high)
                report["bake"] = bake(source, target, covered, args)
                if report["bake"]["missFraction"] > args.max_misses:
                    failures.append("bakedProjectionMissFraction")
                elif not report["bake"]["normalPixelsOverFiveDegrees"]:
                    failures.append("noBakedDetailOverFiveDegrees")
    report["status"] = "REJECTED" if failures else ("BAKED" if args.bake else "CORRESPONDENCE_PASS")
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    if failures:
        raise RuntimeError(f"Surface transfer rejected: {', '.join(failures)}")
    print(f"{report['status']}: {args.output / 'report.json'}", flush=True)


if __name__ == "__main__":
    main()
