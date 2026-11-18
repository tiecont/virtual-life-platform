"""Render the preserved wing assembly's actual timeline for offline inspection."""

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wing_vertices(rig):
    points = []
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in sorted(rig.children, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        evaluated.to_mesh_clear()
    return points


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source = args.source.resolve()
    source_hash = digest(source)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    rig = scene.objects.get('Icarus_Wing_Study_6Bones')
    if rig is None or len(rig.data.bones) != 6 or not rig.animation_data:
        raise ValueError('Expected the existing six-bone wing study timeline')
    if scene.frame_start != 1 or scene.frame_end != 31:
        raise ValueError('Reconcile the changed wing study timeline before rendering')
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.fps = 15
    scene.render.fps_base = 1
    scene.camera.data.type = 'ORTHO'
    scene.camera.data.ortho_scale = 2.45
    report = {'source': str(source), 'sourceSha256': source_hash,
              'blender': bpy.app.version_string,
              'scope': 'Six-bone wing fold study; static retained body, no canonical action acceptance',
              'productionReady': False, 'runtimeEnabled': False, 'views': []}
    scene.frame_set(1)
    opened = wing_vertices(rig)
    scene.frame_set(31)
    folded = wing_vertices(rig)
    if not opened or len(opened) != len(folded):
        raise ValueError('Wing geometry changed topology or is missing')
    movement = max((after - before).length for before, after in zip(opened, folded))
    if movement < .01:
        raise ValueError('The wing mesh does not visibly deform across the timeline')
    report['maximumWingVertexDisplacementMeters'] = movement
    focus = Vector((0, .08, 0))
    for name, direction in [('front', (0, -1, 0)), ('back', (0, 1, 0)), ('side', (1, 0, 0))]:
        frames = output / name
        frames.mkdir()
        scene.camera.location = focus + Vector(direction) * 4
        scene.camera.rotation_euler = (focus - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        frame_hashes = []
        for frame in range(1, 32):
            scene.frame_set(frame)
            scene.render.filepath = str(frames / f'{frame:04d}.png')
            bpy.ops.render.render(write_still=True)
            frame_hashes.append(digest(Path(scene.render.filepath)))
        if len(set(frame_hashes)) < 25:
            raise ValueError(f'{name}: timeline did not produce distinct rendered frames')
        video = output / f'wing-fold-{name}.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-n', '-framerate', '15',
                        '-start_number', '1', '-i', str(frames / '%04d.png'),
                        '-frames:v', '31', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart', str(video)], check=True)
        probe = json.loads(subprocess.check_output([
            'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
            'stream=codec_name,width,height,nb_frames,r_frame_rate,duration',
            '-of', 'json', str(video)], text=True))['streams'][0]
        if (probe['codec_name'] != 'h264' or probe['nb_frames'] != '31'
                or probe['width'] != 640 or probe['height'] != 640
                or probe['r_frame_rate'] != '15/1'):
            raise ValueError(f'{name}: encoded video differs from the rendered timeline')
        report['views'].append({'view': name, 'frameSha256': frame_hashes,
                                'video': video.name, 'sha256': digest(video), 'stream': probe})
        (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    if digest(source) != source_hash:
        raise ValueError('Source changed during inspection')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
