"""Build and compare a private 26k static LOD of the pinned Icarus wing source."""

from argparse import ArgumentParser
from copy import deepcopy
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from icarus_wing_parts import accessor, checksum, parse_glb, topology
from icarus_wing_parts_segment import SOURCE_SHA


REGIONS_SHA = "a58978b5ccafb51921943b6e1b33896e60c049e82a7eec948dac7bf510f3d344"
TARGET = 26000


def unpack(payload):
    document, binary = parse_glb(payload)
    (mesh,) = document["meshes"]
    (primitive,) = mesh["primitives"]
    attrs = primitive["attributes"]
    positions = accessor(document, binary, attrs["POSITION"], 3, {5126})
    normals = accessor(document, binary, attrs["NORMAL"], 3, {5126})
    uv = accessor(document, binary, attrs["TEXCOORD_0"], 2, {5126})
    triangles = accessor(document, binary, primitive["indices"], 1, {5123, 5125}).reshape(-1, 3)
    return document, binary, positions, normals, uv, triangles


def blender_axes(raw):
    return np.column_stack((raw[:, 0], -raw[:, 2], raw[:, 1]))


def gltf_axes(blender):
    return np.column_stack((blender[:, 0], blender[:, 2], -blender[:, 1]))


def contents(collection, field, width, dtype):
    values = np.empty((len(collection), width), dtype=dtype)
    collection.foreach_get(field, values.ravel())
    return values


def static_collapse(welded, faces, corner_uv, corner_normals):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new("Exact XYZ welded source")
    mesh.from_pydata(blender_axes(welded).tolist(), [], faces.tolist(), shade_flat=False)
    if mesh.validate():
        raise ValueError("Blender changed the reconstructed source topology")
    indices = contents(mesh.loops, "vertex_index", 1, np.int32).ravel()
    if not np.array_equal(indices, faces.ravel()):
        raise ValueError("Blender changed the order of exact source triangle corners")
    uv_layer = mesh.uv_layers.new(name="SourceUV")
    blender_uv = corner_uv.copy()
    blender_uv[:, 1] = 1.0 - blender_uv[:, 1]
    uv_layer.uv.foreach_set("vector", blender_uv.ravel())
    if not np.array_equal(contents(uv_layer.uv, "vector", 2, np.float32), blender_uv):
        raise ValueError("Exact source per-corner UVs did not survive the weld")
    mesh.normals_split_custom_set(blender_axes(corner_normals).tolist())
    obj = bpy.data.objects.new("Static wing LOD", mesh)
    bpy.context.collection.objects.link(obj)
    decimate = obj.modifiers.new("Global triangle collapse", "DECIMATE")
    decimate.ratio = TARGET / len(faces)
    decimate.use_collapse_triangulate = True
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    result = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
    result.calc_loop_triangles()
    count = len(result.loop_triangles)
    if not TARGET - 1000 <= count <= TARGET:
        raise ValueError(f"Global collapse produced {count} triangles")
    face_vertices = contents(result.loop_triangles, "vertices", 3, np.int32)
    face_loops = contents(result.loop_triangles, "loops", 3, np.int32).ravel()
    positions = gltf_axes(contents(result.vertices, "co", 3, np.float32))
    corner_uv = contents(result.uv_layers.active.uv, "vector", 2, np.float32)[face_loops]
    corner_uv[:, 1] = 1.0 - corner_uv[:, 1]
    normals = gltf_axes(contents(result.corner_normals, "vector", 3, np.float32)[face_loops])
    rows = np.column_stack((positions[face_vertices.ravel()], normals, corner_uv))
    packed, inverse = np.unique(rows, axis=0, return_inverse=True)
    if not np.isfinite(packed).all():
        raise ValueError("LOD contains non-finite geometry or attributes")
    evaluated.to_mesh_clear()
    return packed.astype("<f4", copy=False), inverse.reshape(-1, 3).astype("<u4")


def image_payload(document, binary, image):
    view = document["bufferViews"][image["bufferView"]]
    offset = view.get("byteOffset", 0)
    return binary[offset:offset + view["byteLength"]]


