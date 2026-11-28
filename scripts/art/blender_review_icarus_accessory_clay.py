"""Review a fresh provider geometry-only Icarus accessory before UV and color work."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys
from uuid import UUID

import bpy
from mathutils import Vector
import numpy as np


REFERENCES = {
    "wing": (
        "db04e13666b960c33bd233ce147ab39a59addf04733fc2e063b4605c8eb18b78",
        "c67f51f2e87a28f14fa00d84d30e50578a83aa9e0e3dc824a005e617fef96f86",
        "d79ce9d24c44a369eb2387329c13828eb2ede11ed837716b3929a0a3559ee231",
        "e6ebd31b3fe1d126567f72af903c59c96aea29cf2998fa55adfcc8ab975a9576",
    ),
    "bow": (
        "eb788234ab3eb63c8d62da04d6048644be699c3aa02346313a0b3bc5b2b71681",
        "bc324904a902ebac58b7fe4c57b9c0ec48a45cabe2cc455ab4764232c9fb55c8",
        "988da6190d5e9d659a8d46d1388a3f606a14283d4026c9b359fe70d62054c39d",
        "5e32c8e94fed6beffc4673aab70c3d3482dcf106204f1ff7e12fbe5bf78f403b",
    ),
}
REFERENCE_FILES = ("01_front.png", "02_left.png", "03_right.png", "04_back.png")
SUPERSEDED = {
    "be86f92ab8aff6e22e9a3f7f9a8e355305aa0f7b7329926f800be2d7605f4524",
    "66780394c3379c820070bcaaf8af869c366ac92a8010ab39491a75d7a05723c1",
    "a05078323c57b899db69779225e951a24a10d870f818c77b6b55f43e57fda119",
    "8384d2be36fe9abf8c439503a4c478b80489e2d89ff84812091b787c2bc18e25",
}


def file_hash(path):
    return sha256(path.read_bytes()).hexdigest()


def glb_document(path):
    with path.open("rb") as file:
        magic, version, length, json_length, chunk = struct.unpack("<4sIIII", file.read(20))
        if (magic, version, length, chunk) != (b"glTF", 2, path.stat().st_size, 0x4E4F534A):
            raise ValueError("The source export must be a complete GLB v2.")
        return json.loads(file.read(json_length))


def provider_inventory(document):
    scenes = document["scenes"]
    nodes = document["nodes"]
    roots = scenes[document.get("scene", 0)]["nodes"]

    def active(indices):
        for index in indices:
            yield index
            yield from active(nodes[index].get("children", []))

    declared = []
    for index in active(roots):
        node = nodes[index]
        if "mesh" not in node:
            continue
        mesh = document["meshes"][node["mesh"]]
        primitives = []
        for primitive in mesh["primitives"]:
            if primitive.get("mode", 4) != 4 or primitive.get("targets"):
                raise ValueError("The clay intake requires static triangle geometry.")
            accessor = primitive.get("indices", primitive["attributes"]["POSITION"])
            count = document["accessors"][accessor]["count"]
            if count == 0 or count % 3 != 0:
                raise ValueError("The source primitive does not contain complete triangles.")
            primitives.append({"materialIndex": primitive.get("material"), "triangles": count // 3})
        declared.append({
            "nodeIndex": index,
            "nodeName": node.get("name", ""),
            "meshIndex": node["mesh"],
            "meshName": mesh.get("name", ""),
            "primitives": primitives,
            "declaredLocalTransform": {field: node[field] for field in ("matrix", "translation", "rotation", "scale") if field in node},
        })
    if not declared:
        raise ValueError("The provider GLB has no active surface nodes.")
    return declared


def array_values(collection, field, width, dtype):
    values = np.empty((len(collection), width), dtype=dtype)
    collection.foreach_get(field, values.ravel())
    return values


def mesh_arrays(mesh):
    mesh.calc_loop_triangles()
    return (
        array_values(mesh.vertices, "co", 3, np.float32),
        array_values(mesh.loop_triangles, "vertices", 3, np.int32),
        array_values(mesh.loop_triangles, "material_index", 1, np.int32).ravel(),
    )


def rest_snapshot(obj):
    vertices, triangles, slots = mesh_arrays(obj.data)
    if not len(triangles) or not np.isfinite(vertices).all():
        raise ValueError(f"{obj.name} lacks finite triangle geometry.")
    geometry = sha256(vertices.tobytes())
    geometry.update(triangles.tobytes())
    geometry.update(slots.tobytes())
    return {
        "meshName": obj.data.name,
        "geometrySha256": geometry.hexdigest(),
        "vertices": len(vertices),
        "triangles": len(triangles),
        "sourceMeshDataUsers": obj.data.users,
        "parent": obj.parent.name if obj.parent else None,
        "matrixLocal": [list(row) for row in obj.matrix_local],
        "matrixWorld": [list(row) for row in obj.matrix_world],
        "materials": [{"name": material.name if material else None,
                       "triangles": int(np.count_nonzero(slots == index))}
                      for index, material in enumerate(obj.data.materials)],
    }


def meshes():
    return sorted((obj for obj in bpy.context.scene.objects if obj.type == "MESH"), key=lambda obj: obj.name)


def probe_independence(objects, initial):
    results = []
    view_layer = bpy.context.view_layer
    for obj in objects:
        rest = obj.location.copy()
        before = obj.matrix_world.translation.copy()
        mesh_shared = any(other != obj and other.data == obj.data for other in objects)
        try:
            obj.location.x += 0.03125
            view_layer.update()
            distance = (obj.matrix_world.translation - before).length
            moved_others = [other.name for other in objects if other != obj
                            and [list(row) for row in other.matrix_world] != initial[other.name]["matrixWorld"]]
        finally:
            obj.location = rest
            view_layer.update()
        if initial[obj.name]["matrixWorld"] != [list(row) for row in obj.matrix_world]:
            raise ValueError(f"Could not exactly restore the original transform of {obj.name}.")
        results.append({"object": obj.name, "movementProbeMeters": distance, "affectedOtherObjects": moved_others,
                        "sharedMeshData": mesh_shared,
                        "independentlyMoveableAndEditable": distance > 0.0001 and not moved_others and not mesh_shared})
    if initial != {obj.name: rest_snapshot(obj) for obj in objects}:
        raise ValueError("The provider topology, material assignment or rest transform changed during inspection.")
    return results


def capture(objects, asset, output):
    """Render the real surfaces with studio clay and optional object IDs."""
    scene = bpy.context.scene
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    bounds = np.asarray([tuple(point) for point in points])
    extent = bounds.max(axis=0) - bounds.min(axis=0)
    center = Vector((bounds.max(axis=0) + bounds.min(axis=0)) / 2)
    scale = float(np.linalg.norm(extent))
    if not scale:
        raise ValueError("Asset bounds have no extent.")
    # Wing spans were previously supplied on either horizontal source axis.
    # This changes the camera only, preserving the untouched provider rest transforms.
    camera_x = extent[1] >= extent[0] if asset == "wing" else extent[0] < extent[1]
    face = Vector((1, 0, 0)) if camera_x else Vector((0, 1, 0))
    across = Vector((0, 1, 0)) if camera_x else Vector((1, 0, 0))
    camera = bpy.data.objects.new("Private clay camera", bpy.data.cameras.new("Private clay camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    if asset == "bow":
        scene.render.resolution_x, scene.render.resolution_y = 720, 960
        camera.data.ortho_scale = scale * 1.12
    else:
        scene.render.resolution_x, scene.render.resolution_y = 1024, 768
        camera.data.ortho_scale = scale * 1.06
    scene.render.resolution_percentage = 100
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.image_settings.file_format = "PNG"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.show_cavity = True
    shading.background_type = "WORLD"
    shading.color_type = "SINGLE"
    shading.single_color = (.70, .70, .70)
    directions = (
        ("face-a", face),
        ("face-b", -face),
        ("profile-a", across),
        ("profile-b", -across),
        ("quarter-a", face + .72 * across + Vector((0, 0, .19))),
        ("quarter-b", -face - .72 * across + Vector((0, 0, .19))),
    )
    frames = []
    for style in ("clay", "object-colors"):
        if style == "object-colors":
            shading.color_type = "RANDOM"
        for view, vector in directions if style == "clay" else directions[:2]:
            camera.location = center + vector.normalized() * scale * 3
            camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
            filename = output / f"{style}-{view}.png"
            scene.render.filepath = str(filename)
            bpy.ops.render.render(write_still=True)
            frames.append({"file": filename.name, "sha256": file_hash(filename), "cameraDirection": list(vector.normalized())})
    return {"assetBoundsMeters": extent.tolist(), "frames": frames}


def verify_reference(directory, asset):
    evidence = []
    for filename, expected in zip(REFERENCE_FILES, REFERENCES[asset], strict=True):
        actual = file_hash(directory / filename)
        if actual != expected:
            raise ValueError(f"{filename} differs from the original owner reference bytes.")
        evidence.append({"file": filename, "sha256": actual})
    return evidence


def verify_receipt(path, asset, source_sha, references):
    data = path.read_bytes()
    receipt = json.loads(data)
    expected_asset = "wings" if asset == "wing" else "bow"
    expected_refs = {row["file"]: row["sha256"] for row in references}
    if (receipt["asset"] != expected_asset or receipt["state"] != "downloaded"
            or receipt["parts"] != "Detailed" or receipt["texture"] is not False
            or receipt["sha256"] != source_sha or receipt["refs"] != expected_refs):
        raise ValueError("The provider receipt must bind the downloaded geometry and four original references.")
    return {
        "taskId": str(UUID(receipt["task"])),
        "provider": receipt["provider"],
        "visibility": receipt["visibility"],
        "sha256": sha256(data).hexdigest(),
    }


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("asset", choices=REFERENCES)
    parser.add_argument("source", type=Path)
    parser.add_argument("reference_directory", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--provider-receipt", type=Path, required=True)
    parser.add_argument("--render-existing", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("Use Blender 5.3 for the private clay intake.")
    source = args.source.resolve(strict=True)
    actual = file_hash(source)
    if actual in SUPERSEDED:
        raise ValueError("Expected the pinned fresh provider geometry, distinct from the superseded mesh.")
    reference = verify_reference(args.reference_directory.resolve(strict=True), args.asset)
    provenance = verify_receipt(args.provider_receipt.resolve(strict=True), args.asset, actual, reference)
    output = args.output.resolve()
    review = output / "accessory-clay-review.json"
    editable = output / f"icarus-{args.asset}-provider-rest.blend"
    if args.render_existing:
        before = json.loads(review.read_text())
        if (actual != before["sourceSha256"] or provenance != before["providerReceipt"]
                or args.asset != before["asset"] or reference != before["referenceFiles"]
                or file_hash(editable) != before["editableBlendSha256"]):
            raise ValueError("The existing private source, editable artifact or reference pins changed.")
        bpy.ops.wm.open_mainfile(filepath=str(editable))
        renders = output / "renders"
        renders.mkdir(exist_ok=False, mode=0o700)
        capture_review = capture(meshes(), args.asset, renders)
        capture_review.update({"sourceSha256": actual, "editableBlendSha256": file_hash(editable)})
        (renders / "clay-capture.json").write_text(json.dumps(capture_review, indent=2) + "\n")
        return

    document = glb_document(source)
    source_objects = provider_inventory(document)
    source_triangles = sum(part["triangles"] for obj in source_objects for part in obj["primitives"])
    geometry_only = not any(document.get(key) for key in ("images", "textures", "animations", "skins"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.ops.import_scene.gltf(filepath=str(source)) != {"FINISHED"}:
        raise RuntimeError("Blender did not import the fresh provider GLB.")
    objects = meshes()
    bpy.context.view_layer.update()
    initial = {obj.name: rest_snapshot(obj) for obj in objects}
    if sum(obj["triangles"] for obj in initial.values()) != source_triangles:
        raise ValueError("Blender did not preserve the declared triangle count.")
    independence = probe_independence(objects, initial)
    editing_ready = geometry_only and len(objects) >= 2 and all(row["independentlyMoveableAndEditable"] for row in independence)

    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    bpy.ops.wm.save_as_mainfile(filepath=str(editable), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(editable))
    if initial != {obj.name: rest_snapshot(obj) for obj in meshes()} or file_hash(source) != actual:
        raise ValueError("Editable reload changed a provider input, rest pose or triangle data.")
    facts = {
        "classification": "PRIVATE_PRE_UV_CLAY_REVIEW",
        "asset": args.asset,
        "providerReceipt": provenance,
        "sourceSha256": actual,
        "referenceFiles": reference,
        "declaredProviderSurfaceNodes": source_objects,
        "sourceSceneNodes": len(document["nodes"]),
        "sourceMaterialNames": [row.get("name") for row in document.get("materials", [])],
        "sourceTextures": len(document.get("textures", [])),
        "sourceEmbeddedImages": len(document.get("images", [])),
        "sourceAnimations": len(document.get("animations", [])),
        "sourceSkins": len(document.get("skins", [])),
        "geometryOnly": geometry_only,
        "triangles": source_triangles,
        "importedObjects": initial,
        "editProbes": independence,
        "editableBlendSha256": file_hash(editable),
        "multipartForVisualReview": editing_ready,
        "restGeometryAndTransformsRoundTrip": True,
        "nextGate": "Owner review of actual silhouette and intended mechanical components before any UV, colors or rigging.",
    }
    review.write_text(json.dumps(facts, indent=2) + "\n")
    if not editing_ready:
        raise ValueError("Intake retained the diagnostic, but the provider did not deliver independently editable geometry-only parts.")


if __name__ == "__main__":
    main()
