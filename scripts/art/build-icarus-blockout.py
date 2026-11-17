"""Blender 4.5 LTS authoring study, not production character acceptance.

Run with Blender --background --python this-file -- --output artifacts/icarus
--reference /absolute/path/to/icarus-concept.png. Creates real editable source,
rigged exports, five NLA actions and inspection renders in a new directory.
"""
import argparse
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from icarus_white_gold import build_character


parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--reference', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if bpy.app.version[:2] != (4, 5):
    raise RuntimeError('Use Blender 4.5 LTS for this authoring study')
output = Path(args.output).resolve()
reference = Path(args.reference).resolve(strict=True)
output.mkdir(parents=True, exist_ok=False)
shutil.copyfile(reference, output / 'reference.png')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.render.fps = 30
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 1200
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.world.color = (0.18, 0.18, 0.18)
scene.view_settings.view_transform = 'AgX'
scene['character_id'] = 'pet-v3-fire-icarus'
scene['design_revision'] = 'white-gold-study-05'
scene['asset_status'] = 'DRAFT_BLOCKOUT_NOT_PRODUCTION'
scene['reference_hash'] = hashlib.sha256(reference.read_bytes()).hexdigest()


def material(name, color, metallic=0, emission=0):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    shader = value.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = 0.37
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    value.diffuse_color = (*color, 1)
    return value


armature = bpy.data.armatures.new('Icarus_74')
rig = bpy.data.objects.new('IcarusRig', armature)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, a, b, parent=None):
    value = armature.edit_bones.new(name)
    value.head, value.tail = a, b
    if parent:
        value.parent = armature.edit_bones[parent]
    return name


bone('root', (0, 0, 0), (0, 0, 0.18))
bone('pelvis', (0, 0, 0.88), (0, 0, 1.02), 'root')
bone('spine', (0, 0, 1.02), (0, 0, 1.16), 'pelvis')
bone('spine.02', (0, 0, 1.16), (0, 0, 1.30), 'spine')
bone('chest', (0, 0, 1.30), (0, 0, 1.44), 'spine.02')
bone('neck', (0, 0, 1.44), (0, 0, 1.53), 'chest')
bone('head', (0, 0, 1.53), (0, 0, 1.79), 'neck')
bone('jaw', (0, -0.03, 1.60), (0, -0.10, 1.56), 'head')
for sign, side in [(1, 'L'), (-1, 'R')]:
    bone('eye.'+side, (sign*0.057, -0.10, 1.69), (sign*0.057, -0.14, 1.69), 'head')
    bone('brow.'+side, (sign*0.057, -0.10, 1.735), (sign*0.09, -0.10, 1.735), 'head')
    shoulder, elbow, wrist = (sign*0.20, 0, 1.40), (sign*0.36, -0.015, 1.19), (sign*0.43, -0.08, 1.01)
    bone('shoulder.'+side, (sign*0.07, 0, 1.40), shoulder, 'chest')
    bone('upper_arm.'+side, shoulder, elbow, 'shoulder.'+side)
    bone('forearm.'+side, elbow, wrist, 'upper_arm.'+side)
    bone('hand.'+side, wrist, (sign*0.45, -0.08, 0.94), 'forearm.'+side)
    for finger in range(5):
        start = Vector((sign*(0.415+finger*0.015), -0.09, 0.96))
        for joint in range(3):
            end = start+Vector((sign*0.006, -0.008, -0.019))
            parent = 'hand.'+side if joint == 0 else f'finger{finger}.{joint-1}.{side}'
            bone(f'finger{finger}.{joint}.{side}', start, end, parent)
            start = end
    hip, knee, ankle = (sign*0.095, 0, 0.92), (sign*0.11, -0.01, 0.52), (sign*0.11, 0.01, 0.12)
    bone('thigh.'+side, hip, knee, 'pelvis')
    bone('shin.'+side, knee, ankle, 'thigh.'+side)
    bone('foot.'+side, ankle, (sign*0.11, -0.12, 0.07), 'shin.'+side)
    bone('toe.'+side, (sign*0.11, -0.12, 0.07), (sign*0.11, -0.20, 0.06), 'foot.'+side)
    for chain in range(3):
        base = (sign*0.15, 0.12, 1.40-chain*0.045)
        mid = (sign*(0.63+chain*0.06), 0.17, 1.82-chain*0.23)
        end = (sign*(1.12+chain*0.09), 0.22, 2.02-chain*0.38)
        bone(f'wing{chain}.0.{side}', base, mid, 'chest')
        bone(f'wing{chain}.1.{side}', mid, end, f'wing{chain}.0.{side}')
    bone('hair.0.'+side, (sign*0.08, 0.08, 1.72), (sign*0.14, 0.11, 1.42), 'head')
    bone('hair.1.'+side, (sign*0.14, 0.11, 1.42), (sign*0.19, 0.14, 1.15), 'hair.0.'+side)
