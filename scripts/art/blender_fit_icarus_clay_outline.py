"""Create a private span-fit trial for the fresh Icarus clay accessories."""

from argparse import ArgumentParser
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_probe_icarus_clay_parts import SOURCES, capture, stage_camera
from blender_review_icarus_accessory_clay import array_values, file_hash, meshes, verify_reference


def positions(collection):
    return array_values(collection, "co", 3, np.float32)


def topology_hash(mesh):
    from hashlib import sha256
    mesh.calc_loop_triangles()
    result = sha256(array_values(mesh.loop_triangles, "vertices", 3, np.int32))
    result.update(array_values(mesh.loop_triangles, "material_index", 1, np.int32))
    return result.hexdigest()


def load_pins(args):
    intake = json.loads((args.intake / "accessory-clay-review.json").read_text())
    if intake["sourceSha256"] != SOURCES[args.asset] or not intake["multipartForVisualReview"]:
        raise ValueError("Expected an exact fresh multipart clay intake.")
    if args.asset == "bow":
        if args.bow_repair is None:
            raise ValueError("Preserve the proved center bowstring repair in the fit trial.")
        baseline = args.bow_repair / "icarus-bow-fresh-fragment-extension.blend"
        repair = json.loads((args.bow_repair / "fresh-bowstring-candidate.json").read_text())
        if repair["sourceSha256"] != SOURCES["bow"] or repair["sourceRestBlendSha256"] != intake["editableBlendSha256"]:
            raise ValueError("Wrong bow fragment repair.")
        expected = repair["candidateSha256"]
    else:
        baseline = args.intake / "icarus-wing-provider-rest.blend"
        expected = intake["editableBlendSha256"]
    if file_hash(baseline) != expected:
        raise ValueError("The pinned editable baseline changed.")
    refs = verify_reference(args.references, args.asset)
    outline = json.loads((args.intake / "outline-comparison.json").read_text())
    face = next(row for row in outline["views"] if Path(row["render"]).name == "clay-face-a.png")
    reference = refs[0 if args.asset == "wing" else 1]["sha256"]
    if outline["plateSha256"] != reference or face["renderSha256"] != file_hash(args.intake / "renders/clay-face-a.png"):
        raise ValueError("The original-width study does not bind the actual native plate and clay render.")
    return baseline, expected, face["widthRatio"]


def fit(asset, ratio):
    objects = meshes()
    identity = Matrix.Identity(4)
    if any(obj.matrix_world != identity or obj.data.users != 1 for obj in objects):
        raise ValueError("The fresh intake must retain independently editable identity-space meshes.")
    axis = 0 if asset == "wing" else 1
    lower = min(obj.data.vertices[0].co[axis] for obj in objects)
    upper = lower
    for obj in objects:
        values = positions(obj.data.vertices)[:, axis]
        lower = min(lower, float(values.min()))
        upper = max(upper, float(values.max()))
    width = upper - lower
    target = width / ratio
    protected = {"tripo_part_56"} if asset == "wing" else {"tripo_part_6", "tripo_part_43", "tripo_part_44",
                                                          "tripo_part_52", "tripo_part_63"}
    if not protected.issubset({obj.name for obj in objects}):
        raise ValueError("A protected mount, nock or string part is missing.")
    if asset == "wing":
        inner = .13
        if lower > -.49 or upper < .49 or not 1 < target / width < 1.10:
            raise ValueError("The wing span study is outside the measured trial range.")

        def map_axis(values):
            distances = np.abs(values)
            run = np.where(values >= 0, upper, -lower) - inner
            blend = np.clip((distances - inner) / run, 0, 1)
            return values + np.sign(values) * (target - width) * .5 * blend ** 2
    else:
        protected_objects = [obj for obj in objects if obj.name in protected]
        inner = min(float(positions(obj.data.vertices)[:, axis].min()) for obj in protected_objects)
        shift = width - target
        if not 0 < shift < (inner - lower) / 2:
            raise ValueError("Bow recess fitting would cease to be monotonic.")

        def map_axis(values):
            blend = np.clip((inner - values) / (inner - lower), 0, 1)
            return values + shift * blend ** 2

    exact_protected = {}
    for obj in objects:
        mesh = obj.data
        before = topology_hash(mesh)
        layers = [mesh.vertices]
        if mesh.shape_keys is not None:
            layers.extend(item.data for item in mesh.shape_keys.key_blocks)
        for layer in layers:
            source = positions(layer)
            mapped = source.copy()
            mapped[:, axis] = map_axis(source[:, axis])
            if obj.name in protected:
                if not np.array_equal(source, mapped):
                    raise ValueError(f"Fitting would alter protected {obj.name}.")
                exact_protected[obj.name] = file_hash_mesh_coords(source)
            elif not np.array_equal(source, mapped):
                layer.foreach_set("co", mapped.ravel())
        mesh.update()
        if topology_hash(mesh) != before or obj.matrix_world != identity:
            raise ValueError(f"The trial altered topology or rest object transform of {obj.name}.")
    after = [positions(obj.data.vertices)[:, axis] for obj in objects]
    actual = max(float(values.max()) for values in after) - min(float(values.min()) for values in after)
    if abs(actual - target) > .000002:
        raise ValueError("Shared transform did not realize the measured target width.")
    return {"widthBefore": width, "requestedWidth": target, "widthAfter": actual, "axis": "XYZ"[axis],
            "protectionBoundary": inner, "exactProtectedCoordinateHashes": exact_protected,
            "unchangedAxes": ["XYZ"[index] for index in range(3) if index != axis],
            "approach": "Shared smooth monotonic one-axis transform, applied to actual 3D vertices only."}