def write_candidate(path, source, source_binary, packed, triangles):
    document = deepcopy(source)
    document["bufferViews"], document["accessors"] = [], []
    data = bytearray()

    def append(payload, target=None):
        data.extend(b"\0" * (-len(data) % 4))
        index = len(document["bufferViews"])
        view = {"buffer": 0, "byteOffset": len(data), "byteLength": len(payload)}
        if target is not None:
            view["target"] = target
        document["bufferViews"].append(view)
        data.extend(payload)
        return index

    for before, after in zip(source["images"], document["images"], strict=True):
        after["bufferView"] = append(image_payload(source, source_binary, before))
    primitive = document["meshes"][0]["primitives"][0]
    for label, values in (("POSITION", packed[:, :3]), ("NORMAL", packed[:, 3:6]), ("TEXCOORD_0", packed[:, 6:])):
        row = {
            "bufferView": append(values.tobytes(), 34962),
            "componentType": 5126,
            "type": f"VEC{values.shape[1]}",
            "count": len(values),
        }
        if label == "POSITION":
            row["min"] = values.min(axis=0).tolist()
            row["max"] = values.max(axis=0).tolist()
        primitive["attributes"][label] = len(document["accessors"])
        document["accessors"].append(row)
    primitive["indices"] = len(document["accessors"])
    document["accessors"].append({
        "bufferView": append(triangles.tobytes(), 34963),
        "componentType": 5125,
        "type": "SCALAR",
        "count": triangles.size,
    })
    document["buffers"][0]["byteLength"] = len(data)
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    data.extend(b"\0" * (-len(data) % 4))
    with path.open("xb") as file:
        file.write(struct.pack("<4sIIII", b"glTF", 2, 28 + len(encoded) + len(data), len(encoded), 0x4E4F534A))
        file.write(encoded)
        file.write(struct.pack("<II", len(data), 0x004E4942))
        file.write(data)


def sample_regions(source_positions, source_triangles, low_positions, low_triangles, labels):
    source = source_positions[source_triangles].mean(axis=1)
    low = low_positions[low_triangles].mean(axis=1)
    tree = KDTree(len(source))
    for index, point in enumerate(source):
        tree.insert(point, index)
    tree.balance()
    source_faces = np.empty(len(low), dtype="<u4")
    distances = np.empty(len(low), dtype=np.float32)
    for index, center in enumerate(low):
        _, source_faces[index], distances[index] = tree.find(center)
    return labels[source_faces], source_faces, {
        "method": "nearest high-resolution triangle centroid in source XYZ",
        "medianDistanceMeters": float(np.median(distances)),
        "p95DistanceMeters": float(np.percentile(distances, 95)),
        "maxDistanceMeters": float(distances.max()),
    }


def texture_hashes(document, binary):
    return {image["name"]: checksum(image_payload(document, binary, image)) for image in document["images"]}


