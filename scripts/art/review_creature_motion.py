"""Render the exported Pet's actual animation clips with Blender in background mode.

blender -b --factory-startup --python-exit-code 1 --python scripts/art/review_creature_motion.py -- MODEL.glb NEW_DIRECTORY
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def evaluated_positions(meshes):
    graph = bpy.context.evaluated_depsgraph_get()
    positions = []
    for obj in meshes:
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        try:
            positions.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    return positions


def camera_for(points):
    low = Vector(tuple(min(p[axis] for p in points) for axis in range(3)))
    high = Vector(tuple(max(p[axis] for p in points) for axis in range(3)))
    center = (high + low) / 2
    radius = (high - low).length / 2
    bpy.ops.object.camera_add(location=center + Vector((1, -2.8, 1)).normalized() * radius * 4)
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = radius * 2.4
    camera.data.clip_end = max(100, radius * 10)
    return camera


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('model', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    model = args.model.resolve(strict=True)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
    armature, = (obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.find_armature() == armature]
    if not meshes:
        raise ValueError('No mesh bound to the imported armature')
    animation = armature.animation_data
    if not animation:
        raise ValueError('Expected exported animation tracks')
    # Blender imports glTF actions with a single strip per NLA track. Sampling
    # each strip in isolation keeps unrelated clips from blending into the pose.
    tracks = list(animation.nla_tracks)
    animation.action = None
    for track in tracks:
        track.mute = True
    scene = bpy.context.scene
    scene.frame_set(1)
    scene.camera = camera_for(evaluated_positions(meshes))
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    results = {}
    for track in tracks:
        strip, = track.strips
        action = strip.action.name
        track.mute = False
        length = strip.frame_end - strip.frame_start
        if length <= 0:
            raise ValueError(f'Empty clip {action}')
        peaks = []
        frames = []
        for index, fraction in enumerate((0, .25, .5, .75, 1)):
            time = strip.frame_start + length * fraction
            scene.frame_set(math.floor(time), subframe=time % 1)
            positions = evaluated_positions(meshes)
            if index == 0:
                rest = positions
            peaks.append(max((p - q).length for p, q in zip(positions, rest, strict=True)))
            filename = f'{Path(action).name}-{index}.png'
            scene.render.filepath = str(output / filename)
            bpy.ops.render.render(write_still=True)
            frames.append(filename)
        track.mute = True
        if max(peaks) < 0.0001:
            raise ValueError(f'{action} failed to deform exported geometry')
        results[action] = {'durationFrames': length, 'maxDisplacementMeters': max(peaks), 'sampleDisplacementMeters': peaks, 'frames': frames}
    if {action.rsplit('_', 1)[-1] for action in results} != {'Idle', 'Attack', 'Skill', 'Hit'}:
        raise ValueError('Expected four named Pet combat actions')
    report = {'model': model.name, 'sha256': hashlib.sha256(model.read_bytes()).hexdigest(),
              'editor': bpy.app.version_string, 'renderEngine': scene.render.engine,
              'meshes': len(meshes), 'bones': len(armature.data.bones), 'actions': results}
    (output / 'motion-review.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
