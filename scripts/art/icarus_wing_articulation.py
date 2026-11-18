"""Fit an isolated six-bone wing articulation study to the preserved r3 body.

This is a draft construction/deformation study, not the canonical Icarus rig.
Original context and matched high vanes are retained unchanged and hidden.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Quaternion, Vector
from mathutils.bvhtree import BVHTree


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bone_name(side, segment):
    return f'WingStudy.{side}.{segment}'


def bind(obj, rig, weights):
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    for name, rows in weights.items():
        group = obj.vertex_groups.new(name=name)
        for index, weight in rows:
            group.add([index], weight, 'REPLACE')
    modifier = obj.modifiers.new('Wing study skin', 'ARMATURE')
    modifier.object = rig
    obj.parent = rig
    obj['productionReady'] = False


def rigid(obj, rig, name):
    bind(obj, rig, {name: [(v.index, 1) for v in obj.data.vertices]})


def spine(x):
    depth = .095 + .17 * min(1, max(0, (x - .105) / .165))
    depth += .04 * max(0, x - .27)
    return .405 + .43 * (x - .105), depth


def support(side, sign, rig, material, stations=25, sides=8):
    vertices, faces, weights = [], [], {}
    for row in range(stations):
        x = .105 + .405 * row / (stations - 1)
        z, y = spine(x)
        radius = .030 - .013 * row / (stations - 1)
        for col in range(sides):
            angle = col * math.tau / sides
            vertices.append((sign * x, y + .023 * math.sin(angle), z + radius * math.cos(angle)))
            # A short blend at each joint bends the support without stretching vanes.
            elbow = max(0, min(1, (x - .235) / .075))
            wrist = max(0, min(1, (x - .405) / .065))
            for segment, value in [('Shoulder', 1 - elbow), ('Elbow', elbow * (1 - wrist)),
                                   ('Wrist', wrist)]:
                if value:
                    weights.setdefault(bone_name(side, segment), []).append((len(vertices) - 1, value))
        if row:
            for col in range(sides):
                a = (row - 1) * sides + col
                b = (row - 1) * sides + (col + 1) % sides
                faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range((stations - 1) * sides, stations * sides))])
    mesh = bpy.data.meshes.new(f'WingSupport.{side}')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bind(obj, rig, weights)
    obj['component_role'] = 'draft_root_to_wrist_support'
    return obj


def context_display():
    originals = [o for o in bpy.data.objects if o.name.startswith('UnmodifiedContext.')]
    result = []
    for original in originals:
        original.hide_set(True)
        original.hide_render = True
        obj = original.copy()
        obj.data = original.data.copy()
        obj.name = original.name.replace('UnmodifiedContext.', 'DisplayContext.')
        bpy.context.scene.collection.objects.link(obj)
        obj.hide_set(False)
        obj.hide_render = False
        if original.name == 'UnmodifiedContext.Mesh_0':
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            removed = [v for v in bm.verts if abs(v.co.x) > .19 and v.co.y > .075 and v.co.z > .12]
            obj['masked_legacy_wing_vertices'] = len(removed)
            bmesh.ops.delete(bm, geom=removed, context='VERTS')
            bm.to_mesh(obj.data)
            bm.free()
        obj['context_only'] = True
        obj['mask_warning'] = 'Coordinate mask of joined legacy wings; not production body topology'
        result.append(obj)
    return result


def rig_wings():
    data = bpy.data.armatures.new('Icarus_Wing_Study_6Bones')
    rig = bpy.data.objects.new(data.name, data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for side, sign in [('L', 1), ('R', -1)]:
        previous = None
        for segment, a, b in [('Shoulder', .105, .27), ('Elbow', .27, .435), ('Wrist', .435, .52)]:
            bone = data.edit_bones.new(bone_name(side, segment))
            za, ya = spine(a)
            zb, yb = spine(b)
            bone.head, bone.tail = (sign * a, ya, za), (sign * b, yb, zb)
            bone.parent = previous
            bone.use_connect = previous is not None
            previous = bone
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(False)
    rig.show_in_front = True
    rig['productionReady'] = False
    rig['scope'] = 'Six wing study bones only; not canonical 74-bone rig or gameplay action'
    return rig


def set_pose(rig, amount):
    for side, sign in [('L', 1), ('R', -1)]:
        for segment, pitch, sweep in [('Shoulder', 22, 24), ('Elbow', 68, 0), ('Wrist', 28, 0)]:
            bone = rig.pose.bones[bone_name(side, segment)]
            inverse = bone.bone.matrix_local.to_3x3().inverted()
            pitch_axis = inverse @ Vector((0, 1, 0))
            sweep_axis = inverse @ Vector((0, 0, 1))
            bone.rotation_mode = 'QUATERNION'
            bone.rotation_quaternion = (Quaternion(sweep_axis, math.radians(sweep * amount * sign))
                                        @ Quaternion(pitch_axis, math.radians(pitch * amount * sign)))
    bpy.context.view_layer.update()


def world_geometry(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    vertices = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    evaluated.to_mesh_clear()
    return vertices, triangles


def render_views(output, rig, meshes, context, pose_fn=None):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1000, 1000
    scene.render.resolution_percentage = 100
    camera = scene.camera
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.45
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (.16, .16, .16, 1)
    directions = [('front', (0, -1, 0)), ('back', (0, 1, 0)), ('side', (1, 0, 0))]
    body_vertices, body_triangles = world_geometry(context[0])
    body_tree = BVHTree.FromPolygons(body_vertices, body_triangles, all_triangles=True)
    facts, snapshots = [], {}
    for label, amount, frame in [('open', 0, 1), ('half', .5, 16), ('fold', 1, 31)]:
        scene.frame_set(frame)
        (pose_fn or set_pose)(rig, amount)
        for bone in rig.pose.bones:
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
        all_vertices, triangles, intersections = [], 0, {}
        for obj in meshes:
            vertices, faces = world_geometry(obj)
            all_vertices.extend(vertices)
            triangles += len(faces)
            overlaps = body_tree.overlap(BVHTree.FromPolygons(vertices, faces, all_triangles=True))
            if overlaps:
                intersections[obj.name] = len(overlaps)
            snapshots.setdefault(obj.name, []).append(vertices)
        facts.append({'pose': label, 'frame': frame, 'triangles': triangles,
                      'bodyTriangleIntersectionPairs': intersections,
                      'bounds': {'min': [min(v[i] for v in all_vertices) for i in range(3)],
                                 'max': [max(v[i] for v in all_vertices) for i in range(3)]}})
        for view, direction in directions:
            focus = Vector((0, .08, 0))
            camera.location = focus + Vector(direction) * 4
            camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = str(output / f'{label}-{view}.png')
            bpy.ops.render.render(write_still=True)
    scene.frame_start, scene.frame_end = 1, 31
    rig.animation_data.action.name = 'STUDY_WingFold_NOT_CANONICAL'
    for fact in facts:
        fact['movementFromOpenMaxMeters'] = max(
            (position - snapshots[name][0][i]).length
            for name, frames in snapshots.items()
            for i, position in enumerate(frames[facts.index(fact)]))
    scene.frame_set(1)
    return facts


def verify(output, source):
    blend = output / 'icarus-wing-study.blend'
    glb = output / 'icarus-wing-study.glb'
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    rig = bpy.data.objects['Icarus_Wing_Study_6Bones']
    meshes = [o for o in rig.children if o.type == 'MESH']
    body_vertices, body_faces = world_geometry(bpy.data.objects['DisplayContext.Mesh_0'])
    tree = BVHTree.FromPolygons(body_vertices, body_faces, all_triangles=True)
    bpy.context.scene.frame_set(1)
    opened = {o.name: world_geometry(o)[0] for o in meshes}
    report = {'blender': bpy.app.version_string, 'sourceSha256': digest(source),
              'productionReady': False, 'artState': 'NOT_REVIEWED',
              'reviewMode': 'SINGLE_AGENT_SELF_REVIEW', 'studyBones': len(rig.data.bones),
              'meshCount': len(meshes), 'poses': [],
              'scope': 'Wing root/fold study only; canonical rig/actions remain missing',
              'contextMask': {o.name: o.get('masked_legacy_wing_vertices', 0)
                              for o in bpy.data.objects if o.name.startswith('DisplayContext.')},
              'reopen': {'bones': len(rig.data.bones),
                         'packedImages': sum(i.packed_file is not None for i in bpy.data.images)},
              'files': {p.name: digest(p) for p in output.iterdir()
                        if p.suffix in ('.blend', '.glb', '.png')}}
    report['unweightedVertices'] = sum(
        not v.groups or abs(sum(g.weight for g in v.groups) - 1) > .0001
        for o in meshes for v in o.data.vertices)
    report['nonManifoldEdges'] = 0
    for obj in meshes:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        report['nonManifoldEdges'] += sum(not e.is_manifold for e in bm.edges)
        bm.free()
    for frame in range(1, 32):
        bpy.context.scene.frame_set(frame)
        intersections, movement, triangles = {}, 0, 0
        all_vertices = []
        for obj in meshes:
            vertices, faces = world_geometry(obj)
            all_vertices.extend(vertices)
            triangles += len(faces)
            movement = max(movement, max((v - opened[obj.name][i]).length
                                         for i, v in enumerate(vertices)))
            overlaps = tree.overlap(BVHTree.FromPolygons(vertices, faces, all_triangles=True))
            if overlaps:
                intersections[obj.name] = len(overlaps)
        report['poses'].append({'frame': frame, 'triangles': triangles,
                                'movementFromOpenMaxMeters': movement,
                                'bodyTriangleIntersectionPairs': intersections,
                                'bounds': {'min': [min(v[i] for v in all_vertices) for i in range(3)],
                                           'max': [max(v[i] for v in all_vertices) for i in range(3)]}})
    expected_count = len(meshes)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    # The importer creates an Icosphere for bone display, separate from GLB meshes.
    imported = [o for o in bpy.context.scene.objects if o.type == 'MESH'
                and any(m.type == 'ARMATURE' for m in o.modifiers)]
    report['glbReimport'] = {'meshes': len(imported),
                            'armatures': sum(o.type == 'ARMATURE' for o in bpy.context.scene.objects),
                            'actions': [a.name for a in bpy.data.actions],
                            'triangles': sum(len(world_geometry(o)[1]) for o in imported)}
    bpy.context.scene.frame_set(1)
    imported_open = {o.name: world_geometry(o)[0] for o in imported}
    bpy.context.scene.frame_set(31)
    report['glbReimport']['movementFromOpenMaxMeters'] = max(
        (v - imported_open[o.name][i]).length
        for o in imported for i, v in enumerate(world_geometry(o)[0]))
    (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    assert report['reopen']['bones'] == 6
    assert report['glbReimport']['meshes'] == expected_count == 68
    assert report['glbReimport']['triangles'] == report['poses'][0]['triangles']
    assert report['poses'][-1]['movementFromOpenMaxMeters'] > .1
    assert report['glbReimport']['movementFromOpenMaxMeters'] > .1
    assert report['unweightedVertices'] == report['nonManifoldEdges'] == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--verify-existing', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    output = args.output.resolve()
    if args.verify_existing:
        verify(output, args.source)
        return
    output.mkdir(parents=True, exist_ok=False)
    source_hash = digest(args.source)
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    context = context_display()
    lows = [o for o in bpy.data.objects if o.name.startswith('Wing.') and not o.name.endswith('.HIGH')]
    rig = rig_wings()
    material = bpy.data.materials.new('WingSupport_Ivory')
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (.80, .76, .70, 1)
    shader.inputs['Roughness'].default_value = .66
    meshes = lows[:]
    for side, sign in [('L', 1), ('R', -1)]:
        meshes.append(support(side, sign, rig, material))
    for obj in lows:
        _, side, group, index = obj.name.split('.')
        sign = 1 if side == 'L' else -1
        t = (int(index) - 1) / (10 if group == 'Primary' else 7 if group == 'Secondary' else 6)
        root_x = (.25 + .25 * t if group == 'Primary' else
                  .17 + .25 * t if group == 'Secondary' else .13 + .33 * t)
        old_z = (.40 + .20 * t if group == 'Primary' else
                 .43 + .14 * t if group == 'Secondary' else .44 + .18 * t)
        old_y = .23 if group == 'Primary' else .205 if group == 'Secondary' else .175
        z, y = spine(root_x)
        y += -.038 if group == 'Covert' else 0
        for vertex in obj.data.vertices:
            vertex.co.z += z - old_z
            vertex.co.y += y - old_y
        segment = 'Shoulder' if root_x < .27 else 'Elbow' if root_x < .435 else 'Wrist'
        rigid(obj, rig, bone_name(side, segment))
        if group == 'Covert':
            back = obj.copy()
            back.data = obj.data.copy()
            back.name = obj.name.replace('.Covert.', '.BackCovert.')
            bpy.context.scene.collection.objects.link(back)
            for vertex in back.data.vertices:
                vertex.co.y += .082
            back['component_role'] = 'backside_root_coverts'
            meshes.append(back)
    facts = render_views(output, rig, meshes, context)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    glb = output / 'icarus-wing-study.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb), use_selection=True, export_format='GLB',
                             export_yup=True, export_animations=True, export_frame_range=True,
                             export_force_sampling=True)
    blend = output / 'icarus-wing-study.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    assert digest(args.source) == source_hash, 'r3 source changed'
    verify(output, args.source)


if __name__ == '__main__':
    main()
