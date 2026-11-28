"""Extend the actual fresh Tripo string fragment for private clay review."""

from argparse import ArgumentParser
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_probe_icarus_clay_parts import SOURCES, capture, key, stage_camera
from blender_review_icarus_accessory_clay import array_values, file_hash, meshes, rest_snapshot


SOURCE = SOURCES["bow"]
FRAGMENT = key(52)
NOCKS = (key(63), key(44))
DRAW = "Private fixed-nock draw diagnostic"


def world_points(obj, mesh):
    local = array_values(mesh.vertices, "co", 3, np.float32)
    transform = np.asarray(obj.matrix_world)
    return local @ transform[:3, :3].T + transform[:3, 3]


def local_points(obj, world):
    inverse = np.asarray(obj.matrix_world.inverted())
    return (world @ inverse[:3, :3].T + inverse[:3, 3]).astype(np.float32)


def nock_anchor(obj, transverse, fragment_height=None):
    points = world_points(obj, obj.data)
    radial = np.linalg.norm(points[:, :2] - transverse, axis=1)
    near = points[radial <= .004]
    if not len(near):
        raise ValueError(f"{obj.name} has no actual surface in the inherited string corridor.")
    target_z = np.median(near[:, 2]) if fragment_height is None else fragment_height
    distance = np.abs(near[:, 2] - target_z)
    anchor = near[np.argsort(distance)[:min(len(near), 24)]].mean(axis=0)
    return anchor


def closure_evidence(raw):
    probe = raw["stringProbe"]
    empty = probe["longestSpanWithNoTriangleBoundsY"]
    fragment = probe["vertexEdgeComponentEvidence"][FRAGMENT]["largestBySpan"][0]
    if empty is None or empty[1] - empty[0] < .20 or fragment["yExtent"][1] - fragment["yExtent"][0] < .10:
        raise ValueError("A disconnected full-size string and usable generated fragment were not established.")
    for part, row in probe["vertexEdgeComponentEvidence"].items():
        if part in (*NOCKS, FRAGMENT):
            continue
        for item in row["largestBySpan"]:
            low, high = item["yExtent"]
            if high - low > .10:
                raise ValueError(f"{part} has overlapping connected string-like geometry requiring separate review.")
    return probe


def make_extended_string(objects, raw):
    source = objects[FRAGMENT]
    if source.data.shape_keys is not None:
        raise ValueError("The fresh source fragment must consist of editable rest geometry.")
    points = world_points(source, source.data)
    low, high = points.min(axis=0), points.max(axis=0)
    parameter = (points[:, 2] - low[2]) / (high[2] - low[2])
    transverse = (low[:2] + high[:2]) / 2
    start = nock_anchor(objects[NOCKS[0]], transverse, float(low[2]))
    end = nock_anchor(objects[NOCKS[1]], transverse)
    if not end[2] - start[2] > .60:
        raise ValueError("The actual nock surfaces do not anchor a full-height string.")
    axis = start + parameter[:, None] * (end - start)
    extended = axis.copy()
    extended[:, :2] += points[:, :2] - transverse
    rest = local_points(source, extended)
    source.data.vertices.foreach_set("co", rest.ravel())
    source.data.update()
    rest_key = source.shape_key_add(name="Basis")
    draw_key = source.shape_key_add(name=DRAW)
    displacement = np.interp(parameter, [0, .5, 1], [0, .10, 0])
    drawn = extended.copy()
    # The source stave is toward negative Blender Y at the center.
    # Pull the string away from the recess in the same vertical bow plane.
    drawn[:, 1] += displacement
    draw_key.data.foreach_set("co", local_points(source, drawn).ravel())
    draw_key.slider_min, draw_key.slider_max, draw_key.value = 0, 1, 0
    rest_key.data.foreach_set("co", rest.ravel())
    bpy.context.view_layer.update()
    rest_receipt = rest_snapshot(source)
    evaluated_rest = evaluated_string(source)
    actual_radial = evaluated_rest[:, :2] - axis[:, :2]
    radial_error = float(np.abs(actual_radial - (points[:, :2] - transverse)).max())
    if radial_error > .000001 or np.linalg.norm(evaluated_rest - extended, axis=1).max() > .000001:
        raise ValueError("The draw fixture changed the source fragment cross section or rest vertices.")
    diagnostic = exercise(source, parameter, evaluated_rest)
    return {
        "sourceFragment": FRAGMENT,
        "recoveredNockCandidateParts": list(NOCKS),
        "startSourceWorldBlenderMeters": start.tolist(),
        "endSourceWorldBlenderMeters": end.tolist(),
        "newAnchorDistanceMeters": float(np.linalg.norm(end - start)),
        "sourceFragmentHeightMeters": float(high[2] - low[2]),
        "sourceCrossSectionXYMeters": (high[:2] - low[:2]).tolist(),
        "crossSectionMaximumErrorMeters": radial_error,
        "stretchMethod": "Longitudinal extension of the existing fresh provider mesh. Original transverse offsets and triangles are preserved.",
        "extendedPart": rest_receipt,
        "drawProbe": diagnostic,
        "sourceEmptyStraightSpan": closure_evidence(raw)["longestSpanWithNoTriangleBoundsY"],
    }


def evaluated_string(source):
    bpy.context.view_layer.update()
    evaluated = source.evaluated_get(bpy.context.evaluated_depsgraph_get())
    temporary = evaluated.to_mesh()
    try:
        return world_points(evaluated, temporary)
    finally:
        evaluated.to_mesh_clear()


