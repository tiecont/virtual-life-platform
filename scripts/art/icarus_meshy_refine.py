"""Inspect and stage an immutable Meshy character draft with pinned Blender 4.5."""

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def stats(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    result = {'name': obj.name, 'vertices': len(mesh.vertices), 'polygons': len(mesh.polygons),
              'triangles': len(mesh.loop_triangles), 'uvLayers': len(mesh.uv_layers),
              'boundaryEdges': sum(e.is_boundary for e in bm.edges),
              'nonmanifoldEdges': sum(not e.is_manifold for e in bm.edges),
              'looseVertices': sum(not v.link_faces for v in bm.verts),
              'materials': [m.name for m in mesh.materials if m],
              'dimensions': list(obj.dimensions)}
    bm.free()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    assert bpy.app.version[:2] == (4, 5), 'Pinned Blender 4.5 required'
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    before = [stats(o) for o in meshes]
    points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    # Meshy draft has no halo. Overall height remains a provisional scale proxy.
    factor = 1.78 / (high.z - low.z)
    center = Vector(((high.x + low.x) / 2, (high.y + low.y) / 2, low.z))
    for obj in meshes:
        world = obj.matrix_world.copy()
        for vertex in obj.data.vertices:
            vertex.co = (world @ vertex.co - center) * factor
        obj.matrix_world.identity()
        obj.name = 'Icarus_Meshy_Draft'
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    for image in bpy.data.images:
        if image.source == 'FILE' and image.has_data:
            image.pack()
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('NeutralStudio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.21, 0.21, 0.21, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.5
    scene.view_settings.view_transform = 'Standard'
    for name, pos, power, size in [('Key', (3, -4, 5), 350, 4), ('Fill', (-3, -2, 3), 220, 4), ('Rim', (0, 3, 4), 300, 3)]:
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.shape, light.size = power, 'DISK', size
        obj = bpy.data.objects.new(name, light)
        scene.collection.objects.link(obj)
        obj.location = pos
        obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.25
    views = [('front', 0), ('front-three-quarter', 45), ('side', 90), ('rear-three-quarter', 135), ('back', 180)]
    for name, degrees in views:
        theta = math.radians(degrees)
        camera.location = (4 * math.sin(theta), -4 * math.cos(theta), 0.95)
        camera.rotation_euler = (Vector((0, 0, 0.95)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(out / f'{name}.png')
        bpy.ops.render.render(write_still=True)
    camera.data.ortho_scale = 0.55
    camera.location = (0, -4, 1.52)
    camera.rotation_euler = (Vector((0, 0, 1.52)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(out / 'portrait.png')
    bpy.ops.render.render(write_still=True)
    camera.data.ortho_scale = 2.25
    camera.location = (0, -4, 0.95)
    camera.rotation_euler = (Vector((0, 0, 0.95)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(filepath=str(out / 'icarus-draft.glb'), use_selection=True, export_format='GLB')
    bpy.ops.export_scene.fbx(filepath=str(out / 'icarus-draft.fbx'), use_selection=True,
                             object_types={'MESH'}, add_leaf_bones=False, bake_anim=False,
                             path_mode='COPY', embed_textures=True, axis_forward='-Z', axis_up='Y')
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'icarus-draft.blend'))
    result = {'blender': bpy.app.version_string, 'state': 'MESHY_DRAFT', 'before': before,
              'after': [stats(o) for o in meshes], 'originalBounds': [list(low), list(high)],
              'scaleFactor': factor, 'scaleQualification': 'Overall1.78m proxy; body1.68m not certified',
              'productionReady': False, 'rigged': False, 'canonicalAnimationsPresent': [],
              'normalMap': False, 'ormMap': False, 'emissiveMask': False,
              'changes': ['Preserved raw Meshy', 'Normalized draft coordinates', 'Smooth surface normals', 'Packed base color', 'Native Blender/GLB/FBX and five review angles']}
    (out / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    main()
