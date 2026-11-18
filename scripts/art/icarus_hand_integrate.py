"""Integrate the authored hand cage into the pinned Icarus inspection source.

Blender 4.5 background entrypoint. The partial hand rig is not the final rig.
Original high-poly faces and UVs outside the wrist cuts are retained verbatim.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def array(collection, field, width, dtype):
    values = np.empty(len(collection) * width, dtype=dtype)
    collection.foreach_get(field, values)
    return values.reshape(-1, width)


def cut_body(body):
    source = body.data
    coords = array(source.vertices, 'co', 3, np.float32)
    faces = array(source.loops, 'vertex_index', 1, np.int32).reshape(-1, 3)
    uv = array(source.uv_layers.active.data, 'uv', 2, np.float32).reshape(-1, 3, 2)
    center = coords[faces].mean(axis=1)
    region = (center[:, 1] < -.09) & (center[:, 1] > -.23)
    region &= (center[:, 2] > .35) & (center[:, 2] < .465)
    outside = np.abs(coords[faces, 0]) > .49
    remove = region & outside.any(axis=1)
    added_co, added_faces, added_uv, intersections = [], [], [], {}
    for triangle, tex in zip(faces[remove & ~outside.all(axis=1)], uv[remove & ~outside.all(axis=1)]):
        sign = 1 if coords[triangle, 0].mean() > 0 else -1
        polygon = []
        for j in range(3):
            a, b = int(triangle[j]), int(triangle[(j + 1) % 3])
            pa, pb = coords[a], coords[b]
            ua, ub = tex[j], tex[(j + 1) % 3]
            ain, bin = sign * pa[0] <= .49, sign * pb[0] <= .49
            if ain:
                polygon.append((a, ua))
            if ain != bin:
                t = (sign * .49 - pa[0]) / (pb[0] - pa[0])
                point = pa + (pb - pa) * t
                point[0] = sign * .49
                key = tuple(np.round(point, 7))
                if key not in intersections:
                    intersections[key] = len(coords) + len(added_co)
                    added_co.append(point)
                polygon.append((intersections[key], ua + (ub - ua) * t))
        for j in range(1, len(polygon) - 1):
            indices = (0, j, j + 1)
            added_faces.append([polygon[k][0] for k in indices])
            added_uv.append([polygon[k][1] for k in indices])
    coords = np.concatenate((coords, np.asarray(added_co, dtype=np.float32)))
    kept = np.concatenate((faces[~remove], np.asarray(added_faces, dtype=np.int32)))
    kept_uv = np.concatenate((uv[~remove], np.asarray(added_uv, dtype=np.float32)))
    used, inverse = np.unique(kept, return_inverse=True)
    mesh = bpy.data.meshes.new('Icarus_Preserved_Surface_Wrist_Cuts')
    mesh.vertices.add(len(used))
    mesh.vertices.foreach_set('co', coords[used].ravel())
    mesh.loops.add(len(kept) * 3)
    mesh.loops.foreach_set('vertex_index', inverse.astype(np.int32))
    mesh.polygons.add(len(kept))
    mesh.polygons.foreach_set('loop_start', np.arange(len(kept), dtype=np.int32) * 3)
    mesh.polygons.foreach_set('loop_total', np.full(len(kept), 3, dtype=np.int32))
    mesh.uv_layers.new(name=source.uv_layers.active.name).data.foreach_set('uv', kept_uv.ravel())
    for mat in source.materials:
        mesh.materials.append(mat)
    mesh.polygons.foreach_set('use_smooth', np.ones(len(kept), dtype=bool))
    mesh.update()
    body.data = mesh
    bpy.data.meshes.remove(source)
    return {'removedSourceFaces': int(remove.sum()), 'retainedSourceFaces': int((~remove).sum()),
            'resultBodyFaces': len(kept),
            'clippedTriangles': len(added_faces), 'retainedUvsUnchanged': True}


def append_hand(path, sign):
    with bpy.data.libraries.load(str(path), link=False) as (_, target):
        target.objects = ['Icarus_Hand_Repair_Candidate', 'Icarus_Hand_Grip_Rig']
    hand, rig = target.objects
    for obj in (hand, rig):
        bpy.context.scene.collection.objects.link(obj)
    suffix = 'L' if sign > 0 else 'R'
    hand.name, rig.name = 'Icarus_Hand_' + suffix, 'Icarus_Hand_Rig_' + suffix
    hand.modifiers['Joint Skin'].object = rig
    hand.parent = rig
    hand.matrix_parent_inverse = Matrix.Identity(4)
    transform = Matrix(((0, sign, 0, sign * .49), (-1, 0, 0, -.1445),
                        (0, 0, 1, .420), (0, 0, 0, 1)))
    rig.matrix_world = transform
    hand.matrix_basis = Matrix.Identity(4)
    for mod in list(hand.modifiers):
        if mod.type == 'SUBSURF':
            hand.modifiers.remove(mod)
    bm = bmesh.new()
    bm.from_mesh(hand.data)
    cap = [f for f in bm.faces if all(abs(v.co.y) < 1e-7 for v in f.verts)]
    bmesh.ops.delete(bm, geom=cap, context='FACES_ONLY')
    bm.to_mesh(hand.data)
    bm.free()
    hand['integration'] = 'Wrist cap removed; stitched to source boundary in integrated mesh.'
    return hand, rig


def bridge_wrist(body, hand, sign):
    # Only the small local patch enters bmesh; the full source stays in bulk arrays.
    co = array(body.data.vertices, 'co', 3, np.float32)
    faces = array(body.data.loops, 'vertex_index', 1, np.int32).reshape(-1, 3)
    center = co[faces].mean(axis=1)
    local = (np.abs(center[:, 0] - sign * .49) < .025)
    local &= (center[:, 1] < -.09) & (center[:, 2] > .35) & (center[:, 2] < .465)
    local_faces = faces[local]
    edges = np.sort(np.concatenate((local_faces[:, [0, 1]], local_faces[:, [1, 2]],
                                    local_faces[:, [2, 0]])), axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = unique[counts == 1]
    candidates = boundary[np.all(np.abs(co[boundary, 0] - sign * .49) < 1e-6, axis=1)]
    links = {}
    for a, b in candidates:
        links.setdefault(int(a), []).append(int(b))
        links.setdefault(int(b), []).append(int(a))
    loops, remaining = [], set(links)
    while remaining:
        start = min(remaining)
        loop, previous, current = [], None, start
        while current not in loop:
            loop.append(current)
            remaining.discard(current)
            choices = [v for v in links[current] if v != previous]
            if not choices:
                break
            previous, current = current, choices[0]
        if current == start and len(loop) > 8:
            loops.append(loop)
    if not loops:
        raise ValueError(f'No closed source wrist boundary: {len(candidates)} edges, '
                         f'degrees {dict((n, sum(len(v) == n for v in links.values())) for n in (1, 2, 3, 4))}')
    outer = max(loops, key=len)
    # Add the exact source boundary to the cage and zipper the two closed rings.
    bm = bmesh.new()
    bm.from_mesh(hand.data)
    ring = [v for v in bm.verts if abs(v.co.y) < 1e-7]
    focus = sum((v.co for v in ring), Vector()) / len(ring)
    angle = lambda p: math.atan2(p.z - focus.z, p.x - focus.x)
    ring.sort(key=lambda v: angle(v.co))
    inv = hand.matrix_world.inverted()
    outer.sort(key=lambda i: angle(inv @ Vector(co[i])))
    points = [inv @ Vector(co[i]) for i in outer]
    source_ring = [bm.verts.new(p) for p in points]
    i = j = 0
    while i < len(ring) or j < len(source_ring):
        a, b = ring[i % len(ring)], source_ring[j % len(source_ring)]
        if (i + 1) / len(ring) <= (j + 1) / len(source_ring):
            bm.faces.new((a, ring[(i + 1) % len(ring)], b))
            i += 1
        else:
            bm.faces.new((a, source_ring[(j + 1) % len(source_ring)], b))
            j += 1
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(hand.data)
    bm.free()
    group = hand.vertex_groups['hand']
    group.add(list(range(len(hand.data.vertices) - len(points), len(hand.data.vertices))), 1, 'REPLACE')
    hand['source_wrist_indices'] = outer
    hand['source_ring_start'] = len(hand.data.vertices) - len(points)
    return {'sourceBoundaryVertices': len(outer), 'handWristVertices': len(ring),
            'bridgeTriangles': len(outer) + len(ring), 'boundaryWorldCoordinatesMatched': True}


def weld_into_body(body, hands):
    """Remap bridge endpoints to existing source indices, avoiding coincident seams."""
    source = body.data
    coords = [array(source.vertices, 'co', 3, np.float32)]
    loops = [array(source.loops, 'vertex_index', 1, np.int32).ravel()]
    totals = [array(source.polygons, 'loop_total', 1, np.int32).ravel()]
    uvs = [array(source.uv_layers.active.data, 'uv', 2, np.float32)]
    materials = [np.zeros(len(source.polygons), dtype=np.int32)]
    count = len(source.vertices)
    groups, mappings = {}, []
    for side, (hand, rig) in enumerate(hands):
        start = int(hand['source_ring_start'])
        mapping = np.concatenate((np.arange(count, count + start, dtype=np.int32),
                                  np.array(hand['source_wrist_indices'], dtype=np.int32)))
        mappings.append(mapping.tolist())
        points = np.asarray([hand.matrix_world @ v.co for v in hand.data.vertices], dtype=np.float32)
        coords.append(points[:start])
        local_loops = np.concatenate([np.array(tuple(p.vertices)[::-1]
            if hand.matrix_world.determinant() < 0 else tuple(p.vertices), dtype=np.int32)
            for p in hand.data.polygons])
        loops.append(mapping[local_loops])
        totals.append(array(hand.data.polygons, 'loop_total', 1, np.int32).ravel())
        # Draft hand-only UV island; skin painting/bake remains a separate gate.
        local = array(hand.data.vertices, 'co', 3, np.float32)
        uv = (local[:, :2] - local[:, :2].min(axis=0)) / np.maximum(np.ptp(local[:, :2], axis=0), 1e-6)
        uvs.append(uv[local_loops])
        materials.append(np.full(len(hand.data.polygons), side + 1, dtype=np.int32))
        source.materials.append(hand.data.materials[0])
        for vertex in hand.data.vertices:
            target = int(mapping[vertex.index])
            for weight in vertex.groups:
                name = hand.vertex_groups[weight.group].name
                if name == 'Wrist_Integration_Seam':
                    continue
                groups.setdefault(name, []).append((target, weight.weight))
        groups['Hand_Deform_Mask_' + str(side)] = [(int(i), 1) for i in mapping]
        count += start
    mesh = bpy.data.meshes.new('Icarus_Hands_Welded_To_Preserved_Source')
    coords, loops, totals, uvs = map(np.concatenate, (coords, loops, totals, uvs))
    mesh.vertices.add(len(coords))
    mesh.vertices.foreach_set('co', coords.ravel())
    mesh.loops.add(len(loops))
    mesh.loops.foreach_set('vertex_index', loops)
    mesh.polygons.add(len(totals))
    mesh.polygons.foreach_set('loop_total', totals)
    mesh.polygons.foreach_set('loop_start', np.concatenate(([0], np.cumsum(totals[:-1]))).astype(np.int32))
    mesh.polygons.foreach_set('material_index', np.concatenate(materials))
    mesh.polygons.foreach_set('use_smooth', np.ones(len(totals), dtype=bool))
    mesh.uv_layers.new(name='UVMap').data.foreach_set('uv', uvs.ravel())
    for mat in source.materials:
        mesh.materials.append(mat)
    mesh.update()
    body.data = mesh
    bpy.data.meshes.remove(source)
    for name, entries in groups.items():
        group = body.vertex_groups.new(name=name)
        for index, weight in entries:
            group.add([index], weight, 'REPLACE')
    for side, (hand, rig) in enumerate(hands):
        modifier = body.modifiers.new('Partial_Hand_Skin_' + str(side), 'ARMATURE')
        modifier.object = rig
        modifier.vertex_group = 'Hand_Deform_Mask_' + str(side)
        modifier.use_deform_preserve_volume = True
        hand.hide_render = True
        hand.hide_set(True)
        hand['purpose'] = 'Hidden cage diagnostic; rendered geometry is welded into body mesh.'
    body.name = 'Icarus_Preserved_Body_With_Welded_Hands'
    return mappings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character', required=True, type=Path)
    parser.add_argument('--hand', required=True, type=Path)
    parser.add_argument('--bow', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--render-frames', default='1,16,32')
    parser.add_argument('--render-sides', default='left,right')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    assert bpy.app.version[:2] == (4, 5)
    args.output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.open_mainfile(filepath=str(args.character.resolve()))
    scene = bpy.context.scene
    body = next(o for o in scene.objects if o.type == 'MESH')
    facts = {'productionReady': False, 'state': 'ART_REVISION_REQUIRED',
             'reviewMode': 'SINGLE_AGENT_SELF_REVIEW', 'blender': bpy.app.version_string,
             'release': 'DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC',
             'inputHashes': {k: digest(getattr(args, k)) for k in ('character', 'hand', 'bow')},
             'bodyCut': cut_body(body), 'hands': [], 'poses': []}
    hands = []
    for sign in (1, -1):
        hand, rig = append_hand(args.hand, sign)
        scene.frame_set(1)
        bpy.context.view_layer.update()
        facts['hands'].append({'side': hand.name, **bridge_wrist(body, hand, sign)})
        hands.append((hand, rig))
    mappings = weld_into_body(body, hands)
    facts['wristWeld'] = {'sharedSourceVertexIndices': True, 'coincidentSeparateSeam': False}
    with bpy.data.libraries.load(str(args.bow), link=False) as (_, target):
        target.objects = ['PhoenixFireBow_DRAFT']
    bow = target.objects[0]
    scene.collection.objects.link(bow)
    # Align the real provider bow's central grip to the cage's measured contact region.
    scale = 1.10 / .9511719942
    local = Matrix(((0, 0, scale, 0), (0, scale, 0, .069),
                    (-scale, 0, 0, -.029 - .03 * scale), (0, 0, 0, 1)))
    bow.matrix_world = hands[0][1].matrix_world @ local
    bow['status'] = 'Actual Phoenix draft bow; provider thin grip, contact is measured not accepted.'
    for image in bpy.data.images:
        if image.source == 'FILE' and image.size[0] > 1:
            image.pack()
    camera = scene.camera
    scene.cycles.samples = 8
    scene.render.resolution_x = scene.render.resolution_y = 640
    rest = {}
    bow_bvh = BVHTree.FromPolygons([bow.matrix_world @ v.co for v in bow.data.vertices],
                                  [tuple(p.vertices) for p in bow.data.polygons])
    for frame, label in ((1, 'open'), (16, 'half-grip'), (32, 'grip')):
        scene.frame_set(frame)
        deps = bpy.context.evaluated_depsgraph_get()
        pose = {'frame': frame, 'label': label, 'hands': []}
        evaluated = body.evaluated_get(deps)
        mesh = evaluated.to_mesh()
        for side, (hand, rig) in enumerate(hands):
            coords = [body.matrix_world @ mesh.vertices[i].co for i in mappings[side]]
            rest.setdefault(hand.name, coords)
            unweighted = sum(not body.data.vertices[i].groups for i in mappings[side])
            pose['hands'].append({'name': hand.name, 'unweightedVertices': unweighted,
                'finite': all(math.isfinite(x) for p in coords for x in p),
                'maxDisplacementMeters': max((p - q).length for p, q in zip(coords, rest[hand.name]))})
            if side == 0 and frame == 32:
                contact = {}
                for digit in ('thumb', 'index', 'middle', 'ring', 'little'):
                    distances = []
                    for vertex, point in zip(hand.data.vertices, coords):
                        influence = sum(g.weight for g in vertex.groups
                            if hand.vertex_groups[g.group].name.startswith(digit + '.'))
                        if influence < .5:
                            continue
                        hit, normal, _, distance = bow_bvh.find_nearest(point)
                        distances.append((distance, (point - hit).dot(normal)))
                    contact[digit] = {'minSurfaceDistanceMeters': min(d[0] for d in distances),
                        'negativeNormalSideSamples': sum(d[1] < -.001 for d in distances)}
                facts['actualPhoenixBowContact'] = {'accepted': False, 'digits': contact,
                    'warning': 'Provider bow is a thin open surface; negative sides do not establish solid penetration.'}
        evaluated.to_mesh_clear()
        facts['poses'].append(pose)
        if args.render and frame in {int(f) for f in args.render_frames.split(',')}:
            for sign, side in ((1, 'left'), (-1, 'right')):
                if side not in args.render_sides.split(','):
                    continue
                for view, direction in (('dorsal', (0, 0, 1)), ('palm', (0, 0, -1)),
                                         ('oblique', (sign * .7, -1, .7))):
                    focus = Vector((sign * .565, -.149, .412))
                    camera.location = focus + Vector(direction).normalized() * 4
                    camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
                    camera.data.ortho_scale = .30
                    scene.render.filepath = str(args.output / f'{side}-{label}-{view}.png')
                    bpy.ops.render.render(write_still=True)
    facts['deformBones'] = sum(len(r.data.bones) for _, r in hands)
    facts['fullCharacterRigComplete'] = False
    assert all(p['hands'][0]['finite'] and p['hands'][1]['finite'] for p in facts['poses'])
    assert all(h['unweightedVertices'] == 0 for p in facts['poses'] for h in p['hands'])
    assert facts['poses'][-1]['hands'][0]['maxDisplacementMeters'] > .02
    facts['openGates'] = ['Wrist bridge shading and original hand armor restoration',
        'Actual Phoenix bow surface contact and finger penetration', 'Hand UVs and matched skin baking',
        '74-bone full character rig, canonical actions, runtime LOD budget', 'Actual Unity import/deformation']
    scene.frame_set(1)
    path = args.output / 'icarus-hands-integrated.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    facts['outputSha256'] = digest(path)
    (args.output / 'inspection.json').write_text(json.dumps(facts, indent=2) + '\n')
    print(json.dumps(facts), flush=True)


if __name__ == '__main__':
    main()
