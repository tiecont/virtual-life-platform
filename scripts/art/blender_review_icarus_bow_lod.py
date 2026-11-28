"""Reimport the private bow GLB and compare its draw and color with approved frames."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_lod_icarus_bow import ATLAS, DRAW, SOURCE
from blender_probe_icarus_clay_parts import capture, stage_camera
from blender_review_icarus_accessory_clay import array_values, file_hash, meshes


def assert_embedded_atlas(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    metadata = json.loads(data[20:20 + size])
    (image,) = metadata['images']
    source = metadata['bufferViews'][image['bufferView']]
    start = 28 + size + source.get('byteOffset', 0)
    texture = data[start:start + source['byteLength']]
    if sha256(texture).hexdigest() != ATLAS or struct.unpack_from('>II', texture, 16) != (4096, 4096):
        raise ValueError('The actual imported GLB must embed the exact approved 4K atlas')


def sampled_shape(obj, key, weight):
    key.value = weight
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        local = array_values(mesh.vertices, 'co', 3, np.float32)
        matrix = np.asarray(evaluated.matrix_world)
        return local @ matrix[:3, :3].T + matrix[:3, 3]
    finally:
        evaluated.to_mesh_clear()


def image_rgb(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        image.colorspace_settings.name = 'Non-Color'
        width, height = image.size
        rgba = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(rgba)
        return np.rint(rgba.reshape(height, width, 4)[..., :3] * 255).astype(np.int16)
    finally:
        bpy.data.images.remove(image)


def match_frame(source, lod):
    if source.shape != lod.shape:
        raise ValueError('Approved and derivative views have different camera resolutions')
    mask = lambda pixels: np.max(np.abs(pixels - pixels[0, 0]), axis=2) > 20
    original, reduced = mask(source), mask(lod)
    overlap = original & reduced
    return {'silhouetteIntersectionOverUnion': float(overlap.sum() / (original | reduced).sum()),
            'overlappingColorMeanAbsoluteErrorRgb8': float(np.abs(source[overlap] - lod[overlap]).mean()),
            'sourcePixels': int(original.sum()), 'lodPixels': int(reduced.sum())}


def compare_upper_join(source, lod, camera, anchor):
    height, width = source.shape[:2]
    rows = [world_to_camera_view(bpy.context.scene, camera, anchor + Vector((0, 0, offset)))
            for offset in (.005, .035)]
    x = round(rows[0].x * width)
    lo, hi = sorted(round(row.y * height) for row in rows)
    source_contrast = np.max(np.abs(source[lo:hi, x - 3:x + 4] - source[0, 0]), axis=(1, 2))
    lod_contrast = np.max(np.abs(lod[lo:hi, x - 3:x + 4] - lod[0, 0]), axis=(1, 2))
    missed = np.flatnonzero((source_contrast >= 22) & (lod_contrast < 22))
    runs = np.split(missed, np.flatnonzero(np.diff(missed) != 1) + 1)
    return {'windowColumns': [x - 3, x + 4], 'windowRowsFromBottom': [lo, hi],
            'sourceVisibleRows': int(np.count_nonzero(source_contrast >= 22)), 'missingVisibleRows': int(len(missed)),
            'longestMissingRunPixels': max(map(len, runs))}


def setup_emission(objects):
    camera, _, _, _ = stage_camera('bow', objects)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 768, 1024
    scene.render.film_transparent = False
    scene.render.use_stamp = False
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 8
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    world = bpy.data.worlds.new('Neutral backdrop')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.17, .17, .17, 1)
    (material,) = {obj.data.materials[0] for obj in objects}
    nodes = material.node_tree.nodes
    (texture,) = [node for node in nodes if node.type == 'TEX_IMAGE']
    emit = nodes.new('ShaderNodeEmission')
    material.node_tree.links.new(texture.outputs['Color'], emit.inputs['Color'])
    material.node_tree.links.new(emit.outputs['Emission'], nodes.get('Material Output').inputs['Surface'])
    return camera


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('candidate', type=Path)
    parser.add_argument('approved_frames', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    exported = (args.candidate / 'IcarusBowApprovedColorLOD.glb').resolve(strict=True)
    lod = json.loads((args.candidate / 'bow-lod-receipt.json').read_text())
    approved = json.loads((args.approved_frames / 'capture.json').read_text())
    if (bpy.app.version[:2] != (5, 3) or lod['sourceSha256'] != SOURCE or approved['candidateSha256'] != SOURCE
            or approved['atlasSha256'] != ATLAS or file_hash(exported) != lod['files'][exported.name]):
        raise ValueError('The exact private bow and the approved base-color frames are required')
    assert_embedded_atlas(exported)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(exported))
    bpy.context.view_layer.update()
    obj = {mesh.name: mesh for mesh in meshes()}
    if set(obj) != {'BowBody', 'BowString'} or bpy.data.objects['BowGrip'].matrix_world.translation.length > 1e-6:
        raise ValueError('Reimport changed the two renderers or grip pivot')
    for part in obj.values():
        part.data.calc_loop_triangles()
    triangles = sum(len(part.data.loop_triangles) for part in obj.values())
    if triangles != lod['triangles'] or len({part.data.materials[0] for part in obj.values()}) != 1:
        raise ValueError('Reimport changed the bow triangle count or atlas batching')
    string = obj['BowString']
    key = string.data.shape_keys.key_blocks[DRAW]
    rest = sampled_shape(string, key, 0)
    drawn = sampled_shape(string, key, 1)
    released = sampled_shape(string, key, 0)
    displacement = drawn - rest
    endpoint = (rest[:, 2] < rest[:, 2].min() + 1e-6) | (rest[:, 2] > rest[:, 2].max() - 1e-6)
    endpoint_error = float(np.linalg.norm(displacement[endpoint], axis=1).max())
    release_error = float(np.linalg.norm(rest - released, axis=1).max())
    peak = float(displacement[:, 1].max())
    if (peak < .099 or np.max(np.abs(displacement[:, (0, 2)])) > 1e-6
            or endpoint_error > 1e-6 or release_error > 1e-6):
        raise ValueError('Reimport changed the approved physical string motion')

    args.output.mkdir(parents=True, exist_ok=False, mode=0o700)
    camera = setup_emission(list(obj.values()))
    lo, hi = np.asarray(lod['sourceBoundsBlenderMeters'])
    grip = np.asarray(lod['grip']['sourceBlenderMeters'])
    center = Vector((lo + hi) / 2 - grip)
    anchor = Vector(np.asarray(lod['string']['endSourceBlenderMeters']) - grip)
    scale = float(np.linalg.norm(hi - lo)) * 1.10
    frames = []
    for view in approved['frames']:
        reference = args.approved_frames / view['file']
        if file_hash(reference) != view['sha256']:
            raise ValueError(f'Changed approved frame {reference}')
        output = args.output / view['file']
        captured = capture(camera, center, scale, Vector(view['direction']), output)
        source_pixels, lod_pixels = image_rgb(reference), image_rgb(output)
        frame = {'view': view['view'], **captured, 'sourceFrameSha256': view['sha256'],
                 **match_frame(source_pixels, lod_pixels)}
        if view['view'] in ('left', 'right'):
            frame['upperStringJoinPixels'] = compare_upper_join(source_pixels, lod_pixels, camera, anchor)
        frames.append(frame)
    key.value = 1
    bpy.context.view_layer.update()
    draw_frame = capture(camera, center, scale, Vector((1, 0, 0)), args.output / 'left-full-draw.png')
    key.value = 0
    report = {'sourceSha256': SOURCE, 'glbSha256': file_hash(exported), 'atlasSha256': ATLAS, 'triangles': triangles,
              'peakDrawMeters': peak, 'maxFixedEndpointDeviationMeters': endpoint_error, 'maxReleasedRestErrorMeters': release_error,
              'frames': frames, 'drawFrame': draw_frame}
    (args.output / 'bow-lod-reimport.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'triangles': triangles, 'peakDrawMeters': peak, 'frames': frames}, indent=2), flush=True)


if __name__ == '__main__':
    main()
