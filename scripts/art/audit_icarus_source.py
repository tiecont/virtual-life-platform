"""Measure the exact original Icarus VRM without importing or changing its geometry."""

from argparse import ArgumentParser
import json
from pathlib import Path
import struct
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from icarus_wing_parts import accessor, checksum, parse_glb, topology


MANIFEST = Path(__file__).resolve().parents[2] / 'assets/manifests/legacy-icarus-vrm.manifest.json'
REGIONS = {
    # Rest-space samples around the original front surface. The mouth and
    # chin bounds follow the earlier inspection in the smile and jaw scripts.
    'leftEyeWindow': ((.010, 1.484, .115), (.070, 1.541, .201)),
    'rightEyeWindow': ((-.070, 1.484, .115), (-.010, 1.541, .201)),
    'mouthWindow': ((-.034, 1.440, .135), (.034, 1.468, .201)),
    'chinWindow': ((-.055, 1.408, .112), (.055, 1.436, .201)),
}


def percentiles(values):
    if not len(values):
        return None
    ranks = [5, 50, 95]
    return {f'p{rank}': float(value) for rank, value in zip(ranks, np.percentile(values, ranks))}


def jpeg_dimensions(content):
    if content[:2].tobytes() != b'\xff\xd8':
        raise ValueError('The pinned source texture must contain a JPEG image')
    position = 2
    start_of_frame = {0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf}
    while position + 4 <= len(content) and content[position] == 0xff:
        position += 1
        if content[position] == 0xff:
            continue
        marker = content[position]
        position += 1
        length = struct.unpack_from('>H', content, position)[0]
        if length < 2 or position + length > len(content) or marker == 0xda:
            break
        if marker in start_of_frame and length >= 8:
            height, width = struct.unpack_from('>HH', content, position + 3)
            if width and height:
                return [width, height]
        position += length
    raise ValueError('The source JPEG has no valid frame dimensions')


def material_facts(document, binary):
    rows = []
    for material in document['materials']:
        texture = material['pbrMetallicRoughness']['baseColorTexture']
        if texture.get('texCoord', 0) != 0 or texture.get('extensions'):
            raise ValueError('The exact baseline is expected to map TEXCOORD_0 directly')
        image_index = document['textures'][texture['index']]['source']
        image = document['images'][image_index]
        view = document['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        content = binary[start:start + view['byteLength']]
        rows.append({'material': material['name'], 'image': image['name'], 'imageIndex': image_index,
                     'imageSha256': checksum(content), 'baseColorTexels': jpeg_dimensions(content),
                     'authoredNormalTexture': 'normalTexture' in material,
                     'alphaMode': material.get('alphaMode', 'OPAQUE')})
    return rows


def joints_u8(document, binary, index):
    row = document['accessors'][index]
    view = document['bufferViews'][row['bufferView']]
    if ((row['componentType'], row['type']) != (5121, 'VEC4') or row.get('normalized') or row.get('sparse')
            or view.get('buffer', 0) != 0):
        raise ValueError('The exact baseline uses dense unsigned-byte joint indices')
    return np.ndarray((row['count'], 4), np.uint8, binary,
                      view.get('byteOffset', 0) + row.get('byteOffset', 0), (view.get('byteStride', 4), 1))


def weight_facts(weights, joints, joint_names, facial_joints):
    positive = weights > 1e-6
    if joints[positive].max(initial=0) >= len(joint_names) or (weights < 0).any():
        raise ValueError('The source contains invalid deformation influences')
    sums = np.abs(weights.sum(axis=1) - 1)
    influences = np.bincount(positive.sum(axis=1), minlength=5)
    counts = np.bincount(joints[positive], minlength=len(joint_names))
    return {'vertexCountByInfluences': influences.tolist(), 'unweightedVertices': int(influences[0]),
            'weightSumDeviationOver1e-4': int(np.count_nonzero(sums > .0001)),
            'maxWeightSumDeviation': float(sums.max(initial=0)),
            'mostUsedJoints': [{'name': joint_names[i], 'positiveSlots': int(counts[i])}
                               for i in np.argsort(-counts, kind='stable')[:6] if counts[i]],
            'facialJointPositiveSlots': {name: int(counts[index]) for name, index in facial_joints.items()}}


def measure_triangles(positions, normals, uv, indices, resolution):
    points = positions[indices]
    cross = np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])
    area = np.linalg.norm(cross, axis=1) / 2
    geometric = area > 1e-12
    mapped = uv[indices]
    first, second = mapped[:, 1] - mapped[:, 0], mapped[:, 2] - mapped[:, 0]
    uv_area = (first[:, 0] * second[:, 1] - first[:, 1] * second[:, 0]) / 2
    degenerate_uv = np.abs(uv_area) <= 1e-12
    usable = geometric & ~degenerate_uv
    texel_area = np.abs(uv_area[usable]) * resolution[0] * resolution[1]
    density = np.sqrt(texel_area / area[usable])
    angle_dot = np.einsum('ij,ikj->ik', cross[geometric], normals[indices[geometric]])
    unique = np.unique(indices)
    return {'triangles': len(indices), 'referencedVertexSlots': len(unique), 'surfaceAreaSquareMeters': float(area.sum()),
            'zeroAreaGeometryTriangles': int(np.count_nonzero(~geometric)),
            'normalCornersOpposingFaceWinding': int(np.count_nonzero(angle_dot < 0)),
            'zeroAreaUvTriangles': int(np.count_nonzero(degenerate_uv)),
            'negativeSignedUvTriangles': int(np.count_nonzero(uv_area < -1e-12)),
            'uvVertexSlotsOutsideUnitSquare': int(np.count_nonzero(((uv[unique] < 0) | (uv[unique] > 1)).any(axis=1))),
            'sumAbsoluteUvArea': float(np.abs(uv_area).sum()),
            'texelDensityPixelsPerMeterByTriangle': percentiles(density),
            'areaWeightedEffectivePixelsPerMeter': float(np.sqrt(texel_area.sum() / area[usable].sum())) if usable.any() else None}


