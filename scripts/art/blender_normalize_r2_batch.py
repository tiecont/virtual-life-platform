#!/usr/bin/env python3
"""Blender 5.3 batch normalizer and R2 manifest generator.

Run from a Blender 5.3 background process:

  blender --background --factory-startup \
    --python scripts/art/blender_normalize_r2_batch.py -- \
    --plan artifacts/art/batch-plan.json \
    --review-output artifacts/art/normalized \
    --report artifacts/art/batch-report.json

The script reads a JSON plan:

  {
    "schemaVersion": 1,
    "defaults": {
      "version": "1.0.0",
      "stage": "review",
      "pivotMode": "bottom-center"
    },
    "assets": [
      {
        "assetId": "pet-example",
        "source": "/absolute/or/plan-relative/example.glb",
        "version": "1.0.0",
        "stage": "review",
        "targetHeightMeters": 1.25,
        "pivotMode": "bottom-center",
        "triangleBudget": [24000, 12000, 3000],
        "filename": "pet-example.glb"
      }
    ]
  }

Supported source extensions are .glb, .gltf, .fbx, .obj and .blend. The first
triangle budget is enforced as LOD0 and the supplied sequence must be
non-increasing. Export is normalized GLB only. The script never writes a
manifest when the actual exported GLB is missing or exceeds budget.

By default, normalized files are written to the repository cache path
`.cache/assets/<assetId>/<version>/<filename>`, and schema-compatible manifests
are written to `assets/manifests/<assetId>.manifest.json`. Both paths can be
overridden, but manifest-local cache paths remain repository-relative as
required by the existing asset manifest schema. Existing different bytes are
never overwritten.

`--dry-run` imports, scales, pivots, measures evaluated geometry and reports the
would-be paths/hashes without writing an export, cache file, manifest or report.
No network, credentials, paid provider calls or deletion are performed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


SCHEMA_VERSION = 1
MANIFEST_KEYS = (
    "id",
    "version",
    "stage",
    "s3Key",
    "sha256",
    "sizeBytes",
    "contentType",
    "localCachePath",
)
ASSET_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
VERSION_RE = re.compile(
    r"^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
    r"(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$"
)
STAGES = {"reference", "blockout", "candidate", "review", "delivery"}
PIVOT_MODES = {"bottom-center", "bounds-center", "source-origin"}
SOURCE_SUFFIXES = {".glb", ".gltf", ".fbx", ".obj", ".blend"}


class BatchError(RuntimeError):
    """A user-actionable validation or export failure."""


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True, help="batch plan JSON")
    parser.add_argument(
        "--manifest-dir",
        help="manifest output directory (default: <repo>/assets/manifests)",
    )
    parser.add_argument(
        "--cache-root",
        help="normalized cache root (default: <repo>/.cache/assets)",
    )
    parser.add_argument(
        "--review-output",
        help="optional directory for an identical review copy of each GLB",
    )
    parser.add_argument(
        "--report",
        help="optional JSON report path; refuses to replace an existing report",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate and measure without writing any files",
    )
    return parser.parse_args(argv)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def no_symlink_file(path: Path, label: str, *, must_exist: bool = True) -> Path:
    resolved = path.resolve(strict=False)
    current = resolved
    while True:
        if current.exists() and current.is_symlink():
            raise BatchError(f"{label} may not be a symlink: {current}")
        if current.parent == current:
            break
        current = current.parent
    if must_exist:
        try:
            info = resolved.stat()
        except FileNotFoundError as error:
            raise BatchError(f"{label} does not exist: {resolved}") from error
        if not resolved.is_file() or resolved.is_symlink():
            raise BatchError(f"{label} must be a regular non-symlink file: {resolved}")
        if info.st_size <= 0:
            raise BatchError(f"{label} is empty: {resolved}")
    return resolved


def strict_object(value: object, label: str, allowed: set[str]) -> dict:
    if not isinstance(value, dict):
        raise BatchError(f"{label} must be an object")
    unknown = set(value) - allowed
    if unknown:
        raise BatchError(f"{label} has unknown fields: {', '.join(sorted(unknown))}")
    return value


def require_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BatchError(f"{label} must be a non-empty string")
    return value


def parse_asset(
    raw: object,
    defaults: dict,
    plan_dir: Path,
    root: Path,
    cache_root: Path,
    manifest_dir: Path,
    review_output: Path | None,
) -> dict:
    asset = strict_object(
        raw,
        "asset",
        {
            "assetId",
            "source",
            "version",
            "stage",
            "targetHeightMeters",
            "pivotMode",
            "triangleBudget",
            "filename",
        },
    )
    merged = {**defaults, **asset}
    asset_id = require_string(merged.get("assetId"), "assetId")
    if not ASSET_ID_RE.fullmatch(asset_id):
        raise BatchError(f"invalid assetId: {asset_id}")

    version = require_string(merged.get("version"), f"{asset_id}.version")
    if not VERSION_RE.fullmatch(version):
        raise BatchError(f"{asset_id}.version must be semantic versioning")

    stage = require_string(merged.get("stage"), f"{asset_id}.stage")
    if stage not in STAGES:
        raise BatchError(f"{asset_id}.stage is invalid")

    source_value = require_string(merged.get("source"), f"{asset_id}.source")
    source_path = Path(source_value)
    if not source_path.is_absolute():
        if ".." in source_path.parts:
            raise BatchError(f"{asset_id}.source may not traverse outside the plan directory")
        source_path = plan_dir / source_path
    source = no_symlink_file(source_path, f"{asset_id}.source")
    if source.suffix.lower() not in SOURCE_SUFFIXES:
        raise BatchError(f"{asset_id}.source has unsupported extension: {source.suffix}")

    target_height = merged.get("targetHeightMeters")
    if (
        isinstance(target_height, bool)
        or not isinstance(target_height, (int, float))
        or not 0.0001 <= float(target_height) <= 1000.0
    ):
        raise BatchError(f"{asset_id}.targetHeightMeters must be in 0.0001..1000")

    pivot_mode = require_string(merged.get("pivotMode"), f"{asset_id}.pivotMode")
    if pivot_mode not in PIVOT_MODES:
        raise BatchError(
            f"{asset_id}.pivotMode must be one of {', '.join(sorted(PIVOT_MODES))}"
        )

    budgets = merged.get("triangleBudget")
    if (
        not isinstance(budgets, list)
        or len(budgets) not in (1, 2, 3)
        or any(isinstance(item, bool) or not isinstance(item, int) or item <= 0 for item in budgets)
    ):
        raise BatchError(f"{asset_id}.triangleBudget must contain 1-3 positive integers")
    if any(left < right for left, right in zip(budgets, budgets[1:])):
        raise BatchError(f"{asset_id}.triangleBudget must be non-increasing LOD0..2")

    filename = merged.get("filename", f"{asset_id}.glb")
    filename = require_string(filename, f"{asset_id}.filename")
    if (
        Path(filename).name != filename
        or not filename.lower().endswith(".glb")
        or filename in {".glb", ".."}
        or any(char in filename for char in "\0\\/?#")
        or not re.fullmatch(r"[A-Za-z0-9._-]+\.glb", filename)
    ):
        raise BatchError(f"{asset_id}.filename must be a safe .glb filename")

    cache_path = cache_root / asset_id / version / filename
    manifest_path = manifest_dir / f"{asset_id}.manifest.json"
    local_cache_relative = Path(".cache/assets") / asset_id / version / filename
    s3_key = f"assets/{asset_id}/{version}/{filename}"
    review_path = review_output / asset_id / version / filename if review_output else None

    return {
        "assetId": asset_id,
        "source": source,
        "version": version,
        "stage": stage,
        "targetHeightMeters": float(target_height),
        "pivotMode": pivot_mode,
        "triangleBudget": budgets,
        "filename": filename,
        "cachePath": cache_path,
        "manifestPath": manifest_path,
        "manifestLocalCachePath": local_cache_relative.as_posix(),
        "s3Key": s3_key,
        "reviewPath": review_path,
        "sourceSha256": sha256_file(source),
        "sourceBytes": source.stat().st_size,
    }


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()


def import_source(source: Path) -> None:
    suffix = source.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(source))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(source))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(source))
    elif suffix == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False)
    else:
        raise BatchError(f"unsupported import source: {source}")


def scene_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.context.scene.objects if obj.type in {"MESH", "ARMATURE", "EMPTY"}]


def evaluated_meshes() -> list[tuple[bpy.types.Object, bpy.types.Mesh]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    result: list[tuple[bpy.types.Object, bpy.types.Mesh]] = []
    for obj in scene_objects():
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        if mesh is None:
            raise BatchError(f"could not evaluate mesh: {obj.name}")
        result.append((evaluated, mesh))
    if not result:
        raise BatchError("source contains no mesh geometry")
    return result


def triangle_count() -> int:
    meshes = evaluated_meshes()
    try:
        count = 0
        for _, mesh in meshes:
            mesh.calc_loop_triangles()
            count += len(mesh.loop_triangles)
        return count
    finally:
        for evaluated, mesh in meshes:
            evaluated.to_mesh_clear()


def geometry_bounds() -> tuple[Vector, Vector]:
    meshes = evaluated_meshes()
    minimum = Vector((float("inf"), float("inf"), float("inf")))
    maximum = Vector((float("-inf"), float("-inf"), float("-inf")))
    try:
        for evaluated, mesh in meshes:
            matrix = evaluated.matrix_world
            for vertex in mesh.vertices:
                point = matrix @ vertex.co
                minimum.x = min(minimum.x, point.x)
                minimum.y = min(minimum.y, point.y)
                minimum.z = min(minimum.z, point.z)
                maximum.x = max(maximum.x, point.x)
                maximum.y = max(maximum.y, point.y)
                maximum.z = max(maximum.z, point.z)
    finally:
        for evaluated, mesh in meshes:
            evaluated.to_mesh_clear()
    if not all(value != float("inf") and value != float("-inf") for value in (*minimum, *maximum)):
        raise BatchError("source has invalid geometry bounds")
    return minimum, maximum


def scale_geometry(scale: float) -> None:
    # Scale every object around world origin. Uniformly multiplying each world
    # matrix preserves the hierarchy's local relative transforms while scaling
    # both geometry and object positions.
    transform = Matrix.Scale(scale, 4)
    for obj in scene_objects():
        obj.matrix_world = transform @ obj.matrix_world
    bpy.context.view_layer.update()


def apply_object_transforms() -> None:
    for obj in scene_objects():
        if obj.type not in {"MESH", "ARMATURE"}:
            continue
        if obj.data is not None and obj.data.users > 1:
            obj.data = obj.data.copy()
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.view_layer.update()


def establish_pivot(mode: str) -> tuple[Vector, list[float]]:
    minimum, maximum = geometry_bounds()
    if mode == "bottom-center":
        pivot = Vector(
            ((minimum.x + maximum.x) / 2.0, (minimum.y + maximum.y) / 2.0, minimum.z)
        )
    elif mode == "bounds-center":
        pivot = (minimum + maximum) / 2.0
    else:
        pivot = Vector((0.0, 0.0, 0.0))

    root = bpy.data.objects.new("AETH_NormalizedRoot", None)
    bpy.context.scene.collection.objects.link(root)
    roots = [
        obj
        for obj in scene_objects()
        if obj is not root and obj.parent is None and obj.name != "AETH_NormalizedRoot"
    ]
    for obj in roots:
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = Matrix.Translation(-pivot) @ world
    root.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()

    final_minimum, final_maximum = geometry_bounds()
    size = [
        round(final_maximum.x - final_minimum.x, 6),
        round(final_maximum.y - final_minimum.y, 6),
        round(final_maximum.z - final_minimum.z, 6),
    ]
    return root.location.copy(), size


def select_export_objects() -> None:
    bpy.ops.object.select_all(action="DESELECT")
    selected = 0
    for obj in scene_objects():
        obj.select_set(True)
        selected += 1
    if selected == 0:
        raise BatchError("nothing to export")


def export_glb(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    select_export_objects()
    bpy.context.view_layer.objects.active = next(
        (obj for obj in scene_objects() if obj.type == "MESH"), None
    )
    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    if not destination.is_file() or destination.stat().st_size <= 0:
        raise BatchError(f"GLB export produced no bytes: {destination}")


def verify_exported_glb(path: Path) -> tuple[int, list[float]]:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    count = triangle_count()
    minimum, maximum = geometry_bounds()
    size = [
        round(maximum.x - minimum.x, 6),
        round(maximum.y - minimum.y, 6),
        round(maximum.z - minimum.z, 6),
    ]
    return count, size


def manifest_for(asset: dict, output_sha256: str, output_bytes: int) -> dict:
    manifest = {
        "id": asset["assetId"],
        "version": asset["version"],
        "stage": asset["stage"],
        "s3Key": asset["s3Key"],
        "sha256": output_sha256,
        "sizeBytes": output_bytes,
        "contentType": "model/gltf-binary",
        "localCachePath": asset["manifestLocalCachePath"],
    }
    if tuple(sorted(manifest)) != tuple(sorted(MANIFEST_KEYS)):
        raise BatchError("internal manifest shape drift")
    return manifest


def same_file_bytes(path: Path, expected_sha256: str, expected_bytes: int) -> bool:
    return (
        path.is_file()
        and not path.is_symlink()
        and path.stat().st_size == expected_bytes
        and sha256_file(path) == expected_sha256
    )


def publish_no_clobber(temp_path: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(temp_path, destination, follow_symlinks=False)
    except FileExistsError as error:
        raise BatchError(f"refusing to overwrite existing file: {destination}") from error
    try:
        os.unlink(temp_path)
    except FileNotFoundError:
        pass


def write_or_reuse_json(path: Path, value: dict) -> None:
    expected = json_bytes(value)
    if path.exists():
        if path.is_symlink() or path.read_bytes() != expected:
            raise BatchError(f"refusing to overwrite different file: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="wb", prefix=f".{path.name}.", suffix=".tmp", dir=path.parent, delete=False
    )
    temporary = Path(handle.name)
    try:
        with handle:
            handle.write(expected)
            handle.flush()
            os.fsync(handle.fileno())
        publish_no_clobber(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def process_asset(
    asset: dict,
    *,
    dry_run: bool,
) -> dict:
    clear_scene()
    import_source(asset["source"])
    minimum, maximum = geometry_bounds()
    source_height = maximum.z - minimum.z
    if source_height <= 1e-9:
        raise BatchError(f"{asset['assetId']} has zero height")
    scale = asset["targetHeightMeters"] / source_height
    scale_geometry(scale)
    apply_object_transforms()
    root_location, normalized_size = establish_pivot(asset["pivotMode"])
    preexport_triangles = triangle_count()
    if preexport_triangles > asset["triangleBudget"][0]:
        raise BatchError(
            f"{asset['assetId']} LOD0 is {preexport_triangles} triangles; "
            f"budget is {asset['triangleBudget'][0]}"
        )

    result = {
        "assetId": asset["assetId"],
        "source": str(asset["source"]),
        "sourceSha256": asset["sourceSha256"],
        "sourceBytes": asset["sourceBytes"],
        "version": asset["version"],
        "stage": asset["stage"],
        "targetHeightMeters": asset["targetHeightMeters"],
        "pivotMode": asset["pivotMode"],
        "rootLocation": [round(value, 9) for value in root_location],
        "normalizedSizeMeters": normalized_size,
        "triangleBudget": asset["triangleBudget"],
        "preexportTriangles": preexport_triangles,
        "cachePath": str(asset["cachePath"]),
        "manifestPath": str(asset["manifestPath"]),
        "s3Key": asset["s3Key"],
        "reviewPath": str(asset["reviewPath"]) if asset["reviewPath"] else None,
    }

    if dry_run:
        result["state"] = "DRY_RUN_PASS"
        return result

    asset["cachePath"].parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkstemp(
            prefix=f".{asset['filename']}.",
            suffix=".tmp.glb",
            dir=asset["cachePath"].parent,
        )[1]
    )
    try:
        export_glb(temporary)
        exported_triangles, exported_size = verify_exported_glb(temporary)
        if exported_triangles != preexport_triangles:
            raise BatchError(
                f"{asset['assetId']} triangle count changed on export: "
                f"{preexport_triangles} -> {exported_triangles}"
            )
        if exported_triangles > asset["triangleBudget"][0]:
            raise BatchError(
                f"{asset['assetId']} exported LOD0 is {exported_triangles}; "
                f"budget is {asset['triangleBudget'][0]}"
            )
        output_sha256 = sha256_file(temporary)
        output_bytes = temporary.stat().st_size

        if asset["cachePath"].exists():
            if not same_file_bytes(asset["cachePath"], output_sha256, output_bytes):
                raise BatchError(
                    f"refusing to overwrite different normalized file: {asset['cachePath']}"
                )
        else:
            publish_no_clobber(temporary, asset["cachePath"])

        if asset["reviewPath"]:
            if asset["reviewPath"].exists():
                if not same_file_bytes(asset["reviewPath"], output_sha256, output_bytes):
                    raise BatchError(
                        f"refusing to overwrite different review copy: {asset['reviewPath']}"
                    )
            else:
                asset["reviewPath"].parent.mkdir(parents=True, exist_ok=True)
                capture = tempfile.NamedTemporaryFile(
                    prefix=f".{asset['filename']}.",
                    suffix=".tmp",
                    dir=asset["reviewPath"].parent,
                    delete=False,
                )
                capture_path = Path(capture.name)
                try:
                    with capture:
                        with asset["cachePath"].open("rb") as source_handle:
                            for chunk in iter(lambda: source_handle.read(1024 * 1024), b""):
                                capture.write(chunk)
                        capture.flush()
                        os.fsync(capture.fileno())
                    publish_no_clobber(capture_path, asset["reviewPath"])
                finally:
                    if capture_path.exists():
                        capture_path.unlink()

        manifest = manifest_for(asset, output_sha256, output_bytes)
        write_or_reuse_json(asset["manifestPath"], manifest)
        result.update(
            {
                "state": "PASS",
                "exportedTriangles": exported_triangles,
                "exportedSizeMeters": exported_size,
                "outputSha256": output_sha256,
                "outputBytes": output_bytes,
                "manifestSha256": hashlib.sha256(json_bytes(manifest)).hexdigest(),
            }
        )
        return result
    finally:
        if temporary.exists():
            temporary.unlink()


def load_plan(path: Path) -> tuple[dict, list[dict]]:
    plan_path = no_symlink_file(path, "plan")
    try:
        raw = json.loads(plan_path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BatchError(f"plan is not valid UTF-8 JSON: {error}") from error
    plan = strict_object(raw, "plan", {"schemaVersion", "defaults", "assets"})
    if plan.get("schemaVersion") != SCHEMA_VERSION:
        raise BatchError(f"plan.schemaVersion must be {SCHEMA_VERSION}")
    defaults = strict_object(
        plan.get("defaults", {}),
        "plan.defaults",
        {"version", "stage", "pivotMode"},
    )
    assets = plan.get("assets")
    if not isinstance(assets, list) or not assets:
        raise BatchError("plan.assets must be a non-empty array")
    return plan, assets


def main() -> int:
    args = parse_args()
    root = repo_root()
    plan_path = Path(args.plan).resolve()
    manifest_dir = (
        Path(args.manifest_dir).resolve()
        if args.manifest_dir
        else root / "assets" / "manifests"
    )
    cache_root = (
        Path(args.cache_root).resolve()
        if args.cache_root
        else root / ".cache" / "assets"
    )
    required_cache_root = (root / ".cache" / "assets").resolve()
    if cache_root != required_cache_root:
        print(
            f"--cache-root must be {required_cache_root} so manifest "
            "localCachePath remains schema-compatible",
            file=sys.stderr,
        )
        return 2
    review_output = Path(args.review_output).resolve() if args.review_output else None
    report_path = Path(args.report).resolve() if args.report else None
    if report_path and not args.dry_run and report_path.exists():
        print(f"refusing to overwrite existing report: {report_path}", file=sys.stderr)
        return 2

    try:
        _, raw_assets = load_plan(plan_path)
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        defaults = plan.get("defaults", {})
        assets = [
            parse_asset(
                item,
                defaults,
                plan_path.parent,
                root,
                cache_root,
                manifest_dir,
                review_output,
            )
            for item in raw_assets
        ]
        ids = [asset["assetId"] for asset in assets]
        if len(ids) != len(set(ids)):
            raise BatchError("plan contains duplicate assetId values")

        results = []
        failures = []
        for asset in assets:
            try:
                results.append(process_asset(asset, dry_run=args.dry_run))
                print(
                    f"NORMALIZE {asset['assetId']}: "
                    f"{results[-1]['preexportTriangles']} tris "
                    f"{results[-1]['state']}"
                )
            except Exception as error:  # Keep processing independent batch entries.
                failure = {
                    "assetId": asset["assetId"],
                    "state": "FAIL",
                    "error": str(error),
                    "source": str(asset["source"]),
                }
                failures.append(failure)
                print(f"NORMALIZE {asset['assetId']}: FAIL: {error}", file=sys.stderr)

        report = {
            "schemaVersion": SCHEMA_VERSION,
            "state": "PASS" if not failures else "FAIL",
            "dryRun": bool(args.dry_run),
            "blenderVersion": bpy.app.version_string,
            "planPath": str(plan_path),
            "manifestDirectory": str(manifest_dir),
            "cacheRoot": str(cache_root),
            "reviewOutput": str(review_output) if review_output else None,
            "assetCount": len(assets),
            "passedCount": len(results),
            "failedCount": len(failures),
            "results": results,
            "failures": failures,
        }
        if report_path and not args.dry_run:
            write_or_reuse_json(report_path, report)
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0 if not failures else 1
    except BatchError as error:
        print(f"NORMALIZE BATCH FAIL: {error}", file=sys.stderr)
        return 2
    except Exception as error:
        print(f"NORMALIZE BATCH UNEXPECTED FAIL: {error}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
