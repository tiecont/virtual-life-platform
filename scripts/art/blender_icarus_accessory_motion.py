"""Author private motion studies on the original, textured Tripo surfaces."""
import argparse
import hashlib
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

BOW = "8384d2be36fe9abf8c439503a4c478b80489e2d89ff84812091b787c2bc18e25"
WINGS = "34030b8da0b5c864044907b7e78e3974f784ae73d7558eb434dafd326bda9262"


def string_vertices(mesh):
    # The provider exported four narrow, disconnected strips. Use topology to
    # distinguish their nocks from neighboring vertices on the bow limbs.
    neighbors = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        left, right = edge.vertices
        neighbors[left].add(right)
        neighbors[right].add(left)
    unseen = set(range(len(neighbors)))
    strips = []
    while unseen:
        pending = [unseen.pop()]
        component = []
        while pending:
            index = pending.pop()
            component.append(index)
            others = neighbors[index] & unseen
            unseen.difference_update(others)
            pending.extend(others)
        points = [mesh.vertices[i].co for i in component]
        widths = [max(p[i] for p in points) - min(p[i] for p in points) for i in range(3)]
        if widths[0] < .005 and widths[1] < .01 and widths[2] > .35 and min(p.y for p in points) > .07:
            strips.extend(component)
    if len(strips) != 40:
        raise ValueError(f"Expected 40 original string vertices, found {len(strips)}")
    return set(strips)


def smooth(value):
    value = min(1., max(0., value))
    return value * value * (3 - 2 * value)


def bow_draw(obj):
    mesh = obj.data
    string = string_vertices(mesh)
    coords = [v.co.copy() for v in mesh.vertices]
    center = Vector([(max(p[i] for p in coords) + min(p[i] for p in coords)) / 2 for i in range(3)])
    scale = 1.10 / (max(p.z for p in coords) - min(p.z for p in coords))
    for vertex in mesh.vertices:
        vertex.co = (vertex.co - center) * scale
    obj.shape_key_add(name="Basis")
    draw = obj.shape_key_add(name="BowDraw")
    half_length = max(abs(mesh.vertices[i].co.z) for i in string)
    draw_depth = .25
    tip_travel = half_length - math.sqrt(half_length ** 2 - draw_depth ** 2)
    for vertex in mesh.vertices:
        p = vertex.co
        height = min(1., abs(p.z) / half_length)
        if vertex.index in string:
            displacement = Vector((0, .035 + draw_depth * (1 - height), -p.z * tip_travel / half_length))
        else:
            bend = smooth((height - .18) / .82)
            displacement = Vector((0, .035 * bend, -math.copysign(tip_travel * bend, p.z)))
        draw.data[vertex.index].co = p + displacement
    return draw, [(1, 0), (16, 1), (21, 1), (24, 0), (30, 0)]


def wing_fold(obj):
    obj.shape_key_add(name="Basis")
    fold = obj.shape_key_add(name="WingFold")
    # Keep the center emblem stationary. Close the two sides about distinct
    # shoulder roots, with increasing sweep from the roots to the primaries.
    for vertex in obj.data.vertices:
        p = vertex.co
        distance = abs(p.x)
        if distance <= .10:
            continue
        side = math.copysign(1, p.x)
        root = Vector((side * .10, 0, .03))
        influence = smooth((distance - .10) / .32)
        sweep = Matrix.Rotation(side * math.radians(58) * influence, 3, 'Z')
        lower = Matrix.Rotation(side * math.radians(35) * influence, 3, 'Y')
        fold.data[vertex.index].co = root + sweep @ lower @ (p - root)
    return fold, [(1, 1), (12, 0), (18, .16), (23, 0), (34, 1)]


def author(source, output, kind):
    expected = BOW if kind == "Bow" else WINGS
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
        raise ValueError(f"Unexpected {kind} source")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    obj, = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    obj.name = "Icarus_" + kind
    key, timeline = bow_draw(obj) if kind == "Bow" else wing_fold(obj)
    for frame, value in timeline:
        key.value = value
        key.keyframe_insert(data_path="value", frame=frame)
    action = obj.data.shape_keys.animation_data.action
    action.name = "BowDrawRelease" if kind == "Bow" else "WingSpreadBeatFold"
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_end = timeline[-1][0]
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / (obj.name + ".blend")))
    bpy.ops.export_scene.gltf(filepath=str(output / (obj.name + ".glb")), export_format="GLB",
                              export_morph=True, export_animations=True, export_frame_range=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("bow", "wings", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError("Use Blender 5.3 for the private derivative")
    args.output.mkdir(parents=True, exist_ok=False)
    author(args.bow.resolve(), args.output.resolve(), "Bow")
    author(args.wings.resolve(), args.output.resolve(), "Wings")
