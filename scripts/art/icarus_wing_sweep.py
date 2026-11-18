"""Reference-led low-cage wing sweep and rest-pose study; never a final rig."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import icarus_wing_articulation as articulation
import icarus_wing_repair as repair


def pose(rig, amount, iteration):
    angles = {1: (22, 68, 28), 2: (-18, 108, 34), 3: (-30, 116, 39)}[iteration]
    for side, sign in [('L', 1), ('R', -1)]:
        for segment, angle in zip(('Shoulder', 'Elbow', 'Wrist'), angles):
            bone = rig.pose.bones[articulation.bone_name(side, segment)]
            inverse = bone.bone.matrix_local.to_3x3().inverted()
            pitch_axis = inverse @ Vector((0, 1, 0))
            sweep_axis = inverse @ Vector((0, 0, 1))
            bone.rotation_mode = 'QUATERNION'
            bone.rotation_quaternion = (
                Quaternion(sweep_axis, math.radians((12 if segment == 'Shoulder' else 0) * amount * sign))
                @ Quaternion(pitch_axis, math.radians(angle * amount * sign)))
    bpy.context.view_layer.update()
    for obj in rig.children:
        if obj.type == 'MESH' and obj.data.shape_keys:
            obj.data.shape_keys.key_blocks['STUDY_RestFanClosure'].value = amount
            obj.data.shape_keys.key_blocks['STUDY_RestFanClosure'].keyframe_insert(
                data_path='value', frame=bpy.context.scene.frame_current)


def build(material, root_scale=1):
    pairs, metadata = [], {}
    source_material = repair.source_material()
    for sign, side in [(1, 'L'), (-1, 'R')]:
        for group, count in [('Primary', 11), ('Secondary', 8), ('Covert', 7)]:
            for i in range(count):
                t = i / (count - 1)
                rhythm = math.sin(i * 2.17 + (0 if sign > 0 else .45))
                if group == 'Primary':
                    x = .25 + .25 * t
                    tip_x, tip_z, width = .33 + .60 * t, .035 + .76 * t, .043 - .012 * t
                elif group == 'Secondary':
                    x = .17 + .25 * t
                    tip_x, tip_z, width = .23 + .43 * t, .115 + .32 * t, .040 - .008 * t
                else:
                    x = .13 + .33 * t
                    tip_x, tip_z, width = .19 + .36 * t, .33 + .20 * t, .031 - .007 * t
                z, y = articulation.spine(x)
                y += -.039 if group == 'Covert' else -.012 if group == 'Secondary' else .012
                root = (sign * x, y, z)
                tip = (sign * (tip_x + .009 * rhythm), y + .023, tip_z + .014 * rhythm)
                name = f'Wing.{side}.{group}.{i + 1:02d}'
                index = len(pairs)
                low = repair.feather(name, root, tip, width, index, cage=(8, 2), swept=True)
                high = repair.feather(name + '.HIGH', root, tip, width, index, high=True, swept=True)
                if group == 'Covert':
                    origin = Vector(root)
                    for obj in (low, high):
                        for vertex in obj.data.vertices:
                            vertex.co = origin + (vertex.co - origin) * root_scale
                low.data.materials.append(material)
                high.data.materials.append(source_material)
                pairs.append((low, high))
                metadata[low.name] = (side, group, x, root, tip, t)
    return pairs, metadata


def fan_closure(obj, root, tip, side, group, segment, t):
    if group == 'Covert':
        return
    sign = 1 if side == 'L' else -1
    folded_angle = {'Shoulder': -30, 'Elbow': 86, 'Wrist': 125}[segment]
    direction = Vector(tip) - Vector(root)
    initial_angle = math.degrees(math.atan2(direction.z, sign * direction.x))
    target_angle = folded_angle - 90 + (t - .5) * (14 if group == 'Primary' else 8)
    correction = Quaternion((0, 1, 0), math.radians((initial_angle - target_angle) * sign))
    obj.shape_key_add(name='Basis')
    key = obj.shape_key_add(name='STUDY_RestFanClosure')
    origin = Vector(root)
    for point, vertex in zip(key.data, obj.data.vertices):
        point.co = origin + correction @ (vertex.co - origin)
    obj['correctiveScope'] = 'Authored rest fan closure; not canonical action or collision solver'


def export(output, rig, meshes):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=str(output / 'icarus-wing-study.glb'), use_selection=True,
                             export_format='GLB', export_yup=True, export_animations=True,
                             export_frame_range=True, export_force_sampling=True,
                             export_animation_mode='SCENE', export_anim_scene_split_object=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'icarus-wing-study.blend'))


def verify_export(output, source):
    articulation.verify(output, source)
    report_path = output / 'verification.json'
    report = json.loads(report_path.read_text())
    report['artState'] = 'ART_REVISION_REQUIRED'
    report['scope'] = 'Swept 8x2 closed vanes, six-bone fold and authored corrective fan closure; not canonical 74-bone rig'
    report['textureProvenance'] = '52 actual isolated matched high/low bakes; backside coverts intentionally share their front UVs'
    report['bodyClearanceLimit'] = 'Legacy body is coordinate-masked display context; intersection counts do not establish production clearance'
    report['cage'] = {'rows': 8, 'columns': 2, 'closedVanes': 66,
                      'supportStations': 13, 'supportSides': 6,
                      'priorWingSupportTriangles': 17688}
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    bpy.ops.wm.open_mainfile(filepath=str(output / 'icarus-wing-study.blend'))
    context = [o for o in bpy.data.objects if o.name.startswith('DisplayContext.')]
    original_rig = bpy.data.objects['Icarus_Wing_Study_6Bones']
    export_names = {obj.data.name: obj.name for obj in original_rig.children if obj.type == 'MESH'}
    expected = {}
    for frame in (1, 31):
        bpy.context.scene.frame_set(frame)
        expected[frame] = {obj.name: articulation.world_geometry(obj)
                           for obj in original_rig.children if obj.type == 'MESH'}
    report['correctiveVanes'] = sum(bool(obj.data.shape_keys) for obj in original_rig.children
                                   if obj.type == 'MESH')
    for obj in list(original_rig.children) + [original_rig]:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    bpy.ops.import_scene.gltf(filepath=str(output / 'icarus-wing-study.glb'))
    imported = [o for o in bpy.context.scene.objects if o.type == 'MESH'
                and any(m.type == 'ARMATURE' for m in o.modifiers)]
    scene = bpy.context.scene
    for label, frame in [('open', 1), ('fold', 31)]:
        scene.frame_set(frame)
        error = 0
        for obj in imported:
            name = export_names.get(obj.data.name, obj.name)
            vertices, faces = expected[frame][name]
            tree = BVHTree.FromPolygons(vertices, faces, all_triangles=True)
            for position in articulation.world_geometry(obj)[0]:
                error = max(error, tree.find_nearest(position)[3])
        report.setdefault('exportedPoseSurfaceErrorMeters', {})[label] = error
        assert error < .0001, f'Exported {label} geometry differs by {error}m'
        for view, direction in [('front', (0, -1, 0)), ('back', (0, 1, 0)), ('side', (1, 0, 0))]:
            focus = Vector((0, .08, 0))
            camera = scene.camera
            camera.location = focus + Vector(direction) * 4
            camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = str(output / f'exported-{label}-{view}.png')
            bpy.ops.render.render(write_still=True)
    assert len(imported) == 68 and context
    report['exportedPoseRenders'] = {
        path.name: articulation.digest(path) for path in output.glob('exported-*.png')}
    report['packedTextureSizes'] = {
        image.name: list(image.size) for image in bpy.data.images if image.packed_file}
    report_path.write_text(json.dumps(report, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--iteration', type=int, choices=(1, 2, 3), default=3)
    parser.add_argument('--reuse-atlas', type=Path)
    parser.add_argument('--verify-existing', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    output = args.output.resolve()
    if args.verify_existing:
        verify_export(output, args.source)
        return
    output.mkdir(parents=True, exist_ok=False)
    source_hash = articulation.digest(args.source)
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    for obj in list(bpy.data.objects):
        if obj.name.startswith('Wing.'):
            bpy.data.objects.remove(obj, do_unlink=True)
    context = articulation.context_display()
    material = bpy.data.materials.new('WingSweep_Atlas')
    material.use_nodes = True
    material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .56
    pairs, metadata = build(material, root_scale=1.35 if args.iteration == 3 else 1)
    if args.reuse_atlas:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = nodes.get('Principled BSDF')
        for label in ('Albedo', 'Normal'):
            node = nodes.new('ShaderNodeTexImage')
            node.image = bpy.data.images.load(str(args.reuse_atlas / (label + '.png')), check_existing=False)
            node.image.colorspace_settings.name = 'sRGB' if label == 'Albedo' else 'Non-Color'
            node.image.pack()
            if label == 'Albedo':
                links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
            else:
                normal = nodes.new('ShaderNodeNormalMap')
                links.new(node.outputs['Color'], normal.inputs['Color'])
                links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        repair.bake(pairs, material, output)
    rig = articulation.rig_wings()
    meshes = [low for low, _ in pairs]
    for low, high in pairs:
        high.hide_render = True
        high.hide_set(True)
        side, group, x, root, tip, t = metadata[low.name]
        segment = 'Shoulder' if x < .27 else 'Elbow' if x < .435 else 'Wrist'
        articulation.rigid(low, rig, articulation.bone_name(side, segment))
        if args.iteration == 3:
            fan_closure(low, root, tip, side, group, segment, t)
        if group == 'Covert':
            back = low.copy()
            back.data = low.data.copy()
            back.name = low.name.replace('.Covert.', '.BackCovert.')
            bpy.context.scene.collection.objects.link(back)
            for vertex in back.data.vertices:
                vertex.co.y += .078
            back['uvSharing'] = 'Intentional mirrored atlas sharing with front covert'
            meshes.append(back)
    support_material = bpy.data.materials.new('WingSweep_SupportIvory')
    support_material.use_nodes = True
    support_bsdf = support_material.node_tree.nodes.get('Principled BSDF')
    support_bsdf.inputs['Base Color'].default_value = (.80, .76, .70, 1)
    support_bsdf.inputs['Roughness'].default_value = .66
    for side, sign in [('L', 1), ('R', -1)]:
        meshes.append(articulation.support(side, sign, rig, support_material, stations=13, sides=6))
    articulation.render_views(output, rig, meshes, context,
                              pose_fn=lambda candidate, amount: pose(candidate, amount, args.iteration))
    export(output, rig, meshes)
    assert articulation.digest(args.source) == source_hash
    verify_export(output, args.source)


if __name__ == '__main__':
    main()
