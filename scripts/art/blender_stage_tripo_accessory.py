"""Expand delivered quantized geometry through Blender and restore the original named bow anchor."""
import json
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from icarus_wing_parts import parse_glb, checksum

source, delivery, destination = map(Path, sys.argv[sys.argv.index("--") + 1:])
if destination.exists():
    raise FileExistsError(destination)
original, _ = parse_glb(source.read_bytes())
is_bow = any(node.get("name") == "BowGrip" for node in original["nodes"])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(delivery.resolve()))
if is_bow:
    marker, = [n for n in original["nodes"] if n.get("name") == "BowGrip"]
    root, = [n for n in original["nodes"] if n.get("name") == "IcarusBow"]
    if marker != {"name": "BowGrip"} or set(root) != {"name", "children"}:
        raise ValueError("The source grip no longer uses the reviewed origin")
    # Verify that the decoded vertex bounds still use the reviewed grip coordinate system.
    for name in ("BowBody", "BowString"):
        obj = bpy.data.objects[name]
        points = np.array([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices])
        node, = [n for n in original["nodes"] if n.get("name") == name]
        part, = original["meshes"][node["mesh"]]["primitives"]
        a = original["accessors"][part["attributes"]["POSITION"]]
        gltf = points[:, [0, 2, 1]] * [1, 1, -1]
        if max(np.max(np.abs(gltf.min(axis=0)-a["min"])), np.max(np.abs(gltf.max(axis=0)-a["max"]))) > .001:
            raise ValueError("Grip-relative geometry moved more than 1 mm")
    marker = bpy.data.objects.new("BowGrip", None)
    bpy.context.scene.collection.objects.link(marker)
bpy.ops.export_scene.gltf(filepath=str(destination.resolve()), export_format="GLB", export_image_format="AUTO",
                          export_keep_originals=True, export_all_influences=True)
doc, buf = parse_glb(destination.read_bytes())
before, data = parse_glb(delivery.read_bytes())
def maps(j, binary):
    views = [j['bufferViews'][i['bufferView']] for i in j['images']]
    return sorted(checksum(binary[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']]) for v in views)
if maps(doc, buf) != maps(before, data):
    raise ValueError("Export changed the approved texture bytes")
print("Unity fitting input", destination.name, checksum(destination.read_bytes()))
