"""Compare high-poly reference, production mesh and tangent bake at fixed cameras."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def compare(study, destination):
    receipt = json.loads((study / "report.json").read_text())
    scene_file = study / "normal-study.blend"
    if receipt["status"] != "BAKED" or hashlib.sha256(scene_file.read_bytes()).hexdigest() != receipt["bake"]["editableSha256"]:
        raise ValueError("Expected the successful correspondence and bake receipt for this scene")
    destination.mkdir(exist_ok=False)
    bpy.ops.wm.open_mainfile(filepath=str(scene_file.resolve()))
    high = bpy.data.objects["Pinned H3.5 high-poly part"]
    low = bpy.data.objects["Production geometry – isolated part"]
    material = low.data.materials[0]
    normal = next(node for node in material.node_tree.nodes if node.type == "NORMAL_MAP")
    high.data.materials.clear()
    high.data.materials.append(material)
    scene = bpy.context.scene
    bounds = [low.matrix_world @ Vector(point) for point in low.bound_box]
    center = sum(bounds, Vector()) / len(bounds)
    diameter = max((point - center).length for point in bounds) * 2
    camera = bpy.data.objects.new("Comparison camera", bpy.data.cameras.new("Comparison camera"))
    scene.collection.objects.link(camera)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = diameter * 1.06
    camera.data.clip_start = diameter * .01
    camera.data.clip_end = diameter * 15
    scene.camera = camera
    scene.world = bpy.data.worlds.new("Comparison world")
    scene.world.color = (.12, .12, .12)
    light = bpy.data.objects.new("Grazing key", bpy.data.lights.new("Grazing key", "SUN"))
    scene.collection.objects.link(light)
    light.rotation_euler = Vector((-.7, .5, -.7)).to_track_quat("-Z", "Y").to_euler()
    light.data.energy = 2
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.cycles.seed = 7
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    for view, direction in (("side", (1, 0, 0)), ("oblique", (.7, .5, .3))):
        camera.location = center + Vector(direction).normalized() * diameter * 3
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        for name, use_high, strength in (("master", True, 0), ("lod", False, 0), ("baked", False, 1)):
            high.hide_render = not use_high
            low.hide_render = use_high
            normal.inputs["Strength"].default_value = strength
            scene.render.filepath = str((destination / f"{view}-{name}.png").resolve())
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    compare(args.study, args.destination)
