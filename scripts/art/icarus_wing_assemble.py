"""Repair and export the existing wing study with its retained character context.

The joined legacy body is already masked in the input. This assembly deliberately
does not certify that cut, replace the rejected facial patch, or author hand skin.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def geometry(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    vertices = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    evaluated.to_mesh_clear()
    return vertices, triangles


def vertex_digest(obj):
    return hashlib.sha256(repr([tuple(v.co) for v in obj.data.vertices]).encode()).hexdigest()


def tree(obj):
    vertices, triangles = geometry(obj)
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True)


def scan(meshes, bodies):
    trees = {obj.name: tree(obj) for obj in bodies}
    poses = []
    for frame in range(1, 32):
        bpy.context.scene.frame_set(frame)
        collisions = {}
        for obj in meshes:
            surface = tree(obj)
            for name, body_tree in trees.items():
                count = len(body_tree.overlap(surface))
                if count:
                    collisions[f'{obj.name} / {name}'] = count
        poses.append({'frame': frame, 'triangleIntersectionPairs': collisions})
    return poses


def render(output, label, direction, focus, scale):
    scene = bpy.context.scene
    camera = scene.camera
    focus = Vector(focus)
    camera.location = focus + Vector(direction).normalized() * 4
    camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = scale
    scene.render.filepath = str(output / (label + '.png'))
    bpy.ops.render.render(write_still=True)


def verify_export(output, report):
    bpy.ops.wm.open_mainfile(filepath=str(output / 'icarus-character-wing-assembly.blend'))
    objects = [obj for obj in bpy.context.scene.objects if obj.name in report['meshTriangles']]
    export_names = {obj.data.name: obj.name for obj in objects}
    expected = {}
    for frame in (1, 16, 31):
        bpy.context.scene.frame_set(frame)
        expected[frame] = {obj.name: tree(obj) for obj in objects}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(output / 'icarus-character-wing-assembly.glb'))
    imported = [obj for obj in bpy.context.scene.objects
                if obj.type == 'MESH' and obj.data.name in export_names]
    report['reimport'] = {'meshes': len(imported), 'surfaceErrorMeters': {}}
    for frame in (1, 16, 31):
        bpy.context.scene.frame_set(frame)
        error = max(expected[frame][export_names[obj.data.name]].find_nearest(position)[3]
                    for obj in imported for position in geometry(obj)[0])
        report['reimport']['surfaceErrorMeters'][str(frame)] = error
    bpy.ops.wm.open_mainfile(filepath=str(output / 'icarus-character-wing-assembly.blend'))
    report['reopened'] = True
    report['files'] = {path.name: digest(path) for path in output.iterdir()
                       if path.suffix in ('.blend', '.glb', '.png')}
    (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    assert report['retainedBodyUnchanged'] and report['unweightedWingVertices'] == 0
    assert len(imported) == 70
    assert max(report['reimport']['surfaceErrorMeters'].values()) < .0001
    print(json.dumps({key: report[key] for key in ('repairTrials', 'totalTriangles', 'reimport')}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--verify-existing', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    output = args.output.resolve()
    if args.verify_existing:
        verify_export(output, json.loads((output / 'verification.json').read_text()))
        return
    output.mkdir(parents=True, exist_ok=False)
    original_hash = digest(args.source)
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    scene = bpy.context.scene
    rig = bpy.data.objects['Icarus_Wing_Study_6Bones']
    meshes = [obj for obj in rig.children if obj.type == 'MESH']
    bodies = [obj for obj in scene.objects if obj.name.startswith('DisplayContext.')]
    assert len(meshes) == 68 and len(bodies) == 2
    before_bodies = {obj.name: vertex_digest(obj) for obj in bodies}
    report = {'productionReady': False, 'artState': 'ART_REVISION_REQUIRED',
              'reviewMode': 'SINGLE_AGENT_SELF_REVIEW', 'blender': bpy.app.version_string,
              'sourceSha256': original_hash, 'source': str(args.source.resolve()),
              'faceDecision': 'Rejected face-loops-r3 is excluded; existing facial geometry retained.',
              'bodyLimitation': 'Input has a coordinate-masked connected legacy body; no root cut or full body retopology acceptance.',
              'scope': 'Static retained character with six-bone wing fold; no hand edits, canonical body rig or action bindings.',
              'baseline': scan(meshes, bodies), 'repairTrials': []}
    targets = [bpy.data.objects[f'Wing.{side}.Secondary.01'] for side in ('L', 'R')]
    original = {obj.name: [[point.co.copy() for point in key.data]
                           for key in obj.data.shape_keys.key_blocks] for obj in targets}
    # Shift this inner vane behind the nearby hair while preserving every fan key.
    # This is a bounded local repair, not a collision solver or another body mask.
    for offset in (.015, .030, .045):
        for obj in targets:
            for key, positions in zip(obj.data.shape_keys.key_blocks, original[obj.name]):
                for point, position in zip(key.data, positions):
                    point.co = position + Vector((0, offset, 0))
        bpy.context.view_layer.update()
        poses = scan(meshes, bodies)
        count = sum(sum(pose['triangleIntersectionPairs'].values()) for pose in poses)
        report['repairTrials'].append({'depthOffsetMeters': offset, 'intersectionPairs': count})
        if count == 0:
            break
    report['repaired'] = poses
    report['repairedOffsetMeters'] = offset
    report['retainedBodyVertexHashes'] = before_bodies
    report['retainedBodyUnchanged'] = all(vertex_digest(obj) == before_bodies[obj.name] for obj in bodies)
    report['meshTriangles'] = {obj.name: len(geometry(obj)[1]) for obj in bodies + meshes}
    report['totalTriangles'] = sum(report['meshTriangles'].values())
    report['unweightedWingVertices'] = sum(not v.groups or abs(sum(g.weight for g in v.groups) - 1) > .0001
                                           for obj in meshes for v in obj.data.vertices)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    for label, frame in [('open', 1), ('half', 16), ('fold', 31)]:
        scene.frame_set(frame)
        for view, direction in [('front', (0, -1, 0)), ('back', (0, 1, 0)), ('side', (1, 0, 0))]:
            render(output, f'{label}-{view}', direction, (0, .08, 0), 2.45)
    scene.frame_set(1)
    render(output, 'face-preserved', (0, -1, 0), (0, -.12, .61), .40)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bodies + meshes + [rig]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    scene.frame_start, scene.frame_end = 1, 31
    bpy.ops.export_scene.gltf(filepath=str(output / 'icarus-character-wing-assembly.glb'),
                             use_selection=True, export_format='GLB', export_yup=True,
                             export_animations=True, export_frame_range=True,
                             export_force_sampling=True, export_animation_mode='SCENE',
                             export_anim_scene_split_object=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'icarus-character-wing-assembly.blend'))
    assert digest(args.source) == original_hash
    (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    verify_export(output, report)


if __name__ == '__main__':
    main()