def file_hash_mesh_coords(vertices):
    from hashlib import sha256
    return sha256(vertices).hexdigest()


def views(asset):
    if asset == "wing":
        return (("front", (0, 1, 0)), ("back", (0, -1, 0)),
                ("left-quarter", (-1, .48, .10)), ("right-quarter", (1, .48, .10)))
    return (("left", (1, 0, 0)), ("right", (-1, 0, 0)), ("thin-front", (0, 1, 0)),
            ("thin-back", (0, -1, 0)))


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("asset", choices=SOURCES)
    parser.add_argument("intake", type=Path)
    parser.add_argument("references", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--bow-repair", type=Path)
    parser.add_argument("--render-existing", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("Use Blender 5.3 for the original-plate fit trial.")
    baseline, sha, ratio = load_pins(args)
    output = args.output.resolve()
    candidate = output / f"icarus-{args.asset}-private-plate-fit.blend"
    receipt = output / "plate-fit-trial.json"
    if args.render_existing:
        evidence = json.loads(receipt.read_text())
        if evidence["sourceBlendSha256"] != sha or evidence["candidateSha256"] != file_hash(candidate):
            raise ValueError("The trial candidate or baseline changed after fitting.")
        renders = output / "renders"
        renders.mkdir(exist_ok=False, mode=0o700)
        frames = []
        framing = None
        for source, label in ((baseline, "baseline"), (candidate, "trial")):
            bpy.ops.wm.open_mainfile(filepath=str(source))
            camera, center, scale, _ = stage_camera(args.asset, meshes())
            if framing is None:
                framing = center, scale * 1.22
            for view, direction in views(args.asset):
                frame = capture(camera, *framing, Vector(direction), renders / f"{view}-{label}.png")
                frames.append({"view": view, "asset": label, "cameraDirection": direction, **frame})
        (renders / "plate-fit-trial-capture.json").write_text(json.dumps({"frames": frames}, indent=2) + "\n")
        return
    bpy.ops.wm.open_mainfile(filepath=str(baseline))
    bpy.context.view_layer.update()
    evidence = fit(args.asset, ratio)
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate), compress=True)
    if file_hash(baseline) != sha:
        raise ValueError("The original editable baseline was modified.")
    evidence.update({
        "classification": "PRIVATE_PLATE_FIT_TRIAL_REVIEW_REQUIRED",
        "sourceBlendSha256": sha,
        "candidateSha256": file_hash(candidate),
        "primaryPlateWidthRatio": ratio,
        "adoption": "Compare actual baseline and trial renders against primary and independent original plates before any adoption.",
    })
    receipt.write_text(json.dumps(evidence, indent=2) + "\n")


if __name__ == "__main__":
    main()
