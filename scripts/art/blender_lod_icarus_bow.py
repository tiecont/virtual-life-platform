"""Derive the approved Icarus bow and its fixed-nock pull for private Unity review."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils.bvhtree import BVHTree
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_review_icarus_accessory_clay import array_values, file_hash, meshes
from blender_texture_icarus_wing import PAD, SIZE, UV, groups, mesh_arrays


SOURCE = "50e50476525deb5976858ac3d1fa8275ec1c4eaa1578f4027ed34db034c27081"
ATLAS = "262a7adce53cb037a287a2c31cedee08494e97d06cf091705e37493391a03f43"
STRING = "tripo_part_52"
GRIP = "tripo_part_4"
EMBLEM = "tripo_part_2"
DRAW = "Private fixed-nock draw diagnostic"
IMPORTANT = {0, 1, 4, 6, 9, 16, 43, 44, 63}
MAX_TRIANGLES = 5000
STATIC_TRIANGLES = 4650


def triangle_budget(parts):
    limits, weights = {}, {}
    for name, obj in parts.items():
        index = int(name.rsplit("_", 1)[1])
        limits[name] = min(12, len(obj.data.polygons))
        x, y, z = obj.dimensions
        weights[name] = max(x * z, y * z, x * y, 1e-9) ** .5 * (1.7 if index in IMPORTANT else 1.0)
        if index in (0, 1):
            weights[name] *= 1.25
    remaining = STATIC_TRIANGLES - sum(limits.values())
    total = sum(weights.values())
    return {name: min(len(parts[name].data.polygons), count + int(remaining * weights[name] / total))
            for name, count in limits.items()}


def source_charts(name, points, modes, rectangles):
    return {int(mode): (points[modes == mode].min(axis=(0, 1)), points[modes == mode].max(axis=(0, 1)),
                        rectangles[name, int(mode)]) for mode in np.unique(modes)}


def uv_area(triangles):
    first, second = triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]
    return np.abs(first[:, 0] * second[:, 1] - first[:, 1] * second[:, 0])


def separate_collapsed_texels(triangles, low, high):
    quarter_texel = .25 / SIZE
    offsets = np.array(((1, 0), (-1, 0), (0, 1), (0, -1))) * quarter_texel
    collapsed = np.flatnonzero(uv_area(triangles) <= 1e-20)
    for index in collapsed:
        triangle = triangles[index]
        edges = np.linalg.norm(triangle - np.roll(triangle, -1, axis=0), axis=1)
        edge = int(edges.argmax())
        if edges[edge] <= quarter_texel / 2:
            center = np.clip(triangle.mean(axis=0), low + quarter_texel, high - quarter_texel)
            triangle[:] = center + offsets[[1, 0, 2]] / 2
        else:
            opposite = (edge + 2) % 3
            candidates = np.repeat(triangle[None, :, :], len(offsets), axis=0)
            candidates[:, opposite] = np.clip(triangle[opposite] + offsets, low, high)
            triangle[:] = candidates[uv_area(candidates).argmax()]
    return len(collapsed)


def exact_atlas_uv(name, vertices, faces, charts):
    points, modes, area = groups(vertices, faces)
    if np.any(area <= 0):
        raise ValueError(f"{name} LOD contains a zero-area triangle")
    uv = np.empty((len(faces), 3, 2), dtype=np.float32)
    texel_corrections = 0
    for mode in np.unique(modes):
        selected = modes == mode
        mapped_mode = int(mode)
        if mapped_mode not in charts:
            if (mapped_mode ^ 1) in charts:
                mapped_mode ^= 1
            else:
                normal = np.cross(points[selected, 1] - points[selected, 0], points[selected, 2] - points[selected, 0])
                mapped_mode = max(charts, key=lambda candidate: np.abs(normal[:, candidate // 2]).mean())
        low, high, (x, y, width, height) = charts[mapped_mode]
        planes = [axis for axis in range(3) if axis != mapped_mode // 2]
        flat = points[selected][..., planes]
        normalized = np.clip((flat - low[planes]) / np.maximum(high[planes] - low[planes], 1e-12), 0, 1)
        chart_low = np.array([x + PAD + .5, y + PAD + .5]) / SIZE
        chart_span = np.array([width - 2 * PAD - 1, height - 2 * PAD - 1]) / SIZE
        projected = (chart_low + normalized * chart_span).astype(np.float32)
        texel_corrections += separate_collapsed_texels(projected, chart_low, chart_low + chart_span)
        uv[selected] = projected
    if not np.isfinite(uv).all() or uv.min() <= 0 or uv.max() >= 1 or np.any(uv_area(uv) <= 1e-20):
        raise ValueError(f"{name} LOD contains an invalid approved-atlas UV")
    return uv, texel_corrections


def measure_surface(source, reduced, faces):
    tree = BVHTree.FromPolygons(reduced.tolist(), faces.tolist(), all_triangles=True)
    indices = np.linspace(0, len(source) - 1, min(2048, len(source)), dtype=int)
    samples = source[np.unique(np.concatenate((indices, source.argmin(axis=0), source.argmax(axis=0))))]
    distances = np.asarray([tree.find_nearest(point)[3] for point in samples])
    return tree, {"samples": len(samples), "p95Meters": float(np.percentile(distances, 95)),
                  "maximumMeters": float(distances.max())}


def simplify(obj, budget):
    if budget >= len(obj.data.polygons):
        return mesh_arrays(obj)[:2]
    reduction = obj.modifiers.new("Per-part silhouette reduction", 'DECIMATE')
    reduction.ratio = budget / len(obj.data.polygons)
    reduction.use_collapse_triangulate = True
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        return (array_values(mesh.vertices, "co", 3, np.float32),
                array_values(mesh.loop_triangles, "vertices", 3, np.int32))
    finally:
        evaluated.to_mesh_clear()
        obj.modifiers.remove(reduction)


def retain_upper_string_join(source_vertices, source_faces, reduced_vertices, reduced_faces, anchor):
    # Isolate the actual narrow circumference directly above the fixed string
    # join. The much larger limb drives the global collapse away from this seam.
    def corridor(points):
        return np.linalg.norm(points[..., :2] - anchor[:2], axis=-1) <= .006

    reduced_z = reduced_vertices[:, 2]
    surviving = reduced_z[corridor(reduced_vertices) & (reduced_z > anchor[2])]
    if not len(surviving):
        raise ValueError('The upper continuation lost its actual string surface')
    cutoff = min(float(surviving.min()) + .003, anchor[2] + .030)
    source_points = source_vertices[source_faces]
    keep = (corridor(source_points).all(axis=1) & (source_points[..., 2].min(axis=1) >= anchor[2] - .003)
            & (source_points[..., 2].max(axis=1) <= cutoff))
    trimmed_faces = source_faces[keep]
    if len(trimmed_faces) < 32:
        raise ValueError('No original surface patch was found for the fixed seam')
    used, index = np.unique(trimmed_faces.ravel(), return_inverse=True)
    mesh = bpy.data.meshes.new('Original upper continuation seam')
    mesh.from_pydata(source_vertices[used].tolist(), [], index.reshape(-1, 3).tolist())
    patch = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(patch)
    try:
        patch_vertices, patch_faces = simplify(patch, 56)
    finally:
        bpy.data.objects.remove(patch, do_unlink=True)
        bpy.data.meshes.remove(mesh)

    reduced_points = reduced_vertices[reduced_faces]
    overlapping = (corridor(reduced_points).all(axis=1)
                   & (reduced_points[..., 2].min(axis=1) >= anchor[2] - .003)
                   & (reduced_points[..., 2].max(axis=1) <= cutoff))
    return (np.concatenate((reduced_vertices, patch_vertices)),
            np.concatenate((reduced_faces[~overlapping], patch_faces + len(reduced_vertices))),
            {'sourceFaces': len(trimmed_faces), 'lodFaces': len(patch_faces), 'upperCutoffMeters': cutoff,
             'replacedOverlapFaces': int(overlapping.sum())})


def string_rings(obj, approved):
    basis, draw = obj.data.shape_keys.key_blocks
    if basis.name != 'Basis' or draw.name != DRAW or draw.value != 0:
        raise ValueError("The actual approved rest and draw shapes are required")
    source = array_values(basis.data, "co", 3, np.float32)
    moving = array_values(draw.data, "co", 3, np.float32)
    start = np.asarray(approved["startSourceWorldBlenderMeters"])
    end = np.asarray(approved["endSourceWorldBlenderMeters"])
    parameter = (source[:, 2] - start[2]) / (end[2] - start[2])
    delta = moving - source
    if np.abs(delta[:, (0, 2)]).max() > 1e-6:
        raise ValueError("The source morph has an unexpected draw axis")
    peak = int(np.argmax(delta[:, 1]))
    stations = np.unique(np.append(np.linspace(0, 1, 20), parameter[peak]))
    axis = start + parameter[:, None] * (end - start)
    xy = source[:, :2] - axis[:, :2]
    directions = np.column_stack((np.cos(np.arange(8) * np.pi / 4), np.sin(np.arange(8) * np.pi / 4)))
    rings = []
    for station in stations:
        neighbors = np.argsort(np.abs(parameter - station))[:96]
        spread = xy[neighbors]
        radial = np.linalg.norm(spread, axis=1)
        unit = spread / np.maximum(radial[:, None], 1e-8)
        radii = [np.median(radial[np.argsort(unit @ direction)[-12:]]) for direction in directions]
        perimeter = directions * np.asarray(radii)[:, None]
        center = start + station * (end - start)
        positions = np.repeat(center[None, :], len(directions), axis=0)
        positions[:, :2] += perimeter
        rings.extend(positions.tolist())
    faces = []
    for index in range(len(stations) - 1):
        for step in range(8):
            a, b = index * 8 + step, index * 8 + (step + 1) % 8
            faces.extend(((a, b, a + 8), (b, b + 8, a + 8)))
    lower, upper, top = len(rings), len(rings) + 1, (len(stations) - 1) * 8
    for step in range(8):
        following = (step + 1) % 8
        faces.extend(((lower, following, step), (upper, top + step, top + following)))
    rest = np.asarray([*rings, start.tolist(), end.tolist()], dtype=np.float32)
    drawn = rest.copy()
    ordered = np.argsort(parameter)
    displacements = np.interp(stations, parameter[ordered], delta[ordered, 1])
    displacements[0] = displacements[-1] = 0
    drawn[:-2, 1] += np.repeat(displacements, 8)
    return source, rest, drawn, np.asarray(faces, dtype=np.int32), start, end


def build_mesh(name, vertices, triangles, uv, material, parent):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices.tolist(), [], triangles.tolist(), shade_flat=False)
    if mesh.validate():
        raise ValueError(f"Blender modified invalid {name} topology")
    layer = mesh.uv_layers.new(name=UV)
    layer.uv.foreach_set("vector", uv.ravel())
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return obj


def glb_axes(point):
    return [float(point[0]), float(point[2]), float(-point[1])]


def exact_glb_atlas(path, approved_atlas):
    data = path.read_bytes()
    magic, version, size, json_size, json_tag = struct.unpack_from("<4sIIII", data)
    if (magic, version, size, json_tag) != (b'glTF', 2, len(data), 0x4E4F534A):
        raise ValueError("Unexpected Blender GLB output")
    payload = json.loads(data[20:20 + json_size])
    (texture,) = payload["images"]
    view_number = texture["bufferView"]
    binary = data[28 + json_size:]
    chunks = bytearray()
    for index, view in enumerate(payload["bufferViews"]):
        start = view.get("byteOffset", 0)
        result = approved_atlas if index == view_number else binary[start:start + view["byteLength"]]
        chunks.extend(b'\0' * (-len(chunks) % 4))
        view['byteOffset'], view['byteLength'] = len(chunks), len(result)
        chunks.extend(result)
    texture["mimeType"] = "image/png"
    payload["buffers"][0]["byteLength"] = len(chunks)
    metadata = json.dumps(payload, separators=(',', ':')).encode()
    metadata += b' ' * (-len(metadata) % 4)
    chunks.extend(b'\0' * (-len(chunks) % 4))
    with path.open('wb') as file:
        file.write(struct.pack("<4sIIII", b'glTF', 2, 28 + len(metadata) + len(chunks), len(metadata), 0x4E4F534A))
        file.write(metadata)
        file.write(struct.pack("<II", len(chunks), 0x004E4942))
        file.write(chunks)
    return payload


def main():
    parser = ArgumentParser(description=__doc__)
    for name in ('source', 'atlas_receipt', 'draw_receipt', 'output'):
        parser.add_argument(name, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    atlas_review = json.loads(args.atlas_receipt.read_text())
    draw_review = json.loads(args.draw_receipt.read_text())
    if (bpy.app.version[:2] != (5, 3) or file_hash(args.source) != SOURCE
            or atlas_review['candidateSha256'] != SOURCE or atlas_review['atlasSha256'] != ATLAS
            or atlas_review['sourceSha256'] != draw_review['candidateSha256']):
        raise ValueError("The exact approved Blender 5.3 source and existing atlas/string records are required")
    args.output.mkdir(parents=True, exist_ok=False, mode=0o700)
    source_path = args.source.resolve(strict=True)
    bpy.ops.wm.open_mainfile(filepath=str(source_path), load_ui=False, use_scripts=False)
    bpy.context.view_layer.update()
    parts = {obj.name: obj for obj in meshes()}
    if len(parts) != 64 or set(parts) != {row['part'] for row in atlas_review['parts']}:
        raise ValueError("Expected all 64 approved provider parts")
    if any(np.max(np.abs(np.asarray(obj.matrix_world) - np.eye(4))) > 1e-6 for obj in parts.values()):
        raise ValueError("Source provider part axes changed")
    (material,) = {obj.data.materials[0] for obj in parts.values()}
    packed = material.node_tree.nodes['Exact original plate atlas'].image.packed_file
    approved_atlas = bytes(packed.data)
    if sha256(approved_atlas).hexdigest() != ATLAS:
        raise ValueError("The source embedded 4K atlas changed")

    string = parts.pop(STRING)
    grip_source = array_values(parts[GRIP].data.vertices, 'co', 3, np.float32)
    grip_height = min(point[2] for point in parts[EMBLEM].bound_box) - .020
    slice_points = grip_source[np.abs(grip_source[:, 2] - grip_height) <= .004]
    if len(slice_points) < 24:
        raise ValueError("The original central riser has no measurable handle slice")
    grip = ((slice_points.min(axis=0) + slice_points.max(axis=0)) * .5).astype(np.float32)
    grip[2] = grip_height
    rectangles = {(row['part'], row['normalAxis'] * 2 + (row['normalSign'] > 0)): row['rectanglePixels']
                  for row in atlas_review['chartRectangles']}
    budgets = triangle_budget(parts)
    positions, triangles, uvs, evidence = [], [], [], []
    base_vertices = base_faces = 0
    source_low, source_high = np.full(3, np.inf), np.full(3, -np.inf)
    anchors = {}
    upper_join = None
    for name, obj in sorted(parts.items(), key=lambda row: int(row[0].rsplit('_', 1)[1])):
        source_vertices, source_faces, _ = mesh_arrays(obj)
        points, modes, _ = groups(source_vertices, source_faces)
        charts = source_charts(name, points, modes, rectangles)
        del points, modes
        reduced_vertices, reduced_faces = simplify(obj, budgets[name])
        if name == 'tripo_part_1':
            reduced_vertices, reduced_faces, upper_join = retain_upper_string_join(
                source_vertices, source_faces, reduced_vertices, reduced_faces,
                np.asarray(draw_review['endSourceWorldBlenderMeters']))
        reduced_faces = reduced_faces[groups(reduced_vertices, reduced_faces)[2] > 0]
        if not len(reduced_faces):
            raise ValueError(f"The budget removed the visible {name} source part")
        uv, texel_corrections = exact_atlas_uv(name, reduced_vertices, reduced_faces, charts)
        low_tree, distance = measure_surface(source_vertices, reduced_vertices, reduced_faces)
        if name in ('tripo_part_1', 'tripo_part_63'):
            key = 'endSourceWorldBlenderMeters' if name == 'tripo_part_1' else 'startSourceWorldBlenderMeters'
            anchor = draw_review[key]
            anchors[name] = {'sourceNearestVertexMeters': float(np.linalg.norm(source_vertices - anchor, axis=1).min()),
                             'lodClearanceMeters': low_tree.find_nearest(anchor)[3]}
        positions.append(reduced_vertices)
        triangles.append(reduced_faces + base_vertices)
        uvs.append(uv)
        source_low = np.minimum(source_low, source_vertices.min(axis=0))
        source_high = np.maximum(source_high, source_vertices.max(axis=0))
        evidence.append({'part': name, 'sourceTriangles': len(source_faces), 'lodBudget': budgets[name],
                         'staticFirstTriangle': base_faces, 'lodTriangles': len(reduced_faces),
                         'lodZeroAreaUVFaces': 0, 'subtexelUvCorrections': texel_corrections, **distance})
        base_vertices += len(reduced_vertices)
        base_faces += len(reduced_faces)
        print(name, len(source_faces), '->', len(reduced_faces), flush=True)

    source_string, string_rest, string_draw, string_faces, start, end = string_rings(string, draw_review)
    points, modes, _ = groups(*mesh_arrays(string)[:2])
    string_uv, texel_corrections = exact_atlas_uv(STRING, string_rest, string_faces,
                                               source_charts(STRING, points, modes, rectangles))
    _, distance = measure_surface(source_string, string_rest, string_faces)
    string_delta = np.linalg.norm(string_draw - string_rest, axis=1)
    endpoint_delta = np.concatenate((string_delta[:8], string_delta[-10:]))
    lod_faces = base_faces + len(string_faces)
    if (lod_faces > MAX_TRIANGLES or string_delta.max() < .099 or endpoint_delta.max() > 1e-7
            or any(row['lodClearanceMeters'] - row['sourceNearestVertexMeters'] > .004 for row in anchors.values())):
        raise ValueError(f"LOD budget or draw/anchor contract failed: {lod_faces} triangles; anchors {anchors}")

    bpy.ops.object.select_all(action='DESELECT')
    root = bpy.data.objects.new('IcarusBow', None)
    bpy.context.collection.objects.link(root)
    marker = bpy.data.objects.new('BowGrip', None)
    bpy.context.collection.objects.link(marker)
    marker.parent = root
    rest = np.concatenate(positions) - grip
    body = build_mesh('BowBody', rest, np.concatenate(triangles), np.concatenate(uvs), material, root)
    cord = build_mesh('BowString', string_rest - grip, string_faces, string_uv, material, root)
    cord.shape_key_add(name='Basis')
    shape = cord.shape_key_add(name=DRAW)
    shape.data.foreach_set('co', (string_draw - grip).astype(np.float32).ravel())
    shape.value = 0
    for original in [*parts.values(), string]:
        bpy.data.objects.remove(original, do_unlink=True)
    keep = {root, marker, body, cord}
    for original in list(bpy.context.scene.objects):
        if original not in keep:
            bpy.data.objects.remove(original, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    editable = args.output.resolve() / 'icarus-bow-lod.blend'
    exported = args.output.resolve() / 'IcarusBowApprovedColorLOD.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(editable), compress=True)
    for obj in keep:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(exported), export_format='GLB', use_selection=True,
                              export_morph=True, export_animations=False)
    glb = exact_glb_atlas(exported, approved_atlas)
    meshes_out = glb['meshes']
    target_names = [name for mesh in meshes_out for name in mesh.get('extras', {}).get('targetNames', [])]
    if len(meshes_out) != 2 or len(glb['materials']) != 1 or target_names != [DRAW]:
        raise ValueError('The GLB must retain the two render meshes, one material and exact authored draw name')
    exported_triangles = sum(glb['accessors'][primitive['indices']]['count'] // 3
                             for mesh in meshes_out for primitive in mesh['primitives'])
    if exported_triangles != lod_faces or not any(node.get('name') == 'BowGrip' for node in glb['nodes']):
        raise ValueError('Export changed the triangle count or grip marker')
    report = {'scope': 'Private owner-color-preserving on-body derivative for Unity inspection',
              'sourceSha256': SOURCE, 'retainedAtlasSha256': ATLAS, 'atlasDimensions': [4096, 4096],
              'sourceTriangles': sum(row['triangles'] for row in atlas_review['parts']),
              'sourceParts': len(parts) + 1, 'triangles': lod_faces, 'renderMeshes': 2, 'materials': 1,
              'sourceBoundsBlenderMeters': [source_low.tolist(), source_high.tolist()],
              'lodBoundsSourceBlenderMeters': [(rest.min(axis=0) + grip).tolist(), (rest.max(axis=0) + grip).tolist()],
              'parts': evidence, 'grip': {'sourcePart': GRIP, 'adjacentEmblemPart': EMBLEM,
                   'sourceBlenderMeters': grip.tolist(), 'sourceGltfMeters': glb_axes(grip), 'node': 'BowGrip',
                   'rootLocalMeters': [0, 0, 0], 'upGltf': [0, 1, 0], 'drawGltf': [0, 0, -1],
                   'upUnityUniGltfReverseZ': [0, 1, 0], 'drawUnityUniGltfReverseZ': [0, 0, 1]},
              'string': {'sourcePart': STRING, 'shape': DRAW, 'lodTriangles': len(string_faces),
                 'lodZeroAreaUVFaces': 0, 'subtexelUvCorrections': texel_corrections, 'maxDrawMeters': float(string_delta.max()),
                 'maxEndpointDeviationMeters': float(endpoint_delta.max()), 'startSourceBlenderMeters': start.tolist(),
                 'endSourceBlenderMeters': end.tolist(), 'anchorSurfaceClearance': anchors,
                 'retainedUpperContinuationPatch': upper_join, **distance},
              'files': {path.name: file_hash(path) for path in (editable, exported)}}
    (args.output / 'bow-lod-receipt.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f"BOW_LOD_READY {lod_faces} tris grip {grip.tolist()} max draw {string_delta.max():.6f}", flush=True)


if __name__ == '__main__':
    main()
