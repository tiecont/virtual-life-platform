"""Build an editable, isolated Icarus wing candidate in background Blender.

Run with Blender 4.5 --background --python this_file -- --output DIR.
This replaces no accepted asset and does not qualify the full character.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--context', type=Path)
    parser.add_argument('--skip-bake', action='store_true')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def feather(name, root, tip, width, index, high=False):
    rows, columns = (48, 12) if high else (12, 4)
    direction = Vector(tip) - Vector(root)
    lateral = Vector((-direction.z, 0, direction.x)).normalized()
    vertices, faces, uv = [], [], []
    for surface in range(2):
        for row in range(rows + 1):
            t = row / rows
            profile = max(.012, math.sin(math.pi * t) ** .72)
            center = Vector(root) + direction * t
            center.y += .028 * math.sin(math.pi * t)
            center.x += (.014 if root[0] > 0 else -.014) * math.sin(math.pi * t)
            for column in range(columns + 1):
                s = 2 * column / columns - 1
                # Full vane shoulders and a central camber replace faceted spikes.
                point = center + lateral * (width * profile * s * (.92 if s < 0 else 1.08))
                point.y += (.0045 * s * s + .0015 * surface) * profile
                if high:
                    point.y += .00012 * math.sin(t * 260 + abs(s) * 23) * (1 - s * s) * profile
                vertices.append(tuple(point))
                if high:
                    uv.append((column / columns, t))
                else:
                    cell_x, cell_y = index % 8, index // 8
                    uv.append(((cell_x + .025 + surface * .49 + column / columns * .46) / 8,
                               (cell_y + .08 + t * .89) / 7))
    stride, half = columns + 1, (columns + 1) * (rows + 1)
    for row in range(rows):
        for column in range(columns):
            a = row * stride + column
            faces.extend([(a, a + stride, a + stride + 1, a + 1),
                          (half + a + 1, half + a + stride + 1, half + a + stride, half + a)])
    boundary = (list(range(stride)) + [r * stride + columns for r in range(1, rows + 1)]
                + [rows * stride + c for c in range(columns - 1, -1, -1)]
                + [r * stride for r in range(rows - 1, 0, -1)])
    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        faces.append((a, b, half + b, half + a))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    layer = mesh.uv_layers.new(name='FeatherUV' if high else 'WingAtlas')
    surface_faces = rows * columns * 2
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            layer.data[loop].uv = uv[mesh.loops[loop].vertex_index]
        if not high and polygon.index >= surface_faces:
            # Give each thickness wall its own strip instead of overlapping a vane.
            edge = polygon.index - surface_faces
            x0 = (index % 8 + .025 + .95 * edge / len(boundary)) / 8
            x1 = (index % 8 + .025 + .95 * (edge + 1) / len(boundary)) / 8
            y0, y1 = (index // 8 + .012) / 7, (index // 8 + .045) / 7
            for loop, point in zip(polygon.loop_indices, ((x0, y0), (x1, y0), (x1, y1), (x0, y1))):
                layer.data[loop].uv = point
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    # Normals are recalculated on the actual closed vane, before any bake.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    obj['component_role'] = 'matched_high' if high else 'editable_low'
    obj['productionReady'] = False
    return obj


def source_material():
    material = bpy.data.materials.new('FeatherSource_IvoryBlush')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .56
    tex = nodes.new('ShaderNodeTexCoord')
    separate = nodes.new('ShaderNodeSeparateXYZ')
    links.new(tex.outputs['UV'], separate.inputs[0])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0
    ramp.color_ramp.elements[0].color = (.67, .62, .58, 1)
    ramp.color_ramp.elements[1].position = .65
    ramp.color_ramp.elements[1].color = (.94, .93, .89, 1)
    ramp.color_ramp.elements.new(1).color = (.88, .69, .73, 1)
    links.new(separate.outputs['Y'], ramp.inputs[0])
    links.new(ramp.outputs[0], bsdf.inputs['Base Color'])
    return material


def build_pairs():
    source = source_material()
    target = bpy.data.materials.new('WingCandidate_Atlas')
    target.use_nodes = True
    target.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .56
    target.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.92, .88, .83, 1)
    pairs = []
    index = 0
    for sign, side in ((1, 'L'), (-1, 'R')):
        groups = [('Primary', 11, .058, .23), ('Secondary', 8, .050, .205),
                  ('Covert', 7, .040, .175)]
        for group, count, width, depth in groups:
            for i in range(count):
                t = i / (count - 1)
                # Roots follow the shoulder-to-wrist sweep; they do not share a fan pivot.
                if group == 'Primary':
                    root_x, root_z = .25 + .25 * t, .40 + .20 * t
                    tip_x, tip_z = .36 + .59 * t, .05 + .82 * t
                elif group == 'Secondary':
                    root_x, root_z = .17 + .25 * t, .43 + .14 * t
                    tip_x, tip_z = .23 + .40 * t, .12 + .34 * t
                else:
                    root_x, root_z = .13 + .33 * t, .44 + .18 * t
                    tip_x, tip_z = .22 + .34 * t, .34 + .19 * t
                root = (sign * root_x, depth, root_z)
                tip = (sign * tip_x, depth + .025, tip_z)
                name = f'Wing.{side}.{group}.{i + 1:02d}'
                low = feather(name, root, tip, width * (1 - .18 * t), index)
                high = feather(name + '.HIGH', root, tip, width * (1 - .18 * t), index, high=True)
                low.data.materials.append(target)
                high.data.materials.append(source)
                pairs.append((low, high))
                index += 1
    return pairs, target


def bake(pairs, material, output):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_cage = False
    scene.render.bake.cage_extrusion = .002
    scene.render.bake.max_ray_distance = .008
    scene.render.bake.margin = 3
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    images = {}
    for low, high in pairs:
        high.hide_render = True
        high.hide_set(True)
    for label, kind in (('Albedo', 'DIFFUSE'), ('Normal', 'NORMAL')):
        image = bpy.data.images.new('IcarusWing_' + label, 2048, 2048, alpha=False)
        image.generated_color = (1, 0, 1, 1) if label == 'Albedo' else (.5, .5, 1, 1)
        image.colorspace_settings.name = 'sRGB' if label == 'Albedo' else 'Non-Color'
        node = material.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        material.node_tree.nodes.active = node
        for low, high in pairs:
            bpy.ops.object.select_all(action='DESELECT')
            low.select_set(True)
            high.hide_render = False
            high.hide_set(False)
            high.select_set(True)
            bpy.context.view_layer.objects.active = low
            scene.render.bake.use_clear = False
            print('ISOLATED_BAKE', label, low.name, flush=True)
            bpy.ops.object.bake(type=kind)
            high.hide_render = True
            high.hide_set(True)
        image.filepath_raw = str(output / (label + '.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        images[label] = node
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    material.node_tree.links.new(images['Albedo'].outputs['Color'], bsdf.inputs['Base Color'])
    normal = material.node_tree.nodes.new('ShaderNodeNormalMap')
    material.node_tree.links.new(images['Normal'].outputs['Color'], normal.inputs['Color'])
    material.node_tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    scene.render.bake.use_selected_to_active = False


def render(output, pairs, context):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1200, 800
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Neutral wing inspection')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.14, .14, .14, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .6
    scene.view_settings.view_transform = 'AgX'
    for name, location, power in [('Key', (2, -3, 3), 220), ('Fill', (-2, -1, 1), 120),
                                   ('Back', (0, 3, 2), 180)]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
        light.data.energy, light.data.size = power, 2
    camera = bpy.data.objects.new('WingInspection', bpy.data.cameras.new('WingInspection'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    for low, high in pairs:
        high.hide_render = True
        high.hide_set(True)
    for label, direction in [('front', (0, -1, .05)), ('back', (0, 1, .05)), ('side', (1, -.25, .04))]:
        focus = Vector((0, .2, .45))
        camera.location = focus + Vector(direction).normalized() * 4
        camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = 2.05
        scene.render.filepath = str(output / (label + '.png'))
        bpy.ops.render.render(write_still=True)
    # Context is kept intact and hidden in the delivery; no source mesh surgery.
    if context:
        with bpy.data.libraries.load(str(context), link=False) as (src, dst):
            dst.objects = [name for name in src.objects if name.startswith('Mesh_0')]
        for obj in dst.objects:
            scene.collection.objects.link(obj)
            obj.name = 'UnmodifiedContext.' + obj.name
            obj.hide_render = True
            obj.hide_set(True)


def main():
    args = arguments()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    pairs, material = build_pairs()
    if not args.skip_bake:
        bake(pairs, material, output)
    render(output, pairs, args.context)
    for low, high in pairs:
        high.hide_render = True
        high.hide_set(True)
    bpy.ops.object.select_all(action='DESELECT')
    for low, high in pairs:
        low.select_set(True)
    bpy.context.view_layer.objects.active = pairs[0][0]
    bpy.ops.export_scene.gltf(filepath=str(output / 'icarus-wing-candidate.glb'), use_selection=True,
                             export_format='GLB', export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'icarus-wing-candidate.blend'))
    facts = {'productionReady': False, 'artState': 'NOT_REVIEWED',
             'reviewMode': 'SINGLE_AGENT_SELF_REVIEW', 'blender': bpy.app.version_string,
             'method': 'Rebuilt separate closed feather vanes; isolated matched high/low pair bakes',
             'sourceDetail': 'New geometric vane detail; not original highpoly texture transfer',
             'pairs': len(pairs), 'components': [], 'baked': not args.skip_bake,
             'openGates': ['Root anatomy and articulation', 'Whole-character budget and topology',
                           'Face, hands, hair and garment topology', 'Rig, 16 actions, LODs and Unity']}
    for low, high in pairs:
        low.data.calc_loop_triangles()
        facts['components'].append({'name': low.name, 'vertices': len(low.data.vertices),
                                    'triangles': len(low.data.loop_triangles),
                                    'quadFaces': sum(len(p.vertices) == 4 for p in low.data.polygons)})
    facts['triangles'] = sum(row['triangles'] for row in facts['components'])
    (output / 'inspection.json').write_text(json.dumps(facts, indent=2) + '\n')


if __name__ == '__main__':
    main()
