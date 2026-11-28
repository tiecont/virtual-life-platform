"""Inspect original-plate Icarus clay parts and test reversible diagnostic placement."""

from argparse import ArgumentParser
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_review_icarus_accessory_clay import file_hash, glb_document, meshes, verify_receipt, verify_reference


SOURCES = {
    "wing": "7e9b20816bdcd0099ff5402424a6d9bec7b7d23c2353e1d53491fec80fe57a3b",
    "bow": "9135bedea94d1ab79de4d085d253cb0348e595641a24aba2770e44f3512e3e71",
}
REGION_CANDIDATES = {
    "wing": {
        "paired_upper_coverts": [0, 1],
        "paired_outer_primaries": [5, 3],
        "paired_lower_primaries": [4, 7],
        "paired_root_ornaments": [37, 19],
        "central_mount_or_jewel": [56],
    },
    "bow": {
        "limb_and_riser_surfaces": [0, 1, 9, 16],
        "central_emblem_and_grip": [2, 3, 4, 5, 7, 10],
        "lower_nock_surfaces": [6, 63],
        "upper_nock_surfaces": [43, 44],
        "thin_lower_string_fragment": [52],
    },
}


def key(index):
    return f"tripo_part_{index}"


def part_arrays(source, document):
    with source.open("rb") as file:
        _, _, _, json_size, _ = struct.unpack("<4sIIII", file.read(20))
        file.seek(20 + json_size)
        _, tag = struct.unpack("<II", file.read(8))
        if tag != 0x004E4942:
            raise ValueError("Geometry source must contain the embedded GLB battery of meshes.")
    payload = np.memmap(source, mode="r", dtype=np.uint8, offset=28 + json_size)
    for node in document["nodes"]:
        if any(name in node for name in ("matrix", "translation", "rotation", "scale")):
            raise ValueError("The exact clay jobs are static, identity-space meshes.")
        if "mesh" not in node:
            continue
        (primitive,) = document["meshes"][node["mesh"]]["primitives"]
        position = document["accessors"][primitive["attributes"]["POSITION"]]
        view = document["bufferViews"][position["bufferView"]]
        if (position["componentType"] != 5126 or position["type"] != "VEC3"
                or view.get("buffer", 0) != 0 or view.get("byteStride", 12) != 12):
            raise ValueError("Expected dense original FLOAT3 surface coordinates.")
        offset = view.get("byteOffset", 0) + position.get("byteOffset", 0)
        vertices = np.ndarray((position["count"], 3), "<f4", buffer=payload, offset=offset)
        triangles = document["accessors"][primitive["indices"]]["count"] // 3
        lower, upper = vertices.min(axis=0), vertices.max(axis=0)
        yield node["name"], triangles, vertices, lower, upper


def string_coverage(parts):
    fragments = {name: (lower, upper) for name, _, _, lower, upper in parts}
    segment_low, segment_high = fragments[key(52)]
    lower_nock = fragments[key(63)]
    upper_nock = fragments[key(44)]
    # The only independently thin, nearly vertical provider part establishes
    # the fixed transverse line. Evaluate the entire asset at that exact line.
    transverse = ((segment_low + segment_high) / 2)[[0, 2]]
    start_y, end_y = float(lower_nock[1][1]), float(upper_nock[0][1])
    edges = np.linspace(start_y, end_y, 97)
    radius = .006
    covered_by = {}
    occupancy = np.zeros(len(edges) - 1, dtype=np.bool_)
    for name, _, vertices, low, high in parts:
        if high[1] < start_y or low[1] > end_y:
            continue
        if np.any(low[[0, 2]] > transverse + radius) or np.any(high[[0, 2]] < transverse - radius):
            continue
        transverse_distance = np.linalg.norm(vertices[:, [0, 2]] - transverse, axis=1)
        heights = vertices[transverse_distance < radius, 1]
        counts, _ = np.histogram(heights, bins=edges)
        hits = counts > 0
        if np.any(hits):
            covered_by[name] = [int(value) for value in np.flatnonzero(hits)]
            occupancy |= hits
    missing = np.flatnonzero(~occupancy)
    split = np.flatnonzero(np.diff(missing) > 1) + 1
    gaps = [interval for interval in np.split(missing, split) if len(interval)]
    longest = max(gaps, key=len, default=None)
    return {
        "method": "Actual vertex occupancy around the straight line defined by lower string part 52 between nock candidate parts 63 and 44.",
        "exactSourceTransverseXZ": transverse.tolist(),
        "corridorRadiusSourceUnits": radius,
        "betweenNockCandidatesY": [start_y, end_y],
        "bins": len(occupancy),
        "occupiedBins": int(np.count_nonzero(occupancy)),
        "partOccupancyBins": covered_by,
        "longestUnsampledSpanY": None if longest is None else [float(edges[longest[0]]), float(edges[longest[-1] + 1])],
        "coverageScope": "Vertex sampling within a straight 6 mm corridor. Missing bins alone do not identify an arbitrarily curved string or a coarse long triangle.",
    }