def inspect_primitive(document, binary, node, primitive, material):
    attrs = primitive['attributes']

    def read(name, width):
        return accessor(document, binary, attrs[name], width, {5126}).astype(np.float64)

    if primitive.get('mode', 4) != 4 or node.keys() & {'matrix', 'rotation', 'translation', 'scale'}:
        raise ValueError('Expected original-space, triangle-only skinned primitives')
    positions, normals, uv, weights = read('POSITION', 3), read('NORMAL', 3), read('TEXCOORD_0', 2), read('WEIGHTS_0', 4)
    joints = joints_u8(document, binary, attrs['JOINTS_0'])
    indices = accessor(document, binary, primitive['indices'], 1, {5123, 5125}).reshape(-1, 3)
    if (not len(indices) or indices.max() >= len(positions)
            or any(len(a) != len(positions) for a in (joints, weights, uv, normals))
            or not all(np.isfinite(a).all() for a in (positions, normals, uv, weights))):
        raise ValueError('The exact source contains invalid vertex streams')
    skin = document['skins'][node['skin']]
    names = [document['nodes'][index]['name'] for index in skin['joints']]
    v = document['extensions']['VRMC_vrm']['humanoid']['humanBones']
    facial_joints = {role: skin['joints'].index(v[role]['node']) for role in ('head', 'neck', 'leftEye', 'rightEye', 'jaw')
                     if role in v and v[role]['node'] in skin['joints']}
    identity = np.arange(len(positions))
    _, welded = np.unique(positions, axis=0, return_inverse=True)
    welded_faces = np.sort(welded[indices], axis=1)
    unit_error = np.abs(np.linalg.norm(normals, axis=1) - 1)
    resolution = material['baseColorTexels']
    report = {'node': node['name'], 'material': material['material'], 'originalVertexSlots': len(positions),
              'exactUniquePositions': int(welded.max()) + 1,
              'boundsMeters': [positions.min(axis=0).tolist(), positions.max(axis=0).tolist()],
              **measure_triangles(positions, normals, uv, indices, resolution),
              'duplicateTrianglesAfterExactPositionWeld': len(indices) - len(np.unique(welded_faces, axis=0)),
              'topologyByOriginalIndices': topology(indices, positions, uv, identity),
              'topologyByExactPositionWeld': topology(indices, positions, uv, welded),
              'normalLengthDeviation': {'maximum': float(unit_error.max()), 'over1e-3': int(np.count_nonzero(unit_error > .001))},
              'skin': weight_facts(weights, joints, names, facial_joints), 'morphTargets': len(primitive.get('targets', []))}
    if node['name'] in ('Body', 'Head'):
        report['frontFacialRegionSamples'] = {}
        face_centers = positions[indices].mean(axis=1)
        for region, (low, high) in REGIONS.items():
            selected = indices[((face_centers >= low) & (face_centers <= high)).all(axis=1)]
            vertex_mask = ((positions >= low) & (positions <= high)).all(axis=1)
            report['frontFacialRegionSamples'][region] = {
                **measure_triangles(positions, normals, uv, selected, resolution),
                'vertexSlotsInsideWindow': int(vertex_mask.sum()),
                'insideWindowWeights': weight_facts(weights[vertex_mask], joints[vertex_mask], names, facial_joints)}
    return report