bpy.ops.object.mode_set(mode='OBJECT')
assert len(armature.bones) == 74

parts = build_character(rig, scene)
part_triangles = {}
for part in parts:
    part.data.calc_loop_triangles()
    category = part.name.split('.')[0].rstrip('0123456789')
    part_triangles[category] = part_triangles.get(category, 0)+len(part.data.loop_triangles)
print('ICARUS_PART_TRIANGLES '+json.dumps(part_triangles))

bpy.ops.object.select_all(action='DESELECT')
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
model = bpy.context.object
model.name = 'Icarus_Blockout'
model.parent = rig
modifier = model.modifiers.new('IcarusArmature', 'ARMATURE')
modifier.object = rig
model.data.calc_loop_triangles()
triangles = len(model.data.loop_triangles)
if not 26000 <= triangles <= 29500:
    raise RuntimeError(f'LOD0 triangle budget failed: {triangles}')
if len(model.data.materials) != 3:
    raise RuntimeError('Expected three authored character materials')
for vertex in model.data.vertices:
    if abs(sum(group.weight for group in vertex.groups)-1) > 0.0001:
        raise RuntimeError(f'Unnormalized skin weights: {vertex.index}')

clips = [('idle', 8), ('intro', 15), ('normal', 4), ('rage', 6), ('signature', 10)]
for name, seconds in clips:
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame in range(1, seconds*30+2, 5):
        progress = (frame-1)/(seconds*30)
        wave = math.sin(progress*math.tau)
        pulse = math.sin(progress*math.pi)**2
        for value in rig.pose.bones:
            value.rotation_mode = 'XYZ'
            value.rotation_euler = (0, 0, 0)
            value.location = (0, 0, 0)
        rig.pose.bones['root'].location.z = 0.015*wave if name == 'idle' else 0.045*pulse
        rig.pose.bones['chest'].rotation_euler.y = wave*0.025 if name == 'idle' else pulse*0.12
        for sign, side in [(1, 'L'), (-1, 'R')]:
            for chain in range(3):
                rig.pose.bones[f'wing{chain}.0.{side}'].rotation_euler.y = sign*(0.035*wave if name == 'idle' else (0.25+chain*0.04)*pulse)
                rig.pose.bones[f'wing{chain}.1.{side}'].rotation_euler.z = sign*wave*(0.04 if name == 'idle' else 0.14)
            for chain in range(2):
                rig.pose.bones[f'hair.{chain}.{side}'].rotation_euler.x = wave*0.035
        if name in ['normal', 'rage', 'signature']:
            power = {'normal': 0.55, 'rage': 0.9, 'signature': 1.30}[name]
            for sign, side in [(1, 'L'), (-1, 'R')]:
                value = rig.pose.bones['upper_arm.'+side]
                axis = value.bone.matrix_local.to_3x3().inverted() @ Vector((0, 1, 0))
                value.rotation_euler = Quaternion(axis, -sign*power*pulse).to_euler('XYZ')
            rig.pose.bones['forearm.L'].rotation_euler.z = -0.18*pulse
            rig.pose.bones['spine'].rotation_euler.z = -0.14*pulse
            if name == 'signature':
                rig.pose.bones['head'].rotation_euler.x = -0.12*pulse
        elif name == 'intro':
            rig.pose.bones['upper_arm.L'].rotation_euler.y = -0.35*pulse
            rig.pose.bones['head'].rotation_euler.x = -0.15*pulse
        for value in rig.pose.bones:
            value.keyframe_insert('rotation_euler', frame=frame, group=value.name)
            if value.name == 'root':
                value.keyframe_insert('location', frame=frame, group=value.name)
    action.use_fake_user = True
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.action_frame_end = seconds*30+1
    strip.frame_end = seconds*30+1
