"""Build a private lightweight wing from the exact color-approved 104-part master."""
import argparse
import json
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_texture_icarus_wing import groups, mesh_arrays, meshes, file_hash, PAD, SIZE, UV


MASTER = "33dbcbaa0e95d0f288a634eb59ec0f551a13de6f28720c55dc6322d63805ea2e"
ATLAS = "8f01e0ca253c045543454c0382f6768a4e102321b4f4d469790e97b6ecbcff1f"


def restore_charts(obj, charts):
    points, faces, loops = mesh_arrays(obj)
    triangles, _, _ = groups(points, faces)
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    # Each triangle must sample a single chart from this part, including
    # when collapse changes its dominant normal at the rim of a feather.
    best = np.full(len(faces), np.inf)
    mapped = np.zeros((len(faces), 3, 2))
    for axis, sign, lo, hi, rect in charts:
        planes = [k for k in range(3) if k != axis]
        flat = (triangles[:, :, planes] - lo) / np.maximum(hi - lo, 1e-12)
        clamped = flat.clip(0, 1)
        a, b = clamped[:, 1] - clamped[:, 0], clamped[:, 2] - clamped[:, 0]
        area = np.abs(a[:, 0]*b[:, 1] - a[:, 1]*b[:, 0])
        cosine = normals[:, axis] * sign / np.maximum(np.linalg.norm(normals, axis=1), 1e-12)
        score = 1 - cosine + 4 * np.max(np.abs(flat - clamped), axis=(1, 2))
        take = (area > 1e-12) & (score < best)
        x, y, w, h = rect
        mapped[take] = (clamped[take] * (w-2*PAD-1, h-2*PAD-1) + (x+PAD+.5, y+PAD+.5)) / SIZE
        best[take] = score[take]
    if not np.isfinite(best).all():
        raise ValueError(f"{obj.name}: collapsed triangle has no usable original color chart")
    uv = np.zeros((len(obj.data.loops), 2), np.float32)
    uv[loops] = mapped.astype(np.float32)
    obj.data.uv_layers.active.uv.foreach_set('vector', uv.ravel())
    return len(faces)


def create(source, receipt, output, budget):
    meta = json.loads(receipt.read_text())
    if file_hash(source) != MASTER or meta['candidateSha256'] != MASTER or meta['atlasSha256'] != ATLAS:
        raise ValueError("Expected the owner's approved wing and its original chart receipt")
    if not 10000 <= budget <= 28000:
        raise ValueError("Expected a private 10k to 28k triangle review budget")
    bpy.ops.wm.open_mainfile(filepath=str(source))
    objects = meshes()
    if len(objects) != 104:
        raise ValueError("Expected 104 retained Tripo parts")
    texture = objects[0].data.materials[0].node_tree.nodes["Exact original plate atlas"].image
    from hashlib import sha256
    if sha256(texture.packed_file.data).hexdigest() != ATLAS:
        raise ValueError("Packed color atlas differs from the approved master")
    counts = np.array([len(o.data.polygons) for o in objects])
    weights = np.sqrt(counts)
    # Blender can retain extra faces at independent component boundaries.
    # Reserve a small allowance before distributing the strict total.
    budgets = (30 + (budget - len(objects) * 34) * weights / weights.sum()).astype(int)
    rects = {(r['part'], r['normalAxis'], r['normalSign']): r['rectanglePixels'] for r in meta['chartRectangles']}
    report = []
    for obj, count, allocated in zip(objects, counts, budgets):
        vertices, faces, _ = mesh_arrays(obj)
        points, labels, _ = groups(vertices, faces)
        charts = []
        for mode in np.unique(labels):
            axis, sign = int(mode) // 2, (1 if mode % 2 else -1)
            patch = points[labels == mode]
            planes = [k for k in range(3) if k != axis]
            charts.append((axis, sign, patch.min(axis=(0,1))[planes], patch.max(axis=(0,1))[planes],
                           rects[obj.name, axis, sign]))
        modifier = obj.modifiers.new('Per-feather review LOD', 'DECIMATE')
        modifier.ratio = min(1., float(allocated) / count)
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        actual = restore_charts(obj, charts)
        if actual == 0:
            raise ValueError(f"{obj.name}: no retained geometry")
        report.append({'part': obj.name, 'sourceTriangles': int(count), 'lodTriangles': actual})
    total = sum(p['lodTriangles'] for p in report)
    if not .9*budget < total <= budget:
        raise ValueError(f"LOD produced {total} triangles for {budget} budget")
    output.mkdir(parents=True, exist_ok=False)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    glb = output/'IcarusWing.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_animations=False,
                              export_image_format='AUTO', export_texcoords=True)
    (output/'wing-lod.json').write_text(json.dumps({'sourceSha256': MASTER, 'atlasSha256': ATLAS,
        'outputSha256': file_hash(glb), 'triangles': total, 'parts': report, 'scope': 'Private on-body review'}, indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('source', 'receipt', 'output'):
        parser.add_argument(key, type=Path)
    parser.add_argument('--budget', type=int, default=18000)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    create(args.source, args.receipt, args.output, args.budget)