def build(source):
    baseline = json.loads(MANIFEST.read_text())
    payload = source.read_bytes()
    original_sha = checksum(payload)
    if original_sha != baseline['sha256'] or len(payload) != baseline['sizeBytes']:
        raise ValueError('The input is not the exact original Charakuru Icarus VRM pinned in the manifest')
    document, binary = parse_glb(payload)
    vrm = document['extensions']['VRMC_vrm']
    roots = document['scenes'][document.get('scene', 0)]['nodes']
    materials = material_facts(document, binary)
    primitives = [inspect_primitive(document, binary, node, primitive, materials[primitive['material']])
                  for index, node in enumerate(document['nodes']) if 'mesh' in node and index in roots
                  for primitive in document['meshes'][node['mesh']]['primitives']]
    if len(primitives) != sum(len(mesh['primitives']) for mesh in document['meshes']):
        raise ValueError('Not all original mesh primitives are direct scene roots')
    expressions = []
    for kind, group in vrm['expressions'].items():
        for name, record in group.items():
            expressions.append({'kind': kind, 'name': name,
                                'morphBinds': len(record.get('morphTargetBinds', [])),
                                'materialColorBinds': len(record.get('materialColorBinds', [])),
                                'textureTransformBinds': len(record.get('textureTransformBinds', []))})
    if checksum(source.read_bytes()) != original_sha:
        raise ValueError('The original source changed during the read-only audit')
    return {'scope': 'Original Charakuru rest-surface and rig data', 'blender': bpy.app.version_string,
            'sourceSha256': original_sha, 'sourceBytes': len(payload), 'vrmSpecVersion': vrm['specVersion'],
            'meshNodes': len(document['meshes']), 'triangles': sum(row['triangles'] for row in primitives),
            'vertexSlots': sum(row['originalVertexSlots'] for row in primitives),
            'unweightedVertexSlots': sum(row['skin']['unweightedVertices'] for row in primitives),
            'totalMorphTargets': sum(row['morphTargets'] for row in primitives),
            'primitiveCount': len(primitives), 'totalJointSlots': sum(len(skin['joints']) for skin in document['skins']),
            'humanoidBoneRoles': sorted(vrm['humanoid']['humanBones']), 'lookAtType': vrm.get('lookAt', {}).get('type'),
            'expressions': expressions, 'baseColorMaterials': materials, 'primitives': primitives,
            'regionWindowsRestMeters': {name: {'min': bounds[0], 'max': bounds[1]} for name, bounds in REGIONS.items()},
            'methods': {'texelDensity': 'Square root of mapped base-color texel area divided by triangle rest-surface area; geometric and normalized UV areas at or below 1e-12 are treated as degenerate.',
                        'normals': 'Exported vertex-normal length and dot sign against each incident oriented triangle.',
                        'topology': 'Shared-edge connectivity within each primitive, measured both by source indices and exact xyz equality.',
                        'faceRegions': 'Front rest-space diagnostics on Body and Head; triangle selection by centroid and weight selection by vertex position.',
                        'weights': 'Positive means >1e-6; count joint influences by primitive vertex slot, including vertices split by material or UV.'},
            'unknowns': ['UV island overlaps and uniquely occupied atlas area',
                         'Which pixels correspond to lip, eye and eyelid landmarks inside the geometric windows',
                         'Shading, skinning, spring and facial deformation under animation in Unity',
                         'Appearance and release acceptance']}


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if bpy.app.version[:2] != (5, 3):
        raise RuntimeError('Run the source audit with Blender 5.3')
    report = build(args.source.resolve(strict=True))
    with args.output.open('x') as output:
        json.dump(report, output, indent=2, allow_nan=False)
        output.write('\n')
    print(f"Audited source {report['sourceSha256']} and {report['triangles']} original triangles", flush=True)


if __name__ == '__main__':
    main()
