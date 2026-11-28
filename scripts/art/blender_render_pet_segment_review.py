"""Render verified Pet parts with temporary Blender Workbench review colors."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_normalize_r2_batch import BatchError, repo_root, sha256_file
from blender_normalize_reviewed_pet import VIEWS


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    report_path = args.report.resolve(strict=True)
    output = args.output.resolve()
    if bpy.app.version[:2] != (5,3) or output.is_relative_to(repo_root()):
        raise BatchError("Use Blender 5.3 and fresh private preview output")
    facts = json.loads(report_path.read_text())
    filename = facts["derivedFile"]
    if facts.get("classification") != "PRIVATE_SEGMENTED_UV_REVIEW" or Path(filename).name != filename:
        raise BatchError("Expected a verified private segmented derivative")
    model = report_path.with_name(filename)
    if facts["derivedSha256"] != sha256_file(model):
        raise BatchError("Verified GLB bytes changed")
    output.mkdir(parents=True,exist_ok=False,mode=0o700)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.ops.import_scene.gltf(filepath=str(model)) != {"FINISHED"}:
        raise BatchError("Could not import the verified segments in Blender")
    scene = bpy.context.scene
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    if (len(meshes) != facts["providerPartCount"] or
            {obj.name for obj in meshes} != {part["partId"] for part in facts["parts"]}):
        raise BatchError("Blender did not retain the recorded provider part identities")
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    center = (low + high)/2
    span = (high-low).length
    camera = bpy.data.objects.new("Private orthographic review",bpy.data.cameras.new("Review Camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = span*1.12
    camera.data.clip_end = max(100,span*10)
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "RANDOM"
    scene.display.shading.show_cavity = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    previews = {}
    for view in ("three-quarter","rear"):
        camera.location = center + Vector(VIEWS[view]).normalized()*span*3
        camera.rotation_euler = (center-camera.location).to_track_quat("-Z","Y").to_euler()
        path = output/f"{view}.png"
        scene.render.filepath = str(path)
        if bpy.ops.render.render(write_still=True) != {"FINISHED"} or not path.is_file():
            raise BatchError(f"Workbench did not render {view}")
        preview = bpy.data.images.load(str(path))
        try:
            pixels = preview.pixels[:]
            colors = {tuple(int(channel*20) for channel in pixels[i:i+3]) for i in range(0,len(pixels),4) if pixels[i+3]>.9}
            if tuple(preview.size)!=(900,900) or len(colors)<16:
                raise BatchError(f"Workbench {view} has no readable part shading")
        finally:
            bpy.data.images.remove(preview)
        previews[view] = {"file": path.name, "sha256": sha256_file(path)}
    if facts["derivedSha256"] != sha256_file(model):
        raise BatchError("The preview changed the verified GLB")
    (output/"preview-review.json").write_text(json.dumps({
        "assetId": facts["assetId"], "glbSha256": facts["derivedSha256"], "renderer": scene.render.engine,
        "colorMode": scene.display.shading.color_type, "providerParts": len(meshes), "previews": previews,
        "purpose": "Private diagnostic colors assigned to whole provider objects",
    },indent=2)+"\n")


if __name__ == "__main__":
    main()