def raw_probe(source, asset):
    document = glb_document(source)
    parts = list(part_arrays(source, document))
    rows = {name: {"triangles": triangles, "boundsMin": low.tolist(), "boundsMax": high.tolist(),
                   "boundsCenter": ((low + high) / 2).tolist()}
            for name, triangles, _, low, high in parts}
    candidates = {region: [key(index) for index in ids] for region, ids in REGION_CANDIDATES[asset].items()}
    if any(name not in rows for region in candidates.values() for name in region):
        raise ValueError("A pinned original provider part is missing.")
    result = {"asset": asset, "sourceSha256": file_hash(source), "candidateMechanicalRegions": candidates, "parts": rows,
              "semanticScope": "Bounds-based candidates on actual geometry. The provider gave geometric IDs and one clay material. Visual review determines exact artistic roles."}
    if asset == "bow":
        result["stringProbe"] = string_coverage(parts)
    else:
        # Keep parts crossing the mount seam stationary in the diagnostic pose.
        result["wingSideParts"] = {
            "negativeX": [name for name, row in rows.items() if row["boundsMax"][0] < 0],
            "positiveX": [name for name, row in rows.items() if row["boundsMin"][0] > 0],
            "crossesCenter": [name for name, row in rows.items() if row["boundsMin"][0] <= 0 <= row["boundsMax"][0]],
        }
    return result


