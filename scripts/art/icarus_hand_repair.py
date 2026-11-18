"""Author an isolated Icarus hand cage and inspect actual skin deformation.

Blender 4.5 background entrypoint; this is a repair candidate, not art acceptance.
The palm and five digits share vertices. Digit rings bracket each phalanx joint;
the thumb branches from a removed patch of the radial palm wall.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def material(name, color, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = .48
    node.inputs['Metallic'].default_value = metallic
    return mat


def author_hand():
    vertices, faces, weights = [], [], []
    surfaces, sides = {}, {}
    rows = [0, .012, .028, .0435, .059, .076]
    widths = [.024, .026, .032, .036, .037, .0355]
    depths = [.008, .009, .011, .012, .011, .009]

    def vertex(co, skin):
        vertices.append(tuple(co))
        weights.append(skin)
        return len(vertices) - 1

    def quad(a, b, c, d):
        faces.append((a, b, c, d))

    for j, y in enumerate(rows):
        for i in range(9):
            u = i / 4 - 1
            # Metacarpal arch: the palm is thinner at its edges and wrist.
            crown = .82 + .18 * (1 - u * u)
            knuckle_y = y + (.002 * math.cos(u * math.pi / 2) if j == 5 else 0)
            for sign in (-1, 1):
                z = sign * depths[j] * crown
                if sign < 0:
                    z -= .0015 * math.sin(j / 5 * math.pi) * (1 - u * u)
                surfaces[i, j, sign] = vertex((u * widths[j], knuckle_y, z), {'hand': 1})
        for side in (0, 8):
            sides[side, j] = vertex(((-1 if side == 0 else 1) * widths[j], y, 0), {'hand': 1})

    for j in range(5):
        for i in range(8):
            for sign in (-1, 1):
                quad(surfaces[i, j, sign], surfaces[i + 1, j, sign],
                     surfaces[i + 1, j + 1, sign], surfaces[i, j + 1, sign])
        for side in (0, 8):
            # These four faces become the continuous eight-vertex thumb socket.
            if side == 8 and j in (2, 3):
                continue
            for sign in (-1, 1):
                quad(surfaces[side, j, sign], sides[side, j],
                     sides[side, j + 1], surfaces[side, j + 1, sign])

    for i in range(8):
        quad(surfaces[i, 0, -1], surfaces[i + 1, 0, -1],
             surfaces[i + 1, 0, 1], surfaces[i, 0, 1])
    # Split the end cap at each side midpoint to close the isolated wrist.
    for side, i in ((0, 0), (8, 7)):
        target = (surfaces[i, 0, -1], surfaces[i + 1, 0, -1],
                  surfaces[i + 1, 0, 1], surfaces[i, 0, 1])
        faces.remove(target)
        if side == 0:
            faces.append((target[0], target[1], target[2], target[3], sides[side, 0]))
        else:
            faces.append((target[0], target[1], sides[side, 0], target[2], target[3]))

    finger_data = []
    # Little to index: distinct metacarpal lengths and knuckle levels.
    for digit, length, spread in [('little', .059, -.11), ('ring', .077, -.035),
                                   ('middle', .084, .018), ('index', .077, .10)]:
        k = len(finger_data)
        left, middle, right = k * 2, k * 2 + 1, k * 2 + 2
        mid_left = sides[0, 5] if left == 0 else None
        if mid_left is None:
            mid_left = finger_data[-1]['root'][3]
        mid_right = sides[8, 5] if right == 8 else vertex(
            (vertices[surfaces[right, 5, 1]][0], vertices[surfaces[right, 5, 1]][1], 0), {'hand': 1})
        root = [surfaces[left, 5, 1], surfaces[middle, 5, 1], surfaces[right, 5, 1],
                mid_right, surfaces[right, 5, -1], surfaces[middle, 5, -1],
                surfaces[left, 5, -1], mid_left]
        center = sum((Vector(vertices[idx]) for idx in root), Vector()) / 8
        direction = Vector((spread, 1, -.015)).normalized()
        lateral = Vector((1, -spread, 0)).normalized()
        radius = .0081 if digit != 'little' else .0071
        joints = [0, length * .46, length * .75, length]
        finger_data.append({'name': digit, 'root': root, 'center': center,
                            'direction': direction, 'lateral': lateral, 'length': length,
                            'radius': radius, 'joints': joints})

    thumb_root = [surfaces[8, 2, 1], surfaces[8, 3, 1], surfaces[8, 4, 1],
                  sides[8, 4], surfaces[8, 4, -1], surfaces[8, 3, -1],
                  surfaces[8, 2, -1], sides[8, 2]]
    thumb_direction = Vector((.83, .55, -.04)).normalized()
    thumb_center = sum((Vector(vertices[idx]) for idx in thumb_root), Vector()) / 8
    finger_data.append({'name': 'thumb', 'root': thumb_root, 'center': thumb_center,
                        'direction': thumb_direction, 'lateral': Vector((-.55, .83, 0)),
                        'length': .063, 'radius': .0115, 'joints': [0, .026, .047, .063]})

    def skin_at(data, s):
        name, joints = data['name'], data['joints']
        blend = .004 if name == 'thumb' else .003
        if s < blend:
            value = .6 + .4 * s / blend
            return {f'{name}.01': value, 'hand': 1 - value}
        for j in (1, 2):
            if abs(s - joints[j]) <= blend:
                value = (s - joints[j] + blend) / (2 * blend)
                return {f'{name}.{j:02d}': 1 - value, f'{name}.{j + 1:02d}': value}
        segment = 1 if s < joints[1] else (2 if s < joints[2] else 3)
        return {f'{name}.{segment:02d}': 1}

    for data in finger_data:
        for idx in data['root']:
            # Shared web vertices follow the palm, preserving the finger valley.
            weights[idx] = {'hand': .78, f"{data['name']}.01": .22}
        length = data['length']
        j1, j2 = data['joints'][1:3]
        positions = [.006, .014, j1 - .003, j1, j1 + .003,
                     j2 - .003, j2, j2 + .003, length - .006, length - .002]
        positions = sorted(set(round(min(max(s, .004), length - .001), 6) for s in positions))
        previous = data['root']
        for s in positions:
            t = s / length
            taper = 1 - .35 * t
            if s > length - .006:
                taper *= .55 if s > length - .003 else .86
            bulge = 1 + .055 * math.exp(-((s - j1) / .005) ** 2)
            rx = data['radius'] * taper * bulge
            rz = (.0064 if data['name'] != 'thumb' else .0087) * taper * bulge
            center = data['center'] + data['direction'] * s
            # A gentle rest bend gives an anatomically relaxed open silhouette.
            center.z -= .002 * t * t
            ring = []
            for angle in (135, 90, 45, 0, -45, -90, -135, 180):
                a = math.radians(angle)
                pos = center + data['lateral'] * (math.cos(a) * rx)
                pos.z += math.sin(a) * rz
                ring.append(vertex(pos, skin_at(data, s)))
            for i in range(8):
                quad(previous[i], previous[(i + 1) % 8], ring[(i + 1) % 8], ring[i])
            previous = ring
        tip = vertex(data['center'] + data['direction'] * length + Vector((0, 0, -.002)),
                     {f"{data['name']}.03": 1})
        for i in range(8):
            faces.append((previous[i], previous[(i + 1) % 8], tip))

    # The thumb patch's centre side vertex was removed with the four faces.
    used = sorted({v for face in faces for v in face})
    remap = {old: new for new, old in enumerate(used)}
    mesh = bpy.data.meshes.new('Icarus_Hand_Joint_Cage')
    mesh.from_pydata([vertices[i] for i in used], [], [[remap[i] for i in f] for f in faces])
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    hand = bpy.data.objects.new('Icarus_Hand_Repair_Candidate', mesh)
    bpy.context.scene.collection.objects.link(hand)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    hand.data.materials.append(material('Skin_Neutral_Inspection', (.70, .43, .37)))
    for name in ['hand'] + [f'{d}.{i:02d}' for d in ['thumb', 'index', 'middle', 'ring', 'little'] for i in (1, 2, 3)]:
        group = hand.vertex_groups.new(name=name)
        for old in used:
            value = weights[old].get(name, 0)
            if value:
                group.add([remap[old]], value, 'REPLACE')
    wrist = hand.vertex_groups.new(name='Wrist_Integration_Seam')
    wrist.add([remap[idx] for idx in used if abs(vertices[idx][1]) < 1e-7], 1, 'REPLACE')
    hand['status'] = 'ART_REVISION_REQUIRED / isolated editable repair candidate'
    hand['wrist_note'] = 'Closed inspection cap; remove cap and bridge marked seam for body integration.'
    return hand, finger_data


def rig_hand(hand, digits):
    armature = bpy.data.armatures.new('Icarus_Hand_16_Deform_Bones')
    rig = bpy.data.objects.new('Icarus_Hand_Grip_Rig', armature)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    root = armature.edit_bones.new('hand')
    root.head, root.tail = (0, 0, 0), (0, .072, 0)
    for data in digits:
        parent = root
        for segment in range(3):
            bone = armature.edit_bones.new(f"{data['name']}.{segment + 1:02d}")
            bone.head = data['center'] + data['direction'] * data['joints'][segment]
            bone.tail = data['center'] + data['direction'] * data['joints'][segment + 1]
            bone.parent = parent
            bone.use_connect = segment > 0
            # All digits bend about the same palm plane, including thumb flexion.
            bone.align_roll(Vector((0, 0, 1)))
            parent = bone
    bpy.ops.object.mode_set(mode='OBJECT')
    modifier = hand.modifiers.new('Joint Skin', 'ARMATURE')
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    subdivision = hand.modifiers.new('Inspection Surface', 'SUBSURF')
    subdivision.levels = 1
    subdivision.render_levels = 2
    hand.parent = rig
    rig.show_in_front = True
    for bone in rig.pose.bones:
        bone.rotation_mode = 'XYZ'
    return rig


def animate(rig):
    for frame, strength in [(1, 0), (16, .5), (32, 1), (48, .5), (64, 0)]:
        for digit in ('little', 'ring', 'middle', 'index'):
            # The index remains slightly open around the grip, rather than a fist.
            angles = (52, 55, 40) if digit == 'little' else (55, 85 if digit == 'middle' else 80, 45)
            for segment, angle in enumerate(angles, 1):
                bone = rig.pose.bones[f'{digit}.{segment:02d}']
                bone.rotation_euler.x = -math.radians(angle) * strength
                bone.keyframe_insert('rotation_euler', frame=frame, group=digit)
        # Abduction and opposition precede interphalangeal flexion.
        for segment, angles in [(1, (-35, 0, 120)), (2, (-35, 0, 30)), (3, (-20, 0, 0))]:
            bone = rig.pose.bones[f'thumb.{segment:02d}']
            bone.rotation_euler = tuple(math.radians(a) * strength for a in angles)
            bone.keyframe_insert('rotation_euler', frame=frame, group='thumb')
    rig.animation_data.action.name = 'hand_open_to_bow_grip_inspection'
    bpy.context.scene.frame_end = 64


def grip_fixture():
    """An explicit contact gauge, not a replacement for the Phoenix bow asset."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.010, depth=.105,
                                        location=(0, .069, -.029),
                                        rotation=(0, math.pi / 2, 0))
    fixture = bpy.context.object
    fixture.name = 'Bow_Handle_Contact_Gauge_NOT_FINAL_BOW'
    fixture.data.materials.append(material('Contact_Gauge_Gold', (.36, .20, .055), .65))
    bevel = fixture.modifiers.new('Handle_Edge', 'BEVEL')
    bevel.width, bevel.segments = .001, 3
    for polygon in fixture.data.polygons:
        polygon.use_smooth = True
    fixture['purpose'] = '20 mm diameter contact gauge; final Phoenix bow contact remains open.'
    return fixture


