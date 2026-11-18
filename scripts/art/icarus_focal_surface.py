"""Preserve Icarus's authored focal surface in an isolated deformation study.

Run with Blender 4.5 --background --python this-file -- --help. This creates
neither game retopology nor a production asset: the dense source remains dense.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def focal_mask(centers):
    # Deliberately restrict this study to the head. Long hair below this collar
    # plane and any joining seam require a separate, reviewed integration.
    return ((np.abs(centers[:, 0]) < .255) & (centers[:, 2] > .495)
            & (centers[:, 2] < .865) & (centers[:, 1] < .16)
            & ~((np.abs(centers[:, 0]) > .18) & (centers[:, 2] < .72)
                & (centers[:, 1] > .04)))


def arrays(mesh):
    mesh.calc_loop_triangles()
    coords = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', coords)
    triangles = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
    mesh.loop_triangles.foreach_get('vertices', triangles)
    return coords.reshape((-1, 3)), triangles.reshape((-1, 3))


def extract(source, name, region=True):
    coords, triangles = arrays(source.data)
    selected = focal_mask(coords[triangles].mean(axis=1))
    if not region:
        selected = ~selected
    chosen = triangles[selected]
    vertices, reverse = np.unique(chosen, return_inverse=True)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(coords[vertices].tolist(), [], reverse.reshape((-1, 3)).tolist())
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = source.matrix_world.copy()
    for material in source.data.materials:
        mesh.materials.append(material)
    source_loops = np.empty(len(source.data.loop_triangles) * 3, dtype=np.int32)
    source.data.loop_triangles.foreach_get('loops', source_loops)
    source_loops = source_loops.reshape((-1, 3))[selected].ravel()
    for layer in source.data.uv_layers:
        original = np.empty(len(layer.data) * 2, dtype=np.float32)
        layer.data.foreach_get('uv', original)
        target = mesh.uv_layers.new(name=layer.name)
        target.data.foreach_set('uv', original.reshape((-1, 2))[source_loops].ravel())
    normals = np.empty(len(source.data.corner_normals) * 3, dtype=np.float32)
    source.data.corner_normals.foreach_get('vector', normals)
    mesh.normals_split_custom_set(normals.reshape((-1, 3))[source_loops].tolist())
    polygon_ids = np.empty(len(source.data.loop_triangles), dtype=np.int32)
    source.data.loop_triangles.foreach_get('polygon_index', polygon_ids)
    material_ids = np.empty(len(source.data.polygons), dtype=np.int32)
    source.data.polygons.foreach_get('material_index', material_ids)
    mesh.polygons.foreach_set('material_index', material_ids[polygon_ids[selected]])
    mesh.polygons.foreach_set('use_smooth', np.ones(len(mesh.polygons), dtype=bool))
    return obj, {'sourceTriangles': len(triangles), 'selectedTriangles': len(chosen),
                 'vertices': len(vertices), 'uvLayers': len(mesh.uv_layers),
                 'sourceVertexErrorMeters': float(np.max(np.abs(coords[vertices] - arrays(mesh)[0])))}


def extract_parts(objects, name):
    parts, facts = [], []
    for index, source in enumerate(objects):
        part, fact = extract(source, f'{name}_{index}')
        parts.append(part)
        facts.append(fact)
        source.hide_render = True
        source.hide_set(True)
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name
    return parts[0], {'sourceTriangles': sum(f['sourceTriangles'] for f in facts),
                      'selectedTriangles': sum(f['selectedTriangles'] for f in facts),
                      'vertices': len(parts[0].data.vertices),
                      'uvLayers': len(parts[0].data.uv_layers),
                      'sourceVertexErrorMeters': max(f['sourceVertexErrorMeters'] for f in facts),
                      'sourceParts': len(facts)}


def cage():
    rings = [(.475, .095, .105), (.495, .11, .12), (.52, .16, .16),
             (.55, .22, .20), (.585, .26, .235), (.62, .275, .25),
             (.66, .28, .26), (.70, .28, .26), (.745, .28, .26),
             (.79, .27, .25), (.83, .24, .22), (.875, .19, .18)]
    vertices, faces = [], []
    count = 32
    for z, rx, ry in rings:
        vertices.extend((rx * math.cos(i * math.tau / count),
                         -.06 + ry * math.sin(i * math.tau / count), z)
                        for i in range(count))
    for row in range(len(rings) - 1):
        for i in range(count):
            j = (i + 1) % count
            faces.append((row * count + i, row * count + j,
                          (row + 1) * count + j, (row + 1) * count + i))
    faces.extend([tuple(reversed(range(count))),
                  tuple((len(rings) - 1) * count + i for i in range(count))])
    mesh = bpy.data.meshes.new('Focal_Neck_Head_Control_Cage')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.display_type = 'WIRE'
    obj.hide_render = True
    obj.shape_key_add(name='Basis')
    for name, axis, degrees in [('TEST_Head_Yaw_30', 'Z', 30),
                                ('TEST_Head_Pitch_15', 'X', 15)]:
        key = obj.shape_key_add(name=name)
        pivot = Vector((0, -.06, .505))
        for v in key.data:
            weight = min(1, max(0, (v.co.z - .495) / .02))
            v.co = pivot + Matrix.Rotation(math.radians(degrees) * weight, 3, axis) @ (v.co - pivot)
    obj['purpose'] = 'Closed quad head/neck deformation proxy; not facial retopology'
    return obj


def evaluated_coords(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    coords, triangles = arrays(mesh)
    evaluated.to_mesh_clear()
    return coords, triangles


def deformation_facts(rest, posed, triangles):
    a, b = rest[triangles], posed[triangles]
    normal_a = np.cross(a[:, 1] - a[:, 0], a[:, 2] - a[:, 0])
    normal_b = np.cross(b[:, 1] - b[:, 0], b[:, 2] - b[:, 0])
    area_a = np.linalg.norm(normal_a, axis=1)
    area_b = np.linalg.norm(normal_b, axis=1)
    good = area_a > 1e-12
    lengths_a = np.linalg.norm(np.roll(a, -1, axis=1) - a, axis=2)
    lengths_b = np.linalg.norm(np.roll(b, -1, axis=1) - b, axis=2)
    ratios = lengths_b[lengths_a > 1e-8] / lengths_a[lengths_a > 1e-8]
    return {'nonFiniteVertices': int(np.sum(~np.isfinite(posed).all(axis=1))),
            'movedVertices': int(np.sum(np.linalg.norm(posed - rest, axis=1) > 1e-6)),
            'maxDisplacementMeters': float(np.max(np.linalg.norm(posed - rest, axis=1))),
            'areaRatioMin': float(np.min(area_b[good] / area_a[good])),
            'areaRatioMax': float(np.max(area_b[good] / area_a[good])),
            'edgeStretchP01P50P99': [float(x) for x in np.quantile(ratios, [.01, .5, .99])],
            'edgeStretchMinMax': [float(np.min(ratios)), float(np.max(ratios))],
            'normalReversals': int(np.sum(good & (np.sum(normal_a * normal_b, axis=1) < 0))),
            'collapsedTriangles': int(np.sum(good & (area_b < 1e-12))),
            'sourceDegenerateTriangles': int(np.sum(~good))}


def point_camera(scene, direction):
    focus = Vector((0, -.09, .663))
    scene.camera.location = focus + Vector(direction).normalized() * 3
    scene.camera.rotation_euler = (focus - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera.data.type = 'ORTHO'
    scene.camera.data.ortho_scale = .47


def render(scene, output, name, direction):
    point_camera(scene, direction)
    scene.render.filepath = str(output / (name + '.png'))
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--reduced', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--samples', type=int, default=24)
    parser.add_argument('--skip-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if bpy.app.version[:2] != (4, 5):
        raise RuntimeError('Use Blender 4.5 LTS')
    args.output.mkdir(parents=True, exist_ok=False)
    baseline = []
    if args.source.suffix.lower() == '.glb':
        bpy.ops.wm.open_mainfile(filepath=str(args.reduced.resolve()))
        baseline = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        for obj in baseline:
            obj.hide_render = True
            obj.hide_set(True)
        bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
    else:
        bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    sources = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in baseline]
    if args.source.suffix.lower() == '.glb':
        if len(sources) != 1:
            raise ValueError('Expected one pre-extracted focal mesh')
        focal = sources[0]
        focal.name = 'Icarus_Focal_Source_Preserved'
        _, source_triangles = arrays(focal.data)
        extraction = {'sourceTriangles': len(source_triangles),
                      'selectedTriangles': len(source_triangles),
                      'vertices': len(focal.data.vertices),
                      'uvLayers': len(focal.data.uv_layers),
                      'sourceVertexErrorMeters': 0, 'sourceParts': 1}
    else:
        focal, extraction = extract_parts(sources, 'Icarus_Focal_Source_Preserved')
    control = cage()
    bpy.context.view_layer.objects.active = focal
    focal.select_set(True)
    modifier = focal.modifiers.new('Bound focal surface preservation study', 'SURFACE_DEFORM')
    modifier.target = control
    bpy.ops.object.surfacedeform_bind(modifier=modifier.name)
    if not modifier.is_bound:
        raise RuntimeError('Surface cage did not bind')
    rest, triangles = arrays(focal.data)
    neutral, _ = evaluated_coords(focal)
    report = {'productionReady': False, 'artState': 'NOT_REVIEWED',
              'reviewMode': 'SINGLE_AGENT_SELF_REVIEW', 'method': 'Original focal UV/corner normals and geometry; closed quad cage surface deformation',
              'source': {'path': str(args.source.resolve()), 'sha256': digest(args.source)},
              'reduced': {'path': str(args.reduced.resolve()), 'sha256': digest(args.reduced)},
              'extraction': extraction, 'projectionMisses': 0,
              'projectionMethod': 'Exact source triangle extraction; no rays or fallback depth',
              'neutralMaxDriftMeters': float(np.max(np.linalg.norm(neutral - rest, axis=1))),
              'cageQuadFaces': sum(len(p.vertices) == 4 for p in control.data.polygons),
              'deformations': {}, 'limitations': [
                  'Dense appearance source, outside game triangle budget',
                  'No eyelid/mouth topology or facial expression acceptance',
                  'Open boundary at collar; no watertight full-character integration',
                  'Long hair below collar excluded; no secondary motion',
                  'Original source flaws and identity difference from design remain',
                  'Body joint topology, hands, wings, UV bake, rig, Unity not changed or accepted']}
    extraction_record = Path(str(args.source) + '.json')
    if extraction_record.exists():
        report['originalSourceExtraction'] = json.loads(extraction_record.read_text())
    scene = bpy.context.scene
    scene.cycles.samples = args.samples
    scene.render.resolution_x = scene.render.resolution_y = 896
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    for key in control.data.shape_keys.key_blocks[1:]:
        key.value = 1
        bpy.context.view_layer.update()
        posed, _ = evaluated_coords(focal)
        report['deformations'][key.name] = deformation_facts(rest, posed, triangles)
        key.value = 0
    bpy.context.view_layer.update()
    if baseline:
        reduced = baseline
    else:
        with bpy.data.libraries.load(str(args.reduced.resolve()), link=False) as (available, target):
            target.objects = ['Mesh_0', 'Mesh_0.001']
        reduced = [o for o in target.objects if o is not None]
        for obj in reduced:
            scene.collection.objects.link(obj)
            obj.hide_render = True
            obj.hide_set(True)
    old_focal, _ = extract_parts(reduced, 'Rejected_Reduced_Focal_Comparison')
    old_focal.hide_render = True
    old_focal.hide_set(True)
    focal.hide_render = False
    for source in sources:
        source['preserved_original'] = True
    focal['productionReady'] = False
    for image in bpy.data.images:
        if image.source == 'FILE' and image.has_data:
            image.pack()
    bpy.ops.object.select_all(action='DESELECT')
    focal.select_set(True)
    bpy.context.view_layer.objects.active = focal
    point_camera(scene, (0, -1, 0))
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output / 'icarus-focal-surface-study.blend'))
    (args.output / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)
    if args.skip_render:
        return
    for view, direction in [('front', (0, -1, 0)), ('quarter', (.7, -1, 0))]:
        render(scene, args.output, 'preserved-' + view, direction)
    for key in control.data.shape_keys.key_blocks[1:]:
        key.value = 1
        render(scene, args.output, key.name, (0, -1, 0))
        key.value = 0
    bpy.context.view_layer.update()
    focal.hide_render = True
    old_focal.hide_render = False
    for view, direction in [('front', (0, -1, 0)), ('quarter', (.7, -1, 0))]:
        render(scene, args.output, 'reduced-' + view, direction)


if __name__ == '__main__':
    main()
