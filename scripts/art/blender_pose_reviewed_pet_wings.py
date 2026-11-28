"""Author a private reversible wingbeat on the two approved segmented Pet meshes."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector, Quaternion

# Mesh IDs correspond to the retained Tripo partition. Bird fragments 20–24
# share literal vertices with its main wings. Dragon parts 10–35 are the fans.
SOURCES = {
    "bird-fire-cinderquill": ("105a55a239a046e49fd7183e8e95cb95502958cd1971dfb123b29a3793a27292",
                             {3, 5, 20, 21, 22, 23, 24}, 0),
    "dragon-fire-ignivar": ("068de744f73bedf0d86d31e39011ae808402500663cfa2692370533d9b0a54cb",
                            {0, 9, *range(10, 36)}, 5),
}


def mesh_positions(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


def key(point):
    return tuple(round(n, 6) for n in point)


def author(asset_id, source, output):
    digest, wing_ids, body_id = SOURCES[asset_id]
    if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
        raise ValueError("Input must be the reviewed UV and segmented mesh")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = {int(o.name.removeprefix("tripo_part_")): o for o in bpy.context.scene.objects if o.type == 'MESH'}
    positions = {i: mesh_positions(obj) for i, obj in objects.items()}
    keys = {i: {key(p) for p in v} for i, v in positions.items()}
    if not wing_ids.issubset(objects) or not all(o.data.uv_layers.active for o in objects.values()):
        raise ValueError("Incomplete wing partitions or UVs")
    sides = {i: (1 if sum(p.x for p in positions[i]) > 0 else -1) for i in wing_ids}
    joints = {}
    for side in (-1, 1):
        surface = set.union(*(keys[i] for i in wing_ids if sides[i] == side))
        seam = sorted(surface & keys[body_id])
        if len(seam) < 5:
            raise ValueError("Insufficient shared shoulder vertices to define the joint")
        joints[side] = sum((Vector(p) for p in seam), Vector()) / len(seam)
    scene = bpy.context.scene
    arm = bpy.data.armatures.new("Flight skeleton")
    rig = bpy.data.objects.new(asset_id + "-wing-review", arm)
    scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    root = arm.edit_bones.new("Body")
    root.head, root.tail = (0, 0, 0), (0, 0, .10)
    names = {-1: "Wing.XNegative", 1: "Wing.XPositive"}
    for side, shoulder in joints.items():
        bone = arm.edit_bones.new(names[side])
        bone.head, bone.tail = shoulder, shoulder + Vector((.18 * side, 0, 0))
        bone.parent = root
    bpy.ops.object.mode_set(mode='OBJECT')
    static = set.union(*(keys[i] for i in objects if i not in wing_ids))
    for i, obj in objects.items():
        world = obj.matrix_world.copy()
        obj.parent = rig
        obj.matrix_world = world
        base = obj.vertex_groups.new(name="Body")
        if i in wing_ids:
            side = sides[i]
            wing = obj.vertex_groups.new(name=names[side])
            for v, point in zip(obj.data.vertices, positions[i]):
                # Pin the cut boundary to the torso. Smooth the lateral shoulder
                # band. Welded vertices use identical positions in all partitions.
                t = max(0., min(1., ((point.x - joints[side].x) * side) / .085))
                weight = 0. if key(point) in static else t * t * (3 - 2 * t)
                if weight < 1:
                    base.add([v.index], 1 - weight, 'REPLACE')
                if weight:
                    wing.add([v.index], weight, 'REPLACE')
        else:
            base.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        modifier = obj.modifiers.new("Review wing skin", 'ARMATURE')
        modifier.object = rig
    for frame, degrees in ((1, 0), (13, 21), (25, 0), (37, -14), (49, 0)):
        for side, name in names.items():
            bone = rig.pose.bones[name]
            # Armature-space Y runs parallel to the Pet's forward/back axis.
            axis = bone.bone.matrix_local.to_quaternion().inverted() @ Vector((0, -side, 0))
            bone.rotation_quaternion = Quaternion(axis, math.radians(degrees))
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
    rig.animation_data.action.name = "Wingbeat study"
    scene.frame_start, scene.frame_end, scene.render.fps = 1, 49, 24
    scene.frame_set(1)
    output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / (asset_id + ".blend")))
    bpy.ops.export_scene.gltf(filepath=str(output / (asset_id + ".glb")), export_format='GLB',
                              export_animations=True, export_animation_mode='ACTIONS', export_skins=True)
    receipt = {"assetId": asset_id, "sourceSha256": digest, "role": "private wing articulation study",
               "wingPartCount": len(wing_ids), "totalParts": len(objects), "actionFrames": [1, 13, 25, 37, 49],
               "shouldersBlenderSpace": {names[s]: list(j) for s, j in joints.items()},
               "outputSha256": hashlib.sha256((output / (asset_id + ".glb")).read_bytes()).hexdigest()}
    (output / "wingbeat.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("identity", choices=SOURCES)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    author(args.identity, args.source, args.output)
