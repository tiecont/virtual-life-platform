"""Capture both textured faces of an exported Tripo accessory in diffuse neutral light."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_probe_icarus_clay_parts import capture, stage_camera

source, asset, destination = sys.argv[sys.argv.index("--") + 1:]
if asset not in ("wing", "bow"):
    raise ValueError("Expected wing or bow")
folder = Path(destination)
folder.mkdir(exist_ok=False)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
scene = bpy.context.scene
camera, center, scale, _ = stage_camera(asset, [o for o in scene.objects if o.type == "MESH"])
scene.render.engine = "CYCLES"
scene.cycles.samples = 8
scene.view_settings.view_transform = "Standard"
scene.world = bpy.data.worlds.new("Neutral studio")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.70, .70, .70, 1)
scene.render.film_transparent = True
scene.render.image_settings.color_mode = "RGBA"
scene.render.resolution_percentage = 80
axis = Vector((0, 1, 0) if asset == "wing" else (1, 0, 0))
for view, direction in (("primary", axis), ("reverse", -axis)):
    capture(camera, center, scale * 1.10, direction, folder / (view + ".png"))