def exercise(source, parameter, rest):
    shape = source.data.shape_keys.key_blocks[DRAW]
    try:
        shape.value = 1
        moved = evaluated_string(source)
        deviation = np.linalg.norm(moved - rest, axis=1)
    finally:
        shape.value = 0
    release = evaluated_string(source)
    end_vertices = (parameter == 0) | (parameter == 1)
    anchor_error = float(np.max(deviation[end_vertices]))
    release_error = float(np.max(np.linalg.norm(release - rest, axis=1)))
    if anchor_error > .000001 or release_error > .000001 or deviation.max() < .095:
        raise ValueError("Draw must move the actual string and exactly retain the endpoint/rest positions.")
    return {"maxDrawMeters": float(deviation.max()), "fixedEndpointVertices": int(np.count_nonzero(end_vertices)),
            "maxFixedEndpointDeviationMeters": anchor_error, "maxReleasedRestErrorMeters": release_error,
            "scope": "Fixed-nock engineering deflection only. Limb flex, physical tension and hand contact remain unqualified."}


def render_frames(editable, master, output):
    frames = []
    for path in (master, editable):
        bpy.ops.wm.open_mainfile(filepath=str(path))
        objects = meshes()
        camera, center, scale, direction = stage_camera("bow", objects)
        if path == master:
            frames.append(capture(camera, center, scale * 1.12, direction, output / "01-provider-original.png"))
            continue
        string = next(obj for obj in objects if obj.name == FRAGMENT)
        shape = string.data.shape_keys.key_blocks[DRAW]
        try:
            for filename, weight in (("02-extended-at-rest.png", 0), ("03-draw.png", 1), ("04-release.png", 0)):
                shape.value = weight
                bpy.context.view_layer.update()
                frames.append(capture(camera, center, scale * 1.12, direction, output / filename))
        finally:
            shape.value = 0
    if frames[1]["sha256"] == frames[2]["sha256"]:
        raise ValueError("The render did not show the actual string deflection.")
    return frames


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("verified_clay", type=Path)
    parser.add_argument("gap_probe", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--render-existing", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("Use Blender 5.3 for the private string candidate.")
    master = (args.verified_clay / "icarus-bow-provider-rest.blend").resolve(strict=True)
    intake = json.loads((args.verified_clay / "accessory-clay-review.json").read_text())
    probe = json.loads(args.gap_probe.read_text())
    if (intake["sourceSha256"] != SOURCE or probe["sourceSha256"] != SOURCE
            or intake["providerReceipt"] != probe["providerReceipt"] or file_hash(master) != intake["editableBlendSha256"]):
        raise ValueError("Both exact fresh bow intake and connected-gap evidence are required.")
    closure_evidence(probe)
    output = args.output.resolve()
    editable = output / "icarus-bow-fresh-fragment-extension.blend"
    review = output / "fresh-bowstring-candidate.json"
    if args.render_existing:
        evidence = json.loads(review.read_text())
        if (file_hash(editable) != evidence["candidateSha256"] or file_hash(master) != evidence["sourceRestBlendSha256"]
                or file_hash(args.gap_probe) != evidence["sourceGapEvidenceSha256"]):
            raise ValueError("Pinned private string candidate or evidence changed.")
        folder = output / "renders"
        folder.mkdir(exist_ok=False, mode=0o700)
        capture_receipt = {"candidateSha256": evidence["candidateSha256"], "frames": render_frames(editable, master, folder)}
        (folder / "fresh-bowstring-capture.json").write_text(json.dumps(capture_receipt, indent=2) + "\n")
        return

    bpy.ops.wm.open_mainfile(filepath=str(master))
    bpy.context.view_layer.update()
    objects = {obj.name: obj for obj in meshes()}
    original = {name: rest_snapshot(obj) for name, obj in objects.items()}
    if original != intake["importedObjects"]:
        raise ValueError("Fresh Blender scene has drifted from the imported master.")
    evidence = make_extended_string(objects, probe)
    if (original[FRAGMENT]["triangles"] != evidence["extendedPart"]["triangles"]
            or original[FRAGMENT]["vertices"] != evidence["extendedPart"]["vertices"]
            or original[FRAGMENT]["matrixWorld"] != evidence["extendedPart"]["matrixWorld"]
            or original[FRAGMENT]["materials"] != evidence["extendedPart"]["materials"]):
        raise ValueError("Extending the fragment changed its topology, material or transform.")
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    bpy.ops.wm.save_as_mainfile(filepath=str(editable), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(editable))
    bpy.context.view_layer.update()
    reopened = {obj.name: rest_snapshot(obj) for obj in meshes()}
    expected = dict(original)
    expected[FRAGMENT] = evidence["extendedPart"]
    if reopened != expected or file_hash(master) != intake["editableBlendSha256"]:
        raise ValueError("The saved candidate changed provider geometry outside of the exact fragment.")
    evidence.update({
        "classification": "PRIVATE_PRE_UV_REST_AND_DRAW_DIAGNOSTIC",
        "sourceRestBlendSha256": file_hash(master),
        "sourceGapEvidenceSha256": file_hash(args.gap_probe),
        "candidateSha256": file_hash(editable),
        "unchangedProviderParts": len(original) - 1,
        "sourceSha256": SOURCE,
        "nextGate": "Owner review of the clay geometry and exact outline before UV or coloring.",
    })
    review.write_text(json.dumps(evidence, indent=2) + "\n")


if __name__ == "__main__":
    main()
