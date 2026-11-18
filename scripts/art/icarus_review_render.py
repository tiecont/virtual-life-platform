"""Render real Blender review frames without modifying the source asset."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--portrait-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    assert bpy.app.version[:2] == (4, 5)
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.source).resolve()))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'
    scene.world = bpy.data.worlds.new('ReviewStudio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.22, .22, .22, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .5
    for name, pos, power in [('Key', (3, -4, 5), 350), ('Fill', (-3, -2, 3), 220), ('Rim', (0, 3, 4), 300)]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        scene.collection.objects.link(light)
        light.data.energy, light.data.size = power, 4
        light.location = pos
        light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    body = bpy.data.objects.get('Icarus_LOD0')
    facts = {'source': args.source, 'blender': bpy.app.version_string, 'actions': [], 'productionReady': False}

    def render(name, angle=0, portrait=False):
        focus = Vector((0, 0, 1.48 if portrait else .94))
        camera.data.ortho_scale = .46 if portrait else 2.22
        theta = math.radians(angle)
        camera.location = focus + Vector((4*math.sin(theta), -4*math.cos(theta), 0))
        camera.rotation_euler = (focus-camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(output / (name + '.png'))
        bpy.ops.render.render(write_still=True)

    rig.animation_data.action = bpy.data.actions.get('idle')
    scene.frame_set(1)
    if args.portrait_only:
        render('portrait', portrait=True)
        return
    for name, angle in [('front', 0), ('three-quarter', 45), ('side', 90), ('back', 180)]:
        render(name, angle)
    render('portrait', portrait=True)
    for name in ['idle', 'wing_fold_test', 'bow_draw_test', 'provider_walk_unreviewed']:
        action = bpy.data.actions.get(name)
        if not action:
            continue
        rig.animation_data.action = action
        if hasattr(action, 'slots') and action.slots:
            rig.animation_data.action_slot = action.slots[0]
        points = []
        for frame in (1, 15, 30, 45, 60):
            scene.frame_set(frame)
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = body.evaluated_get(depsgraph)
            points.append([tuple(evaluated.matrix_world @ v.co) for v in evaluated.data.vertices])
            if name != 'provider_walk_unreviewed' and frame in (1, 30):
                render(f'{name}-{frame:03d}', 20)
        delta = max((Vector(a)-Vector(b)).length for a,b in zip(points[0], points[2]))
        facts['actions'].append({'name': name, 'range': list(action.frame_range), 'maxVertexDeltaMeters': delta})
    (output / 'inspection.json').write_text(json.dumps(facts, indent=2) + '\n')
    print(json.dumps(facts), flush=True)


if __name__ == '__main__':
    main()