rig.animation_data.action = None
for track in rig.animation_data.nla_tracks:
    track.mute = True
for value in rig.pose.bones:
    value.rotation_euler = (0, 0, 0)
    value.location = (0, 0, 0)

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
model.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.fbx(filepath=str(output/'icarus-blockout.fbx'), use_selection=True, object_types={'ARMATURE', 'MESH'}, apply_unit_scale=True, axis_forward='-Z', axis_up='Y', add_leaf_bones=False, bake_anim=True, bake_anim_use_all_actions=True, bake_anim_use_nla_strips=False, bake_anim_simplify_factor=0)
for track in rig.animation_data.nla_tracks:
    track.mute = False
bpy.ops.export_scene.gltf(filepath=str(output/'icarus-blockout.glb'), export_format='GLB', use_selection=True, export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_armature_object_remove=True)
for track in rig.animation_data.nla_tracks:
    track.mute = track.name != 'idle'

# Inspection scene remains separate from the selected runtime export.
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.45, depth=0.08, location=(0, 0, -0.07))
plinth = bpy.context.object
plinth.name = 'InspectionPlinth'
plinth.data.materials.append(material('Plinth', (0.055, 0.075, 0.10), 0.3))
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.12))
bpy.context.object.data.materials.append(material('Backdrop', (0.09, 0.11, 0.14)))


def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()


for name, position, energy, color, size in [
    ('Key', (-3, -4, 5), 600, (1, 0.87, 0.73), 4),
    ('Fill', (3, -2, 3), 450, (0.65, 0.79, 1), 3),
    ('Rim', (0, 3, 4), 850, (1, 0.48, 0.19), 3),
]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color, data.shape, data.size = energy, color, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    aim(obj, (0, 0, 1.1))
camera_data = bpy.data.cameras.new('InspectionCamera')
camera = bpy.data.objects.new('InspectionCamera', camera_data)
scene.collection.objects.link(camera)
camera.location = (2.6, -6, 2.4)
aim(camera, (0, 0, 1.10))
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 3.25
scene.camera = camera
scene.frame_start, scene.frame_end = 1, 240
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(output/'icarus-blockout.blend'), compress=True)
for label, position in [('front', (0, -6, 1.9)), ('three-quarter', (2.6, -6, 2.4)), ('back', (0, 6, 1.9))]:
    camera.location = position
    aim(camera, (0, 0, 1.10))
    scene.render.filepath = str(output/(label+'.png'))
    bpy.ops.render.render(write_still=True)
facts = {
    'character_id': scene['character_id'], 'design_revision': scene['design_revision'],
    'status': 'DRAFT_BLOCKOUT_NOT_PRODUCTION', 'reference_hash': scene['reference_hash'],
    'generator_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__), Path(__file__).with_name('icarus_white_gold.py')]},
    'blender': bpy.app.version_string, 'triangles': triangles, 'bones': len(armature.bones),
    'character_materials': len(set(slot.material.name for slot in model.material_slots)),
    'clips': dict(clips), 'runtimeEnabled': False, 'productionReady': False,
    'unityImport': 'NOT_TESTED', 'rightsReview': 'PENDING',
    'remaining': ['Artist silhouette and deformation review', 'Production retopology and baked textures', 'Sixteen canonical gameplay action bindings', 'Unity shader/VFX/Timeline/Cinemachine', 'Actual Unity MP4 and performance checks'],
    'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in output.iterdir() if p.is_file()},
}
(output/'inspection.json').write_text(json.dumps(facts, indent=2)+'\n')
print(json.dumps(facts))