def build(payload, regions, output):
    document, binary, positions, normals, uv, triangles = unpack(payload)
    map_file = regions / "source-triangle-part-ids.u16"
    review = json.loads((regions / "wing-primary-region-review.json").read_text())
    labels = np.frombuffer(map_file.read_bytes(), dtype="<u2")
    names = {part["id"]: part["name"] for part in review["parts"]}
    if (review["sourceSha256"] != SOURCE_SHA or checksum(labels) != REGIONS_SHA
            or len(labels) != len(triangles) or set(np.unique(labels)) != names.keys() or len(names) != 23):
        raise ValueError("The owner source and exact 23-region face map must match")
    welded, identity = np.unique(positions, axis=0, return_inverse=True)
    baseline = topology(triangles, positions, uv, identity)
    packed, low_triangles = static_collapse(welded, identity[triangles], uv[triangles].reshape(-1, 2),
                                            normals[triangles].reshape(-1, 3))
    lod_positions, lod_uv = packed[:, :3], packed[:, 6:]
    _, low_identity = np.unique(lod_positions, axis=0, return_inverse=True)
    reduced = topology(low_triangles, lod_positions, lod_uv, low_identity)
    if (baseline["components"] != 1 or reduced["components"] != 1
            or reduced["oneFaceEdges"] > baseline["oneFaceEdges"]
            or reduced["zeroLengthEdgeOccurrences"] > baseline["zeroLengthEdgeOccurrences"]
            or reduced["edgesWithMoreThanTwoFaces"] > baseline["edgesWithMoreThanTwoFaces"]
            or reduced["pairedEdgesWithDifferentUvs"] > baseline["pairedEdgesWithDifferentUvs"]):
        raise ValueError(f"LOD violated welded topology. Source {baseline}; result {reduced}")
    assigned, source_faces, transfer = sample_regions(positions, triangles, lod_positions, low_triangles, labels)
    if set(np.unique(assigned)) != names.keys():
        raise ValueError("Global LOD removed one or more rough source regions")
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    candidate = output / "icarus-wing-static-26k.glb"
    write_candidate(candidate, document, binary, packed, low_triangles)
    staged_payload = candidate.read_bytes()
    staged, staged_binary, exported_positions, exported_normals, exported_uv, exported_triangles = unpack(staged_payload)
    textures = texture_hashes(document, binary)
    if (len(textures) != 3 or textures != texture_hashes(staged, staged_binary)
            or document["materials"] != staged["materials"] or document["textures"] != staged["textures"]
            or document["samplers"] != staged["samplers"] or document["nodes"] != staged["nodes"]
            or not np.array_equal(exported_positions, lod_positions)
            or not np.array_equal(exported_uv, lod_uv)
            or not np.array_equal(exported_normals, packed[:, 3:6])
            or not np.array_equal(exported_triangles, low_triangles)):
        raise ValueError("LOD export changed verified attributes or encoded textures and material")
    (output / "lod-triangle-part-ids.u16").write_bytes(assigned.astype("<u2", copy=False).tobytes())
    (output / "lod-nearest-source-triangles.u32").write_bytes(source_faces.tobytes())
    return {
        "classification": "PRIVATE_H2_STATIC_WING_LOD",
        "sourceSha256": checksum(payload),
        "sourceRegionMapSha256": checksum(labels),
        "candidate": candidate.name,
        "candidateSha256": checksum(staged_payload),
        "textureSha256": textures,
        "originalTriangles": len(triangles),
        "originalVertices": len(positions),
        "sourceExactWeldVertices": len(welded),
        "lodTriangles": len(low_triangles),
        "lodExportedVertices": len(packed),
        "lodExactWeldVertices": int(low_identity.max()) + 1,
        "exactUvCornersBeforeCollapse": len(triangles) * 3,
        "sourceWeldedTopology": baseline,
        "lodWeldedTopology": reduced,
        "roughRegionTransfer": transfer,
        "lodRegionSha256": checksum(assigned),
        "lodSourceTriangleMapSha256": checksum(source_faces),
        "regionCounts": [{"id": label, "name": names[label], "lodTriangles": int(np.count_nonzero(assigned == label))}
                         for label in sorted(names)],
        "scope": "Static geometry; existing texture and material bytes; no motion, rig or release admission.",
    }


def import_mesh(path, count):
    before = set(bpy.context.scene.objects)
    if bpy.ops.import_scene.gltf(filepath=str(path)) != {"FINISHED"}:
        raise RuntimeError(f"Blender did not import {path.name}")
    (obj,) = [obj for obj in set(bpy.context.scene.objects) - before if obj.type == "MESH"]
    obj.data.calc_loop_triangles()
    if len(obj.data.loop_triangles) != count or len(obj.data.materials) != 1:
        raise RuntimeError(f"Blender changed mesh shape or material layout in {path.name}")
    return obj


