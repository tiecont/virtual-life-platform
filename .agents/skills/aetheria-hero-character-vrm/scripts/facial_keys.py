"""Create relative Blender shape keys from vertex-matched targets and audit deltas."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy


EXPRESSIONS = ("Blink_L", "Blink_R", "Smile", "Frown", "Shout")
VISEMES = {
    "PP": ["p", "b", "m"],
    "FF": ["f", "v"],
    "TH": ["θ", "ð"],
    "DD": ["t", "d", "ɾ"],
    "kk": ["k", "g", "ŋ"],
    "CH": ["tʃ", "dʒ", "ʃ", "ʒ"],
    "SS": ["s", "z"],
    "nn": ["n", "l"],
    "RR": ["ɹ", "r"],
    "aa": ["ɑ", "æ", "ʌ", "a"],
    "E": ["ɛ", "e", "eɪ"],
    "ih": ["ɪ", "i", "iː", "j"],
    "oh": ["ɔ", "o", "oʊ"],
    "ou": ["ʊ", "u", "uː", "w"],
}
SPEECH = tuple(f"Viseme_{label}" for label in VISEMES)


def basis(obj):
    keys = obj.data.shape_keys
    return keys.reference_key.data if keys else obj.data.vertices


def write_keys(obj, targets, *, minimum=1e-5):
    """Write local-space targets in Basis order. Reject the whole batch before mutation."""
    if obj.type != "MESH" or obj.data.users != 1:
        raise ValueError("expected a single-user mesh")
    keys = obj.data.shape_keys
    if keys and not keys.use_relative:
        raise ValueError("expected relative shape keys")
    reference = basis(obj)
    prepared = {}
    for name, points in targets.items():
        if not name or name == "Basis" or len(name.encode()) > 63 or (keys and name in keys.key_blocks):
            raise ValueError(f"unavailable shape key name: {name!r}")
        coordinates = [tuple(point) for point in points]
        if len(coordinates) != len(reference) or any(
            len(p) != 3 or not all(math.isfinite(v) for v in p) for p in coordinates
        ):
            raise ValueError(f"{name}: mismatched or nonfinite coordinates")
        if not any(math.dist(p, ref.co) >= minimum for p, ref in zip(coordinates, reference)):
            raise ValueError(f"{name}: no meaningful displacement")
        prepared[name] = coordinates
    if prepared and not keys:
        obj.shape_key_add(name="Basis", from_mix=False)
    for name, coordinates in prepared.items():
        key = obj.shape_key_add(name=name, from_mix=False)
        key.data.foreach_set("co", [component for point in coordinates for component in point])
    return tuple(prepared)


def topology(mesh):
    return (len(mesh.vertices), [tuple(e.vertices) for e in mesh.edges],
            [tuple(p.vertices) for p in mesh.polygons])


def from_target_objects(obj, targets):
    """Targets must preserve vertex, edge and polygon order. Use baked mesh coordinates."""
    signature = topology(obj.data)
    points = {}
    transform = obj.matrix_world.inverted()
    for key, target in targets.items():
        if target.type != "MESH" or topology(target.data) != signature:
            raise ValueError(f"{key}: {target.name} does not match ordered Basis topology")
        to_local = transform @ target.matrix_world
        points[key] = [to_local @ datum.co for datum in basis(target)]
    return write_keys(obj, points)


def audit(objects, required, minimum=1e-5):
    """Measure named relative keys across one or more meshes, including duplicate vectors."""
    objects = tuple(objects)
    report = {}
    errors = []
    vectors = {}
    for name in required:
        entries = {}
        vector = []
        for obj in objects:
            keys = obj.data.shape_keys
            key = keys.key_blocks.get(name) if keys else None
            ref = basis(obj)
            if not key:
                vector.extend([(0.0, 0.0, 0.0)] * len(ref))
                continue
            if not keys.use_relative or key.relative_key != keys.reference_key:
                errors.append(f"{obj.name}/{name}: expected relative to Basis")
            deltas = [tuple(pt.co - src.co) for pt, src in zip(key.data, ref)]
            vector.extend(deltas)
            distances = [math.hypot(*delta) for delta in deltas]
            if any(not math.isfinite(d) for d in distances):
                errors.append(f"{obj.name}/{name}: nonfinite displacement")
                continue
            entries[obj.name] = {
                "moved_vertices": sum(d >= minimum for d in distances),
                "max_local_displacement": max(distances, default=0.0),
            }
        if not any(item["moved_vertices"] for item in entries.values()):
            errors.append(f"{name}: missing or no meaningful displacement")
        for prior, prior_vector in vectors.items():
            if all(math.dist(a, b) < minimum for a, b in zip(vector, prior_vector)):
                errors.append(f"{name}: duplicates {prior}")
                break
        vectors[name] = vector
        report[name] = entries
    return {"passed": not errors, "errors": errors, "keys": report}


def control_driver(animated, property_name, control, channel, *, index=None, scale=1.0):
    """Bind one property to one independent custom property on the controller."""
    curve = animated.driver_add(property_name) if index is None else animated.driver_add(property_name, index)
    driver = curve.driver
    driver.type = "SCRIPTED"
    variable = driver.variables.new()
    variable.name = "control"
    variable.type = "SINGLE_PROP"
    variable.targets[0].id = control
    variable.targets[0].data_path = f'["{channel}"]'
    driver.expression = f"control * {scale:g}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    create = subparsers.add_parser("create", help="Create keys on an opened Blend from existing target meshes")
    create.add_argument("--object", required=True)
    create.add_argument("--targets", type=Path, required=True, help='JSON {"Key": "TargetObject"}')
    create.add_argument("--output", type=Path, required=True)
    check = subparsers.add_parser("validate", help="Validate a key set in an opened Blend")
    check.add_argument("--objects", nargs="+", required=True)
    check.add_argument("--required", nargs="+", default=EXPRESSIONS + SPEECH)
    check.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if args.command == "create":
        if args.output.exists():
            raise ValueError("choose a new output Blend")
        names = json.loads(args.targets.read_text())
        from_target_objects(bpy.data.objects[args.object],
                            {key: bpy.data.objects[target] for key, target in names.items()})
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()))
        return
    report = audit([bpy.data.objects[name] for name in args.objects], args.required)
    args.report.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    if not report["passed"]:
        raise ValueError("; ".join(report["errors"]))


if __name__ == "__main__":
    main()
