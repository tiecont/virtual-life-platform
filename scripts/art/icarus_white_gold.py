"""Editable white/gold Icarus study geometry, authored for the owner reference."""
import math

import bpy
from mathutils import Vector


def build_character(rig, scene):
    parts = []
    colors = {
        'skin': (0.88, 0.65, 0.57, 1), 'pink': (0.78, 0.27, 0.40, 1),
        'pinkLight': (0.96, 0.48, 0.60, 1), 'white': (0.92, 0.92, 0.98, 1),
        'lavender': (0.62, 0.56, 0.76, 1), 'gold': (0.85, 0.48, 0.12, 1),
        'dark': (0.065, 0.012, 0.030, 1), 'iris': (0.60, 0.09, 0.22, 1),
        'lip': (0.64, 0.23, 0.29, 1),
    }
    materials = []
    for name, metallic, roughness in [('SkinHair', 0, 0.65), ('FeatherSilk', 0.05, 0.52), ('Ornament', 0.65, 0.28)]:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Metallic'].default_value = metallic
        shader.inputs['Roughness'].default_value = roughness
        color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        color.layer_name = 'Color'
        mat.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
        materials.append(mat)

    def mesh(name, vertices, faces, color, material, weights):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        data.materials.append(materials[material])
        rgba = colors[color] if isinstance(color, str) else color
        attr = data.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
        for item in attr.data:
            item.color = rgba
        for poly in data.polygons:
            poly.use_smooth = True
        uv = data.uv_layers.new(name='AuthoringUV')
        for index, loop in enumerate(data.loops):
            point = data.vertices[loop.vertex_index].co
            uv.data[index].uv = (point.x*0.25+0.5, point.z*0.45)
        groups = {}
        for index in range(len(vertices)):
            values = weights(index) if callable(weights) else {weights: 1}
            for bone, value in values.items():
                if value <= 0:
                    continue
                if bone not in groups:
                    groups[bone] = obj.vertex_groups.new(name=bone)
                groups[bone].add([index], value, 'REPLACE')
        parts.append(obj)
        return obj

    def smooth_points(points, samples):
        result = []
        pts = [Vector(p) for p in points]
        for index in range(samples+1):
            position = index/samples*(len(pts)-1)
            i = min(len(pts)-2, int(position))
            t = position-i
            a, b = pts[max(0, i-1)], pts[i]
            c, d = pts[i+1], pts[min(len(pts)-1, i+2)]
            result.append(0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
        return result

    def tube(name, points, radii, color, material, bones, steps=16, sides=10, flatten=1):
        centers = smooth_points(points, steps)
        vertices, faces = [], []
        for row, center in enumerate(centers):
            tangent = centers[min(row+1, steps)]-centers[max(0, row-1)]
            tangent.normalize()
            guide = Vector((0, 1, 0)) if abs(tangent.y) < 0.9 else Vector((1, 0, 0))
            horizontal = tangent.cross(guide).normalized()
            vertical = tangent.cross(horizontal).normalized()
            t = row/steps
            position = t*(len(radii)-1)
            i = min(len(radii)-2, int(position))
            radius = radii[i]*(1-position+i)+radii[i+1]*(position-i)
            for col in range(sides):
                angle = col/sides*math.tau
                vertices.append(tuple(center+radius*(math.cos(angle)*horizontal+flatten*math.sin(angle)*vertical)))
        for row in range(steps):
            for col in range(sides):
                i = row*sides+col
                j = row*sides+(col+1)%sides
                faces.append((i, j, j+sides, i+sides))
        faces.extend([tuple(reversed(range(sides))), tuple(steps*sides+i for i in range(sides))])

        def weights(index):
            if isinstance(bones, str) or bones[0] == bones[1]:
                return {bones if isinstance(bones, str) else bones[0]: 1}
            t = index//sides/steps
            blend = max(0, min(1, (t-0.38)/0.24))
            return {bones[0]: 1-blend, bones[1]: blend}
        return mesh(name, vertices, faces, color, material, weights)

    def ellipsoid(name, center, scale, color, bone, rows=16, cols=24, material=0):
        vertices, faces = [], []
        for row in range(rows+1):
            theta = row/rows*math.pi
            for col in range(cols):
                phi = col/cols*math.tau
                vertices.append((center[0]+scale[0]*math.sin(theta)*math.cos(phi), center[1]+scale[1]*math.sin(theta)*math.sin(phi), center[2]+scale[2]*math.cos(theta)))
        for row in range(rows):
            for col in range(cols):
                i = row*cols+col
                j = row*cols+(col+1)%cols
                faces.append((i, j, j+cols, i+cols))
        return mesh(name, vertices, faces, color, material, bone)

    def feather(name, start, end, width, bones, row=0):
        a, b = Vector(start), Vector(end)
        length = b-a
        cross = Vector((-length.z, 0, length.x)).normalized()
        vertices, faces = [], []
        sections, columns = 5, 3
        for side in [-1, 1]:
            for i in range(sections+1):
                t = i/sections
                shape = math.sin(math.pi*(t**0.65))**0.7
                for j in range(columns+1):
                    u = j/columns*2-1
                    center = a+length*t+Vector((0, -0.025*math.sin(math.pi*t), 0))
                    vertex = center+cross*(u*width*shape*(0.8 if u < 0 else 1))
                    vertex.y += side*0.003+0.012*abs(u)*shape
                    vertices.append(tuple(vertex))
        stride = (sections+1)*(columns+1)
        for side in range(2):
            for i in range(sections):
                for j in range(columns):
                    k = side*stride+i*(columns+1)+j
                    face = (k, k+1, k+columns+2, k+columns+1)
                    faces.append(tuple(reversed(face)) if side else face)
        for i in range(sections):
            for j in [0, columns]:
                k = i*(columns+1)+j
                faces.append((k, k+columns+1, k+columns+1+stride, k+stride))
        for i in [0, sections]:
            for j in range(columns):
                k = i*(columns+1)+j
                faces.append((k, k+stride, k+stride+1, k+1))
        def weights(index):
            if bones[0] == bones[1]:
                return {bones[0]: 1}
            t = (index%stride)//(columns+1)/sections
            blend = max(0, min(1, (t-0.3)/0.4))
            return {bones[0]: 1-blend, bones[1]: blend}
        obj = mesh(name, vertices, faces, (0.88-row*0.035, 0.89-row*0.035, 0.95-row*0.025, 1), 1, weights)
        # The central shaft gives the feather a readable construction in neutral light.
        tube(name+'.shaft', [a, a+length*0.5+Vector((0, -0.007, 0)), a+length*0.91], [0.003, 0.002, 0.0005], 'gold', 2, bones, steps=3, sides=3)
        return obj

    def loft(name, rings, color, material, bone_weights, segments=32):
        vertices, faces = [], []
        for row, (z, width, depth, offset_y) in enumerate(rings):
            for col in range(segments):
                angle = col/segments*math.tau
                vertices.append((width*math.cos(angle), offset_y+depth*math.sin(angle), z))
        for row in range(len(rings)-1):
            for col in range(segments):
                i = row*segments+col
                j = row*segments+(col+1)%segments
                faces.append((i, j, j+segments, i+segments))
        faces.extend([tuple(reversed(range(segments))), tuple((len(rings)-1)*segments+i for i in range(segments))])
        return mesh(name, vertices, faces, color, material, lambda i: bone_weights(vertices[i][2]))

    # Torso and limb cross-sections are continuous; clothing is layered on top.
    torso = smooth_points([(0.90, 0.134, 0.080), (0.98, 0.145, 0.089), (1.08, 0.105, 0.068), (1.18, 0.125, 0.080), (1.28, 0.159, 0.096), (1.38, 0.165, 0.074), (1.43, 0.075, 0.053)], 22)
    def torso_weights(z):
        if z < 1.02:
            return {'pelvis': 1}
        blend = min(1, max(0, (z-1.08)/0.21))
        return {'spine': 1-blend, 'chest': blend}
    loft('WhiteFittedBodice', [(p.x, p.y, p.z, 0) for p in torso], 'white', 1, torso_weights)
    tube('Neck', [(0, 0, 1.405), (0, 0, 1.48), (0, 0, 1.54)], [0.061, 0.046, 0.047], 'skin', 0, 'neck', 12, 20)
    # A shaped jaw narrows below the cheeks; the face is not a blank sphere.
    face_rings = [(1.535, 0.016, 0.037, -0.026), (1.55, 0.043, 0.055, -0.020), (1.58, 0.074, 0.075, -0.012), (1.62, 0.108, 0.087, -0.003), (1.67, 0.119, 0.091, 0), (1.72, 0.116, 0.087, 0.003), (1.77, 0.095, 0.071, 0.008), (1.80, 0.048, 0.039, 0.014), (1.81, 0.003, 0.003, 0.014)]
    loft('Face', face_rings, 'skin', 0, lambda z: {'head': 1}, 32)
    ellipsoid('Nose', (0, -0.089, 1.628), (0.012, 0.018, 0.021), 'skin', 'head', 10, 12)
    tube('Mouth', [(-0.025, -0.087, 1.584), (0, -0.093, 1.581), (0.025, -0.087, 1.584)], [0.0018, 0.0024, 0.0018], 'lip', 0, 'head', 10, 5)
    for sign, side in [(1, 'L'), (-1, 'R')]:
        x = sign*0.052
        eye = 'eye.'+side
        ellipsoid('EyeWhite.'+side, (x, -0.084, 1.668), (0.035, 0.018, 0.023), 'white', eye, 12, 20)
        ellipsoid('Iris.'+side, (x-sign*0.002, -0.100, 1.668), (0.015, 0.006, 0.019), 'iris', eye, 12, 16)
        ellipsoid('Pupil.'+side, (x-sign*0.002, -0.105, 1.668), (0.006, 0.002, 0.012), 'dark', eye, 10, 12)
        ellipsoid('EyeCatchlight.'+side, (x-0.005, -0.107, 1.676), (0.004, 0.001, 0.005), 'white', eye, 8, 10)
        tube('UpperLash.'+side, [(x-sign*0.033, -0.091, 1.668), (x-sign*0.008, -0.103, 1.690), (x+sign*0.025, -0.092, 1.687), (x+sign*0.039, -0.084, 1.695)], [0.002, 0.0033, 0.003, 0.0003], 'dark', 0, eye, 14, 5)
        tube('LowerLash.'+side, [(x-sign*0.025, -0.095, 1.651), (x, -0.102, 1.646), (x+sign*0.027, -0.092, 1.653)], [0.0005, 0.0012, 0.0005], 'lip', 0, eye, 10, 4)
        tube('Brow.'+side, [(x-sign*0.030, -0.085, 1.713), (x, -0.090, 1.719), (x+sign*0.032, -0.077, 1.712)], [0.001, 0.0025, 0.0005], 'pink', 0, 'brow.'+side, 10, 5)
        shoulder = (sign*0.172, 0, 1.385)
        elbow, wrist = (sign*0.36, -0.015, 1.19), (sign*0.43, -0.08, 1.01)
        tube('Arm.'+side, [shoulder, (sign*0.25, 0, 1.30), elbow, (sign*0.40, -0.05, 1.09), wrist], [0.050, 0.043, 0.031, 0.033, 0.021], 'skin', 0, ['upper_arm.'+side, 'forearm.'+side], 22, 14)
        tube('Glove.'+side, [(sign*0.397, -0.044, 1.105), wrist, (sign*0.445, -0.085, 0.967)], [0.036, 0.023, 0.025], 'white', 1, 'forearm.'+side, 12, 12)
        tube('WristGold.'+side, [(sign*0.424, -0.075, 1.036), (sign*0.429, -0.078, 1.023)], [0.027, 0.027], 'gold', 2, 'forearm.'+side, 2, 12)
        tube('Palm.'+side, [wrist, (sign*0.447, -0.082, 0.965), (sign*0.446, -0.085, 0.948)], [0.022, 0.030, 0.024], 'skin', 0, 'hand.'+side, 8, 12, 0.6)
        for finger in range(5):
            points = [rig.data.bones[f'finger{finger}.{joint}.{side}'].head_local for joint in range(3)]
            points.append(rig.data.bones[f'finger{finger}.2.{side}'].tail_local)
            tube(f'Finger{finger}.{side}', points, [0.006, 0.005, 0.004, 0.002], 'skin', 0, [f'finger{finger}.0.{side}', f'finger{finger}.2.{side}'], 9, 6)
        hip, knee, ankle = (sign*0.095, 0, 0.92), (sign*0.11, -0.01, 0.52), (sign*0.11, 0.01, 0.12)
        tube('Leg.'+side, [hip, (sign*0.10, 0, 0.76), knee, (sign*0.11, 0.015, 0.35), ankle], [0.078, 0.063, 0.041, 0.046, 0.024], 'skin', 0, ['thigh.'+side, 'shin.'+side], 24, 14)
        tube('WhiteBoot.'+side, [(sign*0.11, 0.008, 0.42), ankle, (sign*0.11, -0.10, 0.07), (sign*0.11, -0.18, 0.07)], [0.046, 0.028, 0.043, 0.022], 'white', 1, ['shin.'+side, 'foot.'+side], 14, 10)
        tube('BootGold.'+side, [(sign*0.11, -0.040, 0.42), (sign*0.11, -0.034, 0.25), (sign*0.11, -0.02, 0.13), (sign*0.11, -0.17, 0.075)], [0.003, 0.004, 0.004, 0.001], 'gold', 2, 'shin.'+side, 16, 5)
        # Long hair clumps curve out from the head and fall below the waist.
        for strand in range(7):
            a = strand/6
            points = [(sign*(0.045+a*0.067), 0.03+a*0.032, 1.78-a*0.04), (sign*(0.12+a*0.07), 0.11, 1.53), (sign*(0.14+a*0.13), 0.11+a*0.07, 1.20), (sign*(0.17+a*0.16), 0.06+a*0.08, 0.88+a*0.09), (sign*(0.25+a*0.13), 0.01, 0.79+a*0.09)]
            tube(f'HairLock{strand}.{side}', points, [0.027, 0.030, 0.029, 0.022, 0.0004], 'pinkLight' if strand%3 == 0 else 'pink', 0, ['hair.0.'+side, 'hair.1.'+side], 14, 6, 0.52)
        for strand in range(4):
            x = sign*(0.012+strand*0.026)
            tube(f'Bang{strand}.{side}', [(x*0.3, -0.015, 1.797), (x, -0.075, 1.78), (x*1.1, -0.102, 1.747), (x*1.1+sign*0.006, -0.100, 1.703+strand*0.003)], [0.021, 0.024, 0.022, 0.0003], 'pinkLight' if strand%2 else 'pink', 0, 'head', 14, 7, 0.40)
        # Three overlapping rows, each with wide tapered feather vanes.
        for row, count in [(0, 9), (1, 8), (2, 7)]:
            for index in range(count):
                t = index/(count-1)
                base = (sign*(0.17+0.24*t), 0.12-row*0.028, 1.39+0.12*t-row*0.012)
                tip = (sign*(0.62+0.57*t-row*0.07), 0.18-row*0.03, 1.86-0.66*t-row*0.13)
                feather(f'Feather{row}.{index}.{side}', base, tip, 0.071-row*0.008, [f'wing{row}.0.{side}', f'wing{row}.1.{side}'], row)
        for index in range(7):
            t = index/6
            ellipsoid(f'WingCoverlet{index}.{side}', (sign*(0.21+t*0.29), 0.06, 1.41+t*0.10), (0.045, 0.024, 0.075), 'white', f'wing0.0.{side}', 6, 8, 1)
        # Delicate gold bodice filigree replaces heavy spherical pauldrons.
        tube('BodiceSeam.'+side, [(sign*0.155, -0.045, 1.38), (sign*0.12, -0.082, 1.30), (sign*0.083, -0.087, 1.18), (sign*0.05, -0.073, 1.06), (0, -0.09, 1.0)], [0.004, 0.004, 0.004, 0.004, 0.002], 'gold', 2, 'chest', 18, 5)
        tube('Neckline.'+side, [(0, -0.103, 1.29), (sign*0.07, -0.102, 1.36), (sign*0.13, -0.075, 1.37)], [0.003, 0.004, 0.003], 'gold', 2, 'chest', 14, 5)
        tube('Tiara.'+side, [(0, -0.086, 1.783), (sign*0.045, -0.082, 1.803), (sign*0.10, -0.045, 1.785), (sign*0.12, 0.00, 1.77)], [0.004, 0.004, 0.004, 0.002], 'gold', 2, 'head', 16, 5)
        ellipsoid('TempleGem.'+side, (sign*0.116, -0.04, 1.77), (0.012, 0.010, 0.025), 'iris', 'head', 8, 10, 2)
    # Hair cap is restricted to the upper/back scalp to preserve the forehead.
    vertices, faces = [], []
    rows, cols = 9, 32
    for row in range(rows+1):
        for col in range(cols):
            phi = col/cols*math.tau
            front = max(0, -math.sin(phi))
            theta = row/rows*(1.75-0.6*front)
            vertices.append((0.124*math.sin(theta)*math.cos(phi), 0.010+0.096*math.sin(theta)*math.sin(phi), 1.674+0.143*math.cos(theta)))
    for row in range(rows):
        for col in range(cols):
            i = row*cols+col
            j = row*cols+(col+1)%cols
            faces.append((i, j, j+cols, i+cols))
    mesh('HairCrown', vertices, faces, 'pink', 0, 'head')
    for strand in range(5):
        x = (strand-2)*0.035
        side = 'L' if x >= 0 else 'R'
        tube('BackHair'+str(strand), [(x, 0.075, 1.78), (x*1.2, 0.116, 1.57), (x*1.5, 0.14, 1.26), (x*1.9, 0.12, 0.97), (x*2.3, 0.16, 0.84)], [0.024, 0.027, 0.026, 0.018, 0.0003], 'pinkLight' if strand%2 else 'pink', 0, ['hair.0.'+side, 'hair.1.'+side], 14, 6, 0.50)
    # Twelve petal panels make an opaque flared skirt; longer side/back drapes
    # are distinct editable cloth pieces and remain proposals for hidden views.
    for panel in range(12):
        angle = panel/12*math.tau
        back = max(0, math.sin(angle))
        vertices, faces = [], []
        rows, cols = 7, 5
        for row in range(rows+1):
            t = row/rows
            for col in range(cols+1):
                u = col/cols*2-1
                theta = angle+u*math.pi/12*1.1
                radius = 0.141+0.115*t+0.02*math.sin(t*math.pi)
                z = 1.01-(0.29+0.11*back)*t+0.045*abs(u)**1.5*t**3
                vertices.append((radius*math.cos(theta), radius*0.64*math.sin(theta)-0.005, z))
        for row in range(rows):
            for col in range(cols):
                i = row*(cols+1)+col
                faces.append((i, i+1, i+cols+2, i+cols+1))
        mesh('SkirtPetal'+str(panel), vertices, faces, 'white' if panel%3 else 'lavender', 1, 'pelvis')
        hem = [vertices[rows*(cols+1)+col] for col in range(cols+1)]
        tube('SkirtGoldHem'+str(panel), hem, [0.002, 0.002], 'gold', 2, 'pelvis', 8, 4)
        if panel in [1, 2, 3, 4, 5]:
            start = (0.14*math.cos(angle), 0.09*math.sin(angle), 1.01)
            end = (0.34*math.cos(angle), 0.26*math.sin(angle), 0.42)
            feather('SilkTrain'+str(panel), start, end, 0.085, ['pelvis', 'pelvis'])
    ellipsoid('BodiceGem', (0, -0.097, 1.31), (0.018, 0.014, 0.030), 'iris', 'chest', 10, 12, 2)
    tube('Belt', [(0.145*math.cos(a/32*math.tau), 0.093*math.sin(a/32*math.tau), 1.015) for a in range(33)], [0.005, 0.005], 'gold', 2, 'pelvis', 48, 5)
    # A recurve bow, held alongside the right hand, remains easy to inspect.
    bow_points = [(-0.49, -0.10, 0.62), (-0.57, -0.10, 0.73), (-0.53, -0.10, 0.87), (-0.48, -0.10, 1.0), (-0.54, -0.10, 1.14), (-0.57, -0.10, 1.27), (-0.49, -0.10, 1.38)]
    tube('GoldRecurveBow', bow_points, [0.006, 0.012, 0.010, 0.015, 0.010, 0.012, 0.006], 'gold', 2, 'hand.R', 38, 8)
    tube('BowGrip', [(-0.48, -0.10, 0.965), (-0.48, -0.10, 1.035)], [0.018, 0.018], 'pink', 0, 'hand.R', 4, 8)
    tube('Bowstring', [bow_points[0], (-0.442, -0.10, 1.0), bow_points[-1]], [0.0008, 0.0008], 'white', 1, 'hand.R', 12, 4)
    return parts