def png_pixels(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        image.colorspace_settings.name = "Non-Color"
        values = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(values)
        return values.reshape(-1, 4)
    finally:
        bpy.data.images.remove(image)


def compare_frames(source, lod):
    before, after = png_pixels(source), png_pixels(lod)
    source_mask, lod_mask = before[:, 3] >= 0.5, after[:, 3] >= 0.5
    shared = source_mask & lod_mask
    union = source_mask | lod_mask
    if not np.any(shared):
        raise RuntimeError("Matched frames had no overlapping foreground")
    opaque = (before[:, 3] >= .995) & (after[:, 3] >= .995)
    if not np.any(opaque):
        raise RuntimeError("Matched frames had no common opaque pixels")
    delta = np.abs(before[opaque, :3] - after[opaque, :3]) * 255.0
    return {
        "silhouetteIoU": float(np.count_nonzero(shared) / np.count_nonzero(union)),
        "sourceSilhouettePixels": int(np.count_nonzero(source_mask)),
        "lodSilhouettePixels": int(np.count_nonzero(lod_mask)),
        "maskXorPixels": int(np.count_nonzero(source_mask ^ lod_mask)),
        "commonOpaquePixels": int(np.count_nonzero(opaque)),
        "meanAbsDisplayRgbDifference255": float(delta.mean()),
        "p95AbsDisplayRgbDifference255": float(np.percentile(delta, 95)),
    }


def render_pair(source, candidate, evidence, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    original = import_mesh(source, evidence["originalTriangles"])
    lod = import_mesh(candidate, evidence["lodTriangles"])
    corners = [original.matrix_world @ Vector(value) for value in original.bound_box]
    bounds = np.asarray([tuple(point) for point in corners])
    center = Vector((bounds.max(axis=0) + bounds.min(axis=0)) / 2)
    extent = float(np.linalg.norm(bounds.max(axis=0) - bounds.min(axis=0)))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 12
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene.render.resolution_x, scene.render.resolution_y = 768, 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("Neutral ambient")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes.get("Background").inputs["Color"].default_value = (.32, .32, .32, 1)
    world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .3
    camera = bpy.data.objects.new("Matched orthographic camera", bpy.data.cameras.new("Matched orthographic camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = extent * 1.095
    light = bpy.data.objects.new("Matched white key", bpy.data.lights.new("Matched white key", "SUN"))
    scene.collection.objects.link(light)
    light.data.energy = 2.0
    light.data.angle = 0.02
    frames = []
    for sign, side in ((1, "plus-x"), (-1, "minus-x")):
        camera.location = center + Vector((sign * extent * 3, 0, 0))
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        for name, key in (("neutral", (.87 * sign, -.25, .42)), ("grazing", (.20 * sign, -.86, .46))):
            light.rotation_euler = (-Vector(key)).to_track_quat("-Z", "Y").to_euler()
            pair = []
            for asset, obj, hidden in (("original", original, lod), ("lod", lod, original)):
                obj.hide_render, hidden.hide_render = False, True
                path = output / f"{side}-{name}-{asset}.png"
                scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True)
                pair.append(path)
            frames.append({"side": side, "lighting": name, "keyVector": key,
                           "files": [{"file": path.name, "sha256": checksum(path.read_bytes())} for path in pair],
                           "comparison": compare_frames(*pair)})
    return {
        "sourceSha256": evidence["sourceSha256"],
        "candidateSha256": evidence["candidateSha256"],
        "renderer": "Blender Cycles CPU, 12 samples, AgX, 768x512 RGBA",
        "comparisonScope": "Mask threshold alpha 0.5; display RGB on common opaque pixels. Neutral and grazing keys share camera, material, and exposure within each pair.",
        "frames": frames,
    }


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("regions", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--render-existing", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("The private wing LOD requires Blender 5.3")
    source = args.source.resolve(strict=True)
    payload = source.read_bytes()
    if checksum(payload) != SOURCE_SHA:
        raise ValueError("The exact owner-selected wing export is required")
    output = args.output.resolve()
    report = output / "wing-static-lod-review.json"
    if args.render_existing:
        evidence = json.loads(report.read_text())
        candidate = output / evidence["candidate"]
        if evidence["sourceSha256"] != SOURCE_SHA or checksum(candidate.read_bytes()) != evidence["candidateSha256"]:
            raise ValueError("The existing private candidate or source pin changed")
        renders = output / "renders"
        renders.mkdir(exist_ok=False, mode=0o700)
        capture = render_pair(source, candidate, evidence, renders)
        (renders / "wing-static-lod-capture.json").write_text(json.dumps(capture, indent=2) + "\n")
    else:
        evidence = build(payload, args.regions.resolve(strict=True), output)
        report.write_text(json.dumps(evidence, indent=2) + "\n")
    if checksum(source.read_bytes()) != SOURCE_SHA:
        raise RuntimeError("The original wing source changed during review")


if __name__ == "__main__":
    main()
