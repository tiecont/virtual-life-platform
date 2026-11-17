"""Create a review-only character assembly from the preserved Meshy rig."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

ROOT = Path('artifacts/character-production/icarus').resolve()
OUT = ROOT / 'blender/refined-03'


def material(name, color, metallic=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = 0.3
    node.inputs['Emission Color'].default_value = (*color, 1)
    node.inputs['Emission Strength'].default_value = emission
    return mat


def tube(name, points, radius, mat, cyclic=False):
    bpy.ops.object.select_all(action='DESELECT')
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.resolution_u = 12
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points):
        p.co = co
        p.handle_left_type = p.handle_right_type = 'AUTO'
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def attach(obj, rig, bone):
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    obj.matrix_world = world


def main():
    global OUT
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(OUT))
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    OUT = Path(args.output).resolve()
    assert bpy.app.version[:2] == (4, 5)
    OUT.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'meshy/rig-01/walking.glb'))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name != 'Icosphere')
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj != body:
            bpy.data.objects.remove(obj, do_unlink=True)
    for action in bpy.data.actions:
        action.use_fake_user = True
    rig.animation_data_clear()
    for p in rig.pose.bones:
        p.matrix_basis.identity()
    body.name = 'Icarus_LOD0'
    rig.name = 'Icarus_Review_Rig'
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Imported GLTF bone tails are oversized; shortening display length preserves axes.
    bpy.ops.object.mode_set(mode='EDIT')
    for bone in rig.data.edit_bones:
        bone.length = min(bone.length, 0.1)
    for side, sign in [('L', 1), ('R', -1)]:
        parent = rig.data.edit_bones['Spine']
        for i in range(3):
            bone = rig.data.edit_bones.new(f'Wing.{side}.{i}')
            bone.head = (sign * (0.09 + i * 0.17), 0.04 + i * 0.035, 1.30 + i * 0.08)
            bone.tail = (sign * (0.26 + i * 0.17), 0.075 + i * 0.035, 1.38 + i * 0.08)
            bone.parent = parent
            parent = bone
        for strand in range(2):
            parent = rig.data.edit_bones['Head']
            for i in range(2):
                bone = rig.data.edit_bones.new(f'Hair.{side}.{strand}.{i}')
                bone.head = (sign * (0.13 + strand * 0.07), 0.08, 1.40 - i * 0.24)
                bone.tail = (sign * (0.17 + strand * 0.09), 0.10, 1.16 - i * 0.24)
                bone.parent = parent
                parent = bone
    for i in range(3):
        parent = rig.data.edit_bones['Hips']
        for j in range(2):
            bone = rig.data.edit_bones.new(f'Train.{i}.{j}')
            bone.head = ((i - 1) * 0.18, 0.08, 0.95 - j * 0.3)
            bone.tail = ((i - 1) * 0.25, 0.14, 0.65 - j * 0.3)
            bone.parent = parent
            parent = bone
    bpy.ops.object.mode_set(mode='OBJECT')
    image = next(n.image for m in body.data.materials if m.use_nodes for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
    pixels = list(image.pixels)
    width, height = image.size
    colors = {}
    for loop in body.data.loops:
        u, v = body.data.uv_layers.active.data[loop.index].uv
        x, y = min(width-1, max(0, int(u * width))), min(height-1, max(0, int(v * height)))
        k = 4 * (y * width + x)
        colors[loop.vertex_index] = pixels[k:k+3]
    classified = {'wing': 0, 'hair': 0, 'cloth': 0}
    # Meshy wings are disconnected shells. Weld only the connectivity lookup so
    # UV seam vertices receive the same rigid root weight without editing UVs.
    parents = {}
    def point(vertex):
        return tuple(round(c, 6) for c in vertex.co)
    def find(key):
        parents.setdefault(key, key)
        if parents[key] != key:
            parents[key] = find(parents[key])
        return parents[key]
    for polygon in body.data.polygons:
        keys = [point(body.data.vertices[i]) for i in polygon.vertices]
        root = find(keys[0])
        for key in keys[1:]:
            parents[find(key)] = root
    components = {}
    for vertex in body.data.vertices:
        components.setdefault(find(point(vertex)), []).append(vertex)
    wing_vertices = set()
    for vertices in components.values():
        low = [min(v.co[i] for v in vertices) for i in range(3)]
        high = [max(v.co[i] for v in vertices) for i in range(3)]
        outside = (low[0] > .15 and high[0] > .7) or (high[0] < -.15 and low[0] < -.7)
        if outside and low[2] > .9 and high[2] > 1.65:
            wing_vertices.update(v.index for v in vertices)
    assert len(wing_vertices) > 500, 'Both complete wing shells required'
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        rgb = colors.get(vertex.index, [0, 0, 0])
        target = None
        side = 'L' if x > 0 else 'R'
        if vertex.index in wing_vertices:
            target = f'Wing.{side}.0'
            classified['wing'] += 1
        elif y > 0.015 and z > 0.85 and rgb[0] > rgb[1] * 1.22 and abs(x) < 0.4:
            target = f'Hair.{side}.{int(abs(x)>0.21)}.{int(z<1.17)}'
            classified['hair'] += 1
        elif y > 0.03 and 0.3 < z < 0.95:
            target = f'Train.{min(2, max(0, round(x/0.18)+1))}.{int(z<0.65)}'
            classified['cloth'] += 1
        if target:
            for group in body.vertex_groups:
                try:
                    group.remove([vertex.index])
                except RuntimeError:
                    pass
            group = body.vertex_groups.get(target) or body.vertex_groups.new(name=target)
            group.add([vertex.index], 1, 'REPLACE')
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    gold = material('CelestialGold', (0.96, 0.55, 0.12), 0.8, 0.35)
    fire = material('SolarLight', (1, 0.45, 0.1), 0.1, 2)
    halo = tube('CelestialHalo', [(0.19*math.cos(i*math.tau/16), -0.04 + 0.13*math.sin(i*math.tau/16), 1.75 + .045*math.sin(i*math.tau/16)) for i in range(16)], 0.003, fire, True)
    attach(halo, rig, 'Head')
    for i in range(8):
        angle = i * math.tau / 8
        x, y, z = 0.19 * math.cos(angle), -0.04 + 0.13 * math.sin(angle), 1.75 + .045*math.sin(angle)
        star = tube(f'HaloStar{i}', [(x-.008,y,z),(x,y-.016,z-.006),(x+.008,y,z),(x,y+.016,z+.006)], 0.0015, gold, True)
        attach(star, rig, 'Head')
    # Review-only root fittings expose an explicit attachment construction candidate.
    for sign in (-1, 1):
        fitting = tube('WingRootFitting', [(sign*.045,.055,1.30),(sign*.10,.09,1.34),(sign*.16,.10,1.30)], .012, gold)
        attach(fitting, rig, 'Spine')
    for im in bpy.data.images:
        if im.has_data and im.source == 'FILE':
            im.pack()
    for action in list(bpy.data.actions):
        action.name = 'provider_walk_unreviewed'
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag = strip.channelbag(slot)
                    if bag:
                        for curve in bag.fcurves:
                            if curve.data_path.endswith('.location'):
                                for point in curve.keyframe_points:
                                    point.co.y *= .01
                                    point.handle_left.y *= .01
                                    point.handle_right.y *= .01
    rig.animation_data_create()
    actions = {}
    def reset():
        for p in rig.pose.bones:
            p.rotation_mode = 'QUATERNION'
            p.matrix_basis.identity()
    def key(name, duration, samples):
        reset()
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        for frame, rotations in samples:
            reset()
            for bone, axis, radians in rotations:
                rig.pose.bones[bone].rotation_quaternion = Quaternion(axis, radians)
            for p in rig.pose.bones:
                p.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=p.name)
        actions[name] = {'frames': duration, 'acceptance': 'DRAFT_MOTION_TEST'}
    key('idle', 60, [(f, [('Spine', (0,0,1), .015*math.sin(f*math.tau/60)), ('Head',(0,0,1),.02*math.sin(f*math.tau/60))]) for f in (1,15,30,45,60)])
    wing_axes = {s: rig.data.bones[f'Wing.{s}.0'].matrix_local.to_3x3().inverted() @ Vector((0,0,1)) for s in ('L','R')}
    key('wing_fold_test', 90, [(f, [(f'Wing.{s}.0', wing_axes[s], a*sgn*.9) for s,sgn in [('L',1),('R',-1)]]) for f,a in [(1,0),(30,1),(60,1),(90,0)]])
    key('bow_draw_test', 90, [(f, [('LeftArm',(1,0,0),a*.12),('RightArm',(0,0,1),a*.65),('RightForeArm',(0,0,1),a*-.9),('Spine',(0,0,1),a*.08)]) for f,a in [(1,0),(30,1),(50,1),(54,.15),(75,0),(90,0)]])
    reset()
    rig.animation_data.action = bpy.data.actions['idle']
    rig.animation_data.action_slot = bpy.data.actions['idle'].slots[0]
    assert any(m.type == 'ARMATURE' and m.object == rig for m in body.modifiers), 'Skinning modifier must survive accessory conversion'
    bpy.context.scene.frame_set(1)
    bpy.context.scene.render.fps = 30
    for lod, ratio in [(1,.65),(2,.48)]:
        duplicate = body.copy()
        duplicate.data = body.data.copy()
        bpy.context.scene.collection.objects.link(duplicate)
        duplicate.name = f'Icarus_LOD{lod}'
        bpy.context.view_layer.objects.active = duplicate
        decimate = duplicate.modifiers.new('DraftLOD', 'DECIMATE')
        decimate.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        duplicate.hide_render = True
        duplicate.hide_set(True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'icarus-refined.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type in {'MESH', 'ARMATURE'} and 'LOD1' not in obj.name and 'LOD2' not in obj.name:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.fbx(filepath=str(OUT / 'icarus-review.fbx'), use_selection=True,
                            object_types={'ARMATURE','MESH'}, add_leaf_bones=False,
                            bake_anim=True, bake_anim_use_nla_strips=False, bake_anim_use_all_actions=True,
                            path_mode='COPY', embed_textures=True, axis_forward='-Z', axis_up='Y')
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'icarus-review.glb'), use_selection=True,
                            export_format='GLB', export_animation_mode='ACTIONS')
    result = {'state':'ART_REVISION_REQUIRED', 'bones':len(rig.data.bones), 'classifiedVertices':classified,
              'actions':actions, 'bodyTriangles':len(body.data.polygons), 'productionReady':False,
              'limitations':['Wing/hair/train weights are spatial/color heuristics requiring visual repair',
                             'No fingers/face rig', '16 canonical actions incomplete', 'Body scale pending',
                             'Halo/root hardware are interpreted construction, not new owner approval',
                             'LOD silhouette/performance unqualified', 'PBR maps incomplete']}
    (OUT / 'validation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result),flush=True)


if __name__ == '__main__':
    main()