def stage_camera(asset, objects):
    points = np.asarray([tuple(obj.matrix_world @ Vector(corner)) for obj in objects for corner in obj.bound_box])
    extent = points.max(axis=0) - points.min(axis=0)
    center = Vector((points.min(axis=0) + points.max(axis=0)) / 2)
    scene = bpy.context.scene
    camera = bpy.data.objects.new("Diagnostic clay camera", bpy.data.cameras.new("Diagnostic clay camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 896 if asset == "wing" else 640
    scene.render.resolution_y = 704 if asset == "wing" else 896
    scene.render.resolution_percentage = 100
    scene.render.threads_mode, scene.render.threads = "FIXED", 2
    scene.render.image_settings.file_format = "PNG"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "SINGLE"
    shading.show_cavity = True
    shading.single_color = (.72, .72, .72)
    whole = float(np.linalg.norm(extent))
    direction = Vector((.38, 1, .14)) if asset == "wing" else Vector((1, 0, 0))
    return camera, center, whole, direction


def capture(camera, center, scale, direction, path):
    scene = bpy.context.scene
    camera.data.ortho_scale = scale
    camera.location = center + direction.normalized() * 4
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return {"file": path.name, "sha256": file_hash(path)}


def wing_probe(parts, report, output, camera, center, scale, direction):
    wing_sides = report["wingSideParts"]
    matrices = {name: obj.matrix_basis.copy() for name, obj in parts.items()}
    world = {name: obj.matrix_world.copy() for name, obj in parts.items()}
    frames = [capture(camera, center, scale * 1.17, direction, output / "01-rest.png")]
    hypothetical = {}
    try:
        for names, shoulder_name, side in ((wing_sides["negativeX"], key(37), -1), (wing_sides["positiveX"], key(19), 1)):
            shoulder = report["parts"][shoulder_name]["boundsCenter"]
            pivot = Vector((shoulder[0], -shoulder[2], shoulder[1]))
            angle = side * np.deg2rad(12)
            change = Matrix.Translation(pivot) @ Matrix.Rotation(angle, 4, "Z") @ Matrix.Translation(-pivot)
            for name in names:
                parts[name].matrix_world = change @ world[name]
            hypothetical[str(side)] = {"pivotCandidate": shoulder_name, "worldPivot": list(pivot),
                                       "diagnosticYawDegrees": side * 12, "movedObjects": len(names)}
        bpy.context.view_layer.update()
        changed = {name for name, obj in parts.items() if obj.matrix_world != world[name]}
        if not changed or changed != set(wing_sides["negativeX"] + wing_sides["positiveX"]):
            raise ValueError("Diagnostic wing adjustment moved the wrong provider parts.")
        frames.append(capture(camera, center, scale * 1.17, direction, output / "02-diagnostic-yaw.png"))
    finally:
        for name, obj in parts.items():
            obj.matrix_basis = matrices[name]
        bpy.context.view_layer.update()
    if any(obj.matrix_world != world[name] for name, obj in parts.items()):
        raise ValueError("Diagnostic wing pose did not exactly restore provider transforms.")
    frames.append(capture(camera, center, scale * 1.17, direction, output / "03-restored.png"))
    return {"frames": frames, "temporaryWingSideYaw": hypothetical, "exactTransformsRestored": True,
            "scope": "Fixed reversible angle test on whole-side provider parts, with crossing-center parts stationary. No rig, fold behavior or attachment clearance is established."}


def bow_probe(parts, report, output, camera, center, scale, direction):
    original_visibility = {name: obj.hide_render for name, obj in parts.items()}
    frames = [capture(camera, center, scale * 1.12, direction, output / "01-whole-bow-profile.png")]
    try:
        mechanical = report["candidateMechanicalRegions"]
        selected = set(mechanical["lower_nock_surfaces"] + mechanical["upper_nock_surfaces"] +
                       mechanical["thin_lower_string_fragment"])
        for name, obj in parts.items():
            obj.hide_render = name not in selected
        frames.append(capture(camera, center, scale * 1.12, direction, output / "02-nock-and-string-candidates.png"))
        for name, obj in parts.items():
            obj.hide_render = name not in mechanical["central_emblem_and_grip"]
        center_position = Vector((0, -.045, .50))
        frames.append(capture(camera, center_position, .30, direction, output / "03-central-emblem-and-grip-candidates.png"))
    finally:
        for name, obj in parts.items():
            obj.hide_render = original_visibility[name]
    return {"frames": frames,
            "scope": "Actual rest-pose bow parts in a fixed profile and isolated candidate regions; no fabricated string, draw or hand contact."}


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("asset", choices=SOURCES)
    parser.add_argument("source", type=Path)
    parser.add_argument("reference_directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--provider-receipt", type=Path, required=True)
    parser.add_argument("--verified-clay", type=Path, help="Optional exact verified Blender intake to capture")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source = args.source.resolve(strict=True)
    if file_hash(source) != SOURCES[args.asset]:
        raise ValueError("The diagnostic is specific to the exact original-plate Detailed job exports.")
    refs = verify_reference(args.reference_directory, args.asset)
    provenance = verify_receipt(args.provider_receipt, args.asset, SOURCES[args.asset], refs)
    report = raw_probe(source, args.asset)
    report["providerReceipt"] = provenance
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    if args.verified_clay is not None:
        intake = json.loads((args.verified_clay / "accessory-clay-review.json").read_text())
        editable = args.verified_clay / f"icarus-{args.asset}-provider-rest.blend"
        if (intake["sourceSha256"] != SOURCES[args.asset] or not intake["multipartForVisualReview"]
                or intake["providerReceipt"] != provenance or file_hash(editable) != intake["editableBlendSha256"]):
            raise ValueError("The Blender intake must match the verified exact clay geometry.")
        bpy.ops.wm.open_mainfile(filepath=str(editable))
        objects = {obj.name: obj for obj in meshes()}
        if objects.keys() != report["parts"].keys():
            raise ValueError("Editable Blender object names do not preserve the verified provider part IDs.")
        camera, center, scale, direction = stage_camera(args.asset, objects.values())
        probe = wing_probe if args.asset == "wing" else bow_probe
        report["blenderCapture"] = probe(objects, report, output, camera, center, scale, direction)
        if file_hash(editable) != intake["editableBlendSha256"]:
            raise ValueError("The stored editable Blender rest geometry changed.")
    (output / "accessory-clay-part-probe.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