def studio():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('Neutral_Hand_Inspection')
    scene.world = world
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (.10, .12, .15, 1)
    background.inputs['Strength'].default_value = .5
    for name, location, power in [('Key', (-.2, -.2, .35), 5),
                                   ('Fill', (.22, .13, .12), 2),
                                   ('Rim', (-.12, .28, -.05), 3)]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        scene.collection.objects.link(light)
        light.location = location
        light.data.energy = power
        light.data.shape = 'DISK'
        light.data.size = .18
        light.rotation_euler = (Vector((0, .08, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('Hand_Inspection_Camera', bpy.data.cameras.new('Hand_Inspection_Camera'))
    scene.collection.objects.link(camera)
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = .235
    scene.camera = camera
    return camera


def inspect(hand, rig, output):
    scene = bpy.context.scene
    bm = bmesh.new()
    bm.from_mesh(hand.data)
    nonmanifold = sum(not e.is_manifold for e in bm.edges)
    loose = sum(not v.link_edges for v in bm.verts)
    bm.free()
    hand.data.calc_loop_triangles()
    deform_names = {b.name for b in rig.data.bones if b.use_deform}
    unweighted = 0
    max_weight_error = 0
    for vertex in hand.data.vertices:
        total = sum(g.weight for g in vertex.groups if hand.vertex_groups[g.group].name in deform_names)
        unweighted += total == 0
        max_weight_error = max(max_weight_error, abs(total - 1))
    camera = studio()
    observations, rest = [], None
    for frame, label in [(1, 'open'), (16, 'half-grip'), (32, 'bow-grip')]:
        scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = hand.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        coords = [v.co.copy() for v in mesh.vertices]
        evaluated.to_mesh_clear()
        if rest is None:
            rest = coords
        delta = max((a - b).length for a, b in zip(rest, coords))
        observations.append({'pose': label, 'frame': frame, 'maxVertexDisplacementMeters': delta,
                             'evaluatedVertices': len(coords), 'finite': all(math.isfinite(c) for v in coords for c in v)})
        for view, direction in [('dorsal', (0, .1, 1)), ('palm', (0, .1, -1)),
                                 ('side', (1, .1, .12)), ('three-quarter', (.8, -.2, .7))]:
            focus = Vector((.012, .075, -.009))
            camera.location = focus + Vector(direction).normalized() * .5
            camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = str(output / f'{label}-{view}.png')
            bpy.ops.render.render(write_still=True)
    scene.frame_set(1)
    report = {'productionReady': False, 'integratedIntoIcarus': False,
              'reviewMode': 'SINGLE_AGENT_SELF_REVIEW', 'blender': bpy.app.version_string,
              'cageVertices': len(hand.data.vertices), 'cageFaces': len(hand.data.polygons),
              'cageTriangles': len(hand.data.loop_triangles), 'nonmanifoldEdges': nonmanifold,
              'looseVertices': loose, 'unweightedVertices': unweighted,
              'maxWeightSumError': max_weight_error, 'deformBones': len(deform_names),
              'poses': observations, 'release': 'DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC',
              'openGates': ['Reference proportions and topology visual review',
                            'Thumb opposition and bow surface contact inspection',
                            'Wrist seam/body integration and complete 74-bone rig budget',
                            'UV, skin bake, game LOD budget and canonical action verification',
                            'Actual Unity import/deformation review']}
    assert nonmanifold == loose == unweighted == 0, report
    assert max_weight_error < 1e-5, report
    assert observations[-1]['maxVertexDisplacementMeters'] > .02, report
    assert all(p['finite'] for p in observations), report
    fixture = grip_fixture()
    scene.frame_set(32)
    for view, direction in [('palm', (0, .1, -1)), ('side', (1, .1, .12)),
                             ('three-quarter', (.8, -.2, .7))]:
        focus = Vector((.012, .075, -.009))
        camera.location = focus + Vector(direction).normalized() * .5
        camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(output / f'grip-gauge-{view}.png')
        bpy.ops.render.render(write_still=True)
    report['contactGauge'] = {'diameterMeters': .020, 'centerMeters': list(fixture.location),
                              'finalBowContactAccepted': False}
    evaluated = hand.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    fit = {}
    for digit in ('thumb', 'index', 'middle', 'ring', 'little'):
        distances = []
        for vertex in mesh.vertices:
            influence = sum(g.weight for g in vertex.groups
                            if hand.vertex_groups[g.group].name.startswith(digit + '.'))
            if influence < .5:
                continue
            p = vertex.co - fixture.location
            axial, radial = abs(p.x) - .0525, math.hypot(p.y, p.z) - .010
            distances.append(min(max(axial, radial), 0) +
                             math.hypot(max(axial, 0), max(radial, 0)))
        fit[digit] = {'minSignedDistanceMeters': min(distances),
                      'verticesInsideGauge': sum(d < -.001 for d in distances)}
    evaluated.to_mesh_clear()
    report['contactGauge']['digitSurfaceMeasurements'] = fit
    fixture.hide_render = True
    fixture.hide_set(True)
    scene.frame_set(1)
    path = output / 'icarus-hand-joint-candidate.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    report['sourceSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    (output / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)


def main():
    args = arguments()
    assert bpy.app.version[:2] == (4, 5)
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    hand, digits = author_hand()
    rig = rig_hand(hand, digits)
    animate(rig)
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'icarus-hand-joint-candidate.blend'))
    inspect(hand, rig, output)


if __name__ == '__main__':
    main()
