"""Bounded offline hand/prop repair of the preserved Icarus integration.

Blender 4.5 entrypoint. This restores source dorsal plates and authors an actual
solid Phoenix grip; the high-poly character is not a production runtime asset.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import barycentric_transform
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from icarus_hand_integrate import array, digest


DIGITS = ('thumb', 'index', 'middle', 'ring', 'little')
GRIP_CENTER = np.array((0, .078, -.028))
GRIP_RADIUS = .0115
GRIP_HALF_LENGTH = .0525


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    return mat


def refine_profile(hand, rig):
    """Reduce distal tube width while leaving shared webs and wrist untouched."""
    changed = 0
    for digit in DIGITS:
        bones = [rig.data.bones[f'{digit}.{n:02d}'] for n in (1, 2, 3)]
        origin, end = bones[0].head_local, bones[-1].tail_local
        axis = (end - origin).normalized()
        length = (end - origin).length
        for vertex in hand.data.vertices:
            influence = sum(g.weight for g in vertex.groups
                            if hand.vertex_groups[g.group].name.startswith(digit + '.'))
            if influence < .5:
                continue
            offset = vertex.co - origin
            along = offset.dot(axis)
            t = max(0, min(1, along / length))
            center = origin + axis * along
            radial = vertex.co - center
            scale = 1 - (.18 if digit == 'thumb' else .24) * t
            # Keep pads fuller than dorsal/nail surfaces and preserve knuckles.
            radial.x *= scale
            radial.z *= 1 - .12 * t
            vertex.co = center + radial
            changed += 1
    hand.data.update()
    return changed


def digit_samples(hand, digit):
    chosen = set()
    for vertex in hand.data.vertices:
        influence = sum(g.weight for g in vertex.groups
                        if hand.vertex_groups[g.group].name.startswith(digit + '.'))
        if influence > .5:
            chosen.add(vertex.index)
    faces = [tuple(p.vertices) for p in hand.data.polygons
             if all(i in chosen for i in p.vertices)]
    return sorted(chosen), faces


def evaluated_samples(hand, selected):
    evaluated = hand.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    coords = array(mesh.vertices, 'co', 3, np.float32)
    evaluated.to_mesh_clear()
    indices, faces = selected
    points = [coords[indices]]
    # Face centres and edge midpoints catch penetration between cage vertices.
    for face in faces:
        values = coords[list(face)]
        points.append(values.mean(axis=0)[None, :])
        points.append((values + np.roll(values, 1, axis=0)) / 2)
    return np.concatenate(points)


def signed_grip(points):
    offset = points - GRIP_CENTER
    radial = np.linalg.norm(offset[:, 1:], axis=1) - GRIP_RADIUS
    axial = np.abs(offset[:, 0]) - GRIP_HALF_LENGTH
    return np.minimum(np.maximum(radial, axial), 0) + np.hypot(
        np.maximum(radial, 0), np.maximum(axial, 0))


def fit_digit(hand, rig, digit):
    selected = digit_samples(hand, digit)
    if digit == 'thumb':
        variables = [(1, 0, -75, -5), (1, 1, -65, 65), (1, 2, 35, 135),
                     (2, 0, -65, 5), (2, 2, -35, 50), (3, 0, -55, 5)]
        initial = [-40, 0, 75, -25, 0, -15]
    else:
        variables = [(1, 0, -82, -35), (2, 0, -110, -40), (3, 0, -80, -10)]
        initial = [math.degrees(rig.pose.bones[f'{digit}.{n:02d}'].rotation_euler[a])
                   for n, a, _, _ in variables]

    def apply(values):
        for value, (segment, axis, _, _) in zip(values, variables):
            rig.pose.bones[f'{digit}.{segment:02d}'].rotation_euler[axis] = math.radians(value)
        bpy.context.view_layer.update()

    def score(values):
        apply(values)
        points = evaluated_samples(hand, selected)
        distances = signed_grip(points)
        closest = np.sort(np.maximum(distances, 0))[:12]
        loss = np.mean((closest - .0006) ** 2)
        loss += 600 * np.mean(np.minimum(distances - .0003, 0) ** 2)
        if digit == 'thumb':
            tip = rig.pose.bones['thumb.03'].tail
            target = Vector((.017, .066, -.022))
            loss += .08 * (tip - target).length_squared
        return float(loss)

    best = initial
    value = score(best)
    for step in (12, 5, 2, .75):
        for _ in range(12):
            improved = False
            for index, (_, _, low, high) in enumerate(variables):
                for direction in (-1, 1):
                    candidate = list(best)
                    candidate[index] = max(low, min(high, best[index] + direction * step))
                    trial = score(candidate)
                    if trial < value:
                        best, value, improved = candidate, trial, True
            if not improved:
                break
    apply(best)
    return {'anglesDegrees': best, 'objective': value}


def keyframe_grip(rig):
    pose = {p.name: p.rotation_euler.copy() for p in rig.pose.bones}
    for frame, strength in ((1, 0), (16, .5), (32, 1), (48, .5), (64, 0)):
        for bone in rig.pose.bones:
            bone.rotation_euler = tuple(value * strength for value in pose[bone.name])
            bone.keyframe_insert('rotation_euler', frame=frame, group=bone.name.split('.')[0])
    for bone in rig.pose.bones:
        bone.rotation_euler = pose[bone.name]


def recover_armor(path, hands):
    with bpy.data.libraries.load(str(path), link=False) as (available, target):
        target.objects = [next(name for name in available.objects if name == 'Mesh_0')]
    source_object = target.objects[0]
    source = source_object.data
    coords = array(source.vertices, 'co', 3, np.float32)
    triangles = array(source.loops, 'vertex_index', 1, np.int32).reshape(-1, 3)
    uvs = array(source.uv_layers.active.data, 'uv', 2, np.float32).reshape(-1, 3, 2)
    centers = coords[triangles].mean(axis=1)
    restored = []
    for sign, (hand, rig) in zip((1, -1), hands):
        mask = (sign * centers[:, 0] > .49) & (sign * centers[:, 0] < .564)
        mask &= (centers[:, 1] > -.190) & (centers[:, 1] < -.100)
        mask &= (centers[:, 2] > .421) & (centers[:, 2] < .46)
        faces = triangles[mask]
        used, inverse = np.unique(faces, return_inverse=True)
        inv = hand.matrix_world.inverted()
        donor = [inv @ Vector(coords[i]) for i in used]
        donor_faces = inverse.reshape(-1, 3).tolist()
        donor_uvs = uvs[mask]
        tree = BVHTree.FromPolygons(donor, donor_faces)
        points, sampled_uv, surface_faces = [], [], []
        rows, columns = 24, 16
        for row in range(rows + 1):
            t = row / rows
            y = .004 + .063 * t
            half_width = .027 * (1 - .86 * max(0, (t - .5) / .5))
            for column in range(columns + 1):
                x = half_width * (column * 2 / columns - 1)
                hit, _, index, _ = tree.ray_cast(Vector((x, y, .08)), Vector((0, 0, -1)))
                if hit is None:
                    hit, _, index, _ = tree.find_nearest(Vector((x, y, .018)))
                a, b, c = [donor[i] for i in donor_faces[index]]
                tex = donor_uvs[index]
                uv_point = barycentric_transform(hit, a, b, c,
                    Vector((*tex[0], 0)), Vector((*tex[1], 0)), Vector((*tex[2], 0)))
                points.append((x, y, .0125 + .28 * (hit.z - .005)))
                sampled_uv.append(tuple(uv_point[:2]))
                if row and column:
                    n = row * (columns + 1) + column
                    surface_faces.append((n - columns - 2, n - columns - 1, n, n - 1))
        mesh = bpy.data.meshes.new('Recovered_Source_Dorsal_Plate')
        mesh.from_pydata(points, [], surface_faces)
        mesh.uv_layers.new(name='SourceUV').data.foreach_set('uv',
            np.asarray([sampled_uv[i] for p in surface_faces for i in p], dtype=np.float32).ravel())
        for mat in source.materials:
            mesh.materials.append(mat)
        for face in mesh.polygons:
            face.use_smooth = True
        armor = bpy.data.objects.new('Icarus_Source_Dorsal_Armor_' + ('L' if sign > 0 else 'R'), mesh)
        bpy.context.scene.collection.objects.link(armor)
        armor.matrix_world = rig.matrix_world
        armor.vertex_groups.new(name='hand').add(list(range(len(points))), 1, 'REPLACE')
        modifier = armor.modifiers.new('Rigid metacarpal attachment', 'ARMATURE')
        modifier.object = rig
        solid = armor.modifiers.new('Plate rim thickness', 'SOLIDIFY')
        solid.thickness = .0012
        armor['provenance'] = 'Original source relief and UVs sampled onto a clean shield patch.'
        restored.append({'name': armor.name, 'sourceFaces': len(faces),
                         'sourceUvsExact': False, 'sourceUvsBarycentricallySampled': True,
                         'fit': 'Source relief resampled onto clean dorsal shield with 1.2mm rim.'})
    bpy.data.objects.remove(source_object, do_unlink=True)
    return restored


def solid_phoenix_grip(bow, hand):
    transform = hand.matrix_world.inverted() @ bow.matrix_world
    bm = bmesh.new()
    bm.from_mesh(bow.data)
    remove = [f for f in bm.faces if abs((transform @ f.calc_center_median()).x) < .045
              and abs((transform @ f.calc_center_median()).z + .028) < .042]
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bm.to_mesh(bow.data)
    bm.free()
    vertices, faces = [], []
    sections = [(-.0525, .014), (-.048, .014), (-.045, GRIP_RADIUS),
                (.045, GRIP_RADIUS), (.048, .014), (.0525, .014)]
    count = 64
    for x, radius in sections:
        for j in range(count):
            angle = j * math.tau / count
            vertices.append((x, GRIP_CENTER[1] + radius * math.cos(angle),
                             GRIP_CENTER[2] + radius * math.sin(angle)))
    for i in range(len(sections) - 1):
        for j in range(count):
            faces.append((i * count + j, i * count + (j + 1) % count,
                          (i + 1) * count + (j + 1) % count, (i + 1) * count + j))
    faces.extend([tuple(range(count - 1, -1, -1)),
                  tuple((len(sections) - 1) * count + j for j in range(count))])
    mesh = bpy.data.meshes.new('Phoenix_Closed_Grip_Surface')
    mesh.from_pydata(vertices, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges)
    bm.to_mesh(mesh)
    bm.free()
    grip = bpy.data.objects.new('Phoenix_Authored_Solid_Grip', mesh)
    bpy.context.scene.collection.objects.link(grip)
    grip.matrix_world = hand.matrix_world
    grip.parent = bow
    grip.matrix_world = hand.matrix_world
    gold = material('Phoenix_Grip_Gold_DRAFT', (.64, .36, .075), .72, .32)
    leather = material('Phoenix_Grip_Rose_DRAFT', (.20, .035, .055), .05, .43)
    mesh.materials.append(gold)
    mesh.materials.append(leather)
    for face in mesh.polygons:
        face.material_index = 1 if count * 2 <= face.index < count * 3 else 0
        face.use_smooth = len(face.vertices) == 4
    grip['purpose'] = 'Actual solid replacement handle of the existing Phoenix bow, not a gauge.'
    return grip, {'removedOpenSheetFaces': len(remove), 'closedHandle': True,
                  'diameterMeters': GRIP_RADIUS * 2, 'lengthMeters': GRIP_HALF_LENGTH * 2,
                  'decorativeLimbsStillOpenDraft': True}


def contact_report(hand, grip):
    vertices = [v.co for v in grip.data.vertices]
    tree = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in grip.data.polygons])
    report = {}
    for digit in DIGITS:
        points = evaluated_samples(hand, digit_samples(hand, digit))
        signed = []
        for point in points:
            hit, normal, _, distance = tree.find_nearest(Vector(point))
            signed.append(distance if (Vector(point) - hit).dot(normal) >= 0 else -distance)
        report[digit] = {'sampleCount': len(signed),
                         'minimumSignedDistanceMeters': min(signed),
                         'nearestAbsoluteSurfaceGapMeters': min(abs(d) for d in signed),
                         'maximumPenetrationMeters': max(0, -min(signed)),
                         'samplesWithinOneMm': sum(abs(d) <= .001 for d in signed)}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--integrated', required=True, type=Path)
    parser.add_argument('--character', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    assert bpy.app.version[:2] == (4, 5)
    args.output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.open_mainfile(filepath=str(args.integrated.resolve()))
    scene = bpy.context.scene
    body = bpy.data.objects['Icarus_Preserved_Body_With_Welded_Hands']
    hands = [(bpy.data.objects['Icarus_Hand_' + side], bpy.data.objects['Icarus_Hand_Rig_' + side])
             for side in ('L', 'R')]
    body.hide_set(True)
    scene.frame_set(32)
    facts = {'state': 'ART_REVISION_REQUIRED', 'productionReady': False,
             'reviewMode': 'SINGLE_AGENT_SELF_REVIEW', 'blender': bpy.app.version_string,
             'release': 'DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC',
             'inputHashes': {'integrated': digest(args.integrated), 'character': digest(args.character)},
             'repairAttemptsPerGap': 2, 'profileVerticesChanged': [], 'poseFit': {}}
    for hand, rig in hands:
        facts['profileVerticesChanged'].append(refine_profile(hand, rig))
    left, rig = hands[0]
    for digit in DIGITS:
        facts['poseFit'][digit] = fit_digit(left, rig, digit)
        print('Fitted', digit, facts['poseFit'][digit], flush=True)
    keyframe_grip(rig)
    for pose in rig.pose.bones:
        hands[1][1].pose.bones[pose.name].rotation_euler = pose.rotation_euler
    keyframe_grip(hands[1][1])
    count = len(body.data.vertices) - sum(int(h['source_ring_start']) for h, _ in hands)
    for hand, _ in hands:
        start = int(hand['source_ring_start'])
        for i in range(start):
            body.data.vertices[count + i].co = hand.matrix_world @ hand.data.vertices[i].co
        count += start
    body.data.update()
    facts['armor'] = recover_armor(args.character.resolve(), hands)
    grip, facts['phoenixGrip'] = solid_phoenix_grip(bpy.data.objects['PhoenixFireBow_DRAFT'], left)
    body.hide_set(False)
    scene.frame_set(32)
    bpy.context.view_layer.update()
    facts['solidGripContact'] = contact_report(left, grip)
    facts['contactAccepted'] = False
    facts['openGates'] = ['Anatomical and source plate fit visual acceptance',
                         'Grip contact and hand self-collision visual review',
                         'Matched skin/armor bake, hand UVs and runtime material/LOD budgets',
                         'Complete 74-bone rig and canonical actions', 'Actual Unity import/deformation']
    if args.render:
        camera = scene.camera
        scene.cycles.samples = 16
        scene.render.resolution_x = scene.render.resolution_y = 640
        for view, direction in (('dorsal', (0, 0, 1)), ('palm', (0, 0, -1)),
                                ('oblique', (.7, -1, .7))):
            focus = Vector((.565, -.149, .412))
            camera.location = focus + Vector(direction).normalized() * 4
            camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
            camera.data.ortho_scale = .30
            scene.render.filepath = str(args.output / f'left-grip-{view}.png')
            bpy.ops.render.render(write_still=True)
    scene.frame_set(1)
    for image in bpy.data.images:
        if image.source == 'FILE' and image.size[0] > 1:
            image.pack()
    target = args.output / 'icarus-hands-contact-refined.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    facts['outputSha256'] = digest(target)
    (args.output / 'inspection.json').write_text(json.dumps(facts, indent=2) + '\n')
    print(json.dumps(facts), flush=True)


if __name__ == '__main__':
    main()
