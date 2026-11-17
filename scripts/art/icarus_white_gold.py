"""Editable white/gold Icarus study geometry, authored for the owner reference."""
import math

import bpy
from mathutils import Vector


def build_character(rig, scene):
    parts = []
    colors = {
        'skin': (0.86, 0.64, 0.58, 1), 'pink': (0.77, 0.28, 0.40, 1),
        'pinkLight': (0.96, 0.49, 0.59, 1), 'white': (0.86, 0.85, 0.91, 1),
        'lavender': (0.45, 0.40, 0.62, 1), 'gold': (0.69, 0.36, 0.07, 1),
        'dark': (0.065, 0.012, 0.030, 1), 'iris': (0.60, 0.09, 0.22, 1),
        'lip': (0.54, 0.16, 0.22, 1), 'goldLight': (0.96, 0.69, 0.24, 1),
    }
    materials = []
    for name, metallic, roughness in [('SkinHair', 0, 0.65), ('FeatherSilk', 0.05, 0.52), ('Ornament', 0.65, 0.28)]:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
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
        for loop, item in zip(data.loops, attr.data):
            point = data.vertices[loop.vertex_index].co
            value = rgba(point) if callable(rgba) else rgba
            item.color = value
        for poly in data.polygons:
            poly.use_smooth = True
        uv = data.uv_layers.new(name='AuthoringUV')
        for index, loop in enumerate(data.loops):
            point = data.vertices[loop.vertex_index].co
            uv.data[index].uv = (point.x*0.25+0.5, point.z*0.45)
            if (isinstance(color, str) and color == 'skin') or name == 'Face':
                uv.data[index].uv.x += 6
            elif name.startswith(('Eye', 'Iris', 'Pupil', 'UpperLash', 'LowerLash', 'Brow', 'Mouth')):
                uv.data[index].uv.x += 8
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
        rgba = colors[color] if isinstance(color, str) else color
        if material == 0 and ('Hair' in name or 'Bang' in name):
            def hair_color(point):
                highlight = 0.88+0.10*math.sin(point.z*11+point.x*14)
                return tuple(v*highlight for v in rgba[:3])+(1,)
            color = hair_color
        obj = mesh(name, vertices, faces, color, material, weights)
        if 'Hair' in name or 'Bang' in name:
            for loop in obj.data.loops:
                row, col = divmod(loop.vertex_index, sides)
                obj.data.uv_layers.active.data[loop.index].uv = (4+col/sides, row/steps)
        return obj

    def ellipsoid(name, center, scale, color, bone, rows=16, cols=24, material=0):
        vertices = [(center[0], center[1], center[2]+scale[2])]
        faces = []
        for row in range(1, rows):
            theta = row/rows*math.pi
            for col in range(cols):
                phi = col/cols*math.tau
                vertices.append((center[0]+scale[0]*math.sin(theta)*math.cos(phi), center[1]+scale[1]*math.sin(theta)*math.sin(phi), center[2]+scale[2]*math.cos(theta)))
        bottom = len(vertices)
        vertices.append((center[0], center[1], center[2]-scale[2]))
        for col in range(cols):
            faces.append((0, 1+col, 1+(col+1)%cols))
            faces.append((bottom, 1+(rows-2)*cols+(col+1)%cols, 1+(rows-2)*cols+col))
        for row in range(rows-2):
            for col in range(cols):
                i = 1+row*cols+col
                j = 1+row*cols+(col+1)%cols
                faces.append((i, j, j+cols, i+cols))
        return mesh(name, vertices, faces, color, material, bone)

    def hair_lock(name, points, widths, bone, light=False, steps=24, tilt=0):
        centers = smooth_points(points, steps)
        vertices, faces = [], []
        sides = 8
        for row, center in enumerate(centers):
            tangent = (centers[min(row+1, steps)]-centers[max(0, row-1)]).normalized()
            across = tangent.cross(Vector((0, 1, 0))).normalized()
            depth = tangent.cross(across).normalized()
            t = row/steps
            pos = t*(len(widths)-1)
            i = min(len(widths)-2, int(pos))
            width = widths[i]*(1-pos+i)+widths[i+1]*(pos-i)
            twist = tilt*math.sin(t*math.pi)
            for col in range(sides):
                a = col/sides*math.tau+twist
                x, y = math.cos(a), math.sin(a)
                # Lenticular clumps have a broad curved face and thin turned edges.
                vertex = center+across*(width*x)+depth*(width*0.20*y*(0.6+0.4*abs(y)))
                vertices.append(tuple(vertex))
        for row in range(steps):
            for col in range(sides):
                k = row*sides+col
                j = row*sides+(col+1)%sides
                faces.append((k, j, j+sides, k+sides))
        faces.extend([tuple(reversed(range(sides))), tuple(steps*sides+i for i in range(sides))])
        base = colors['pinkLight' if light else 'pink']
        def tint(point):
            height = max(0, min(1, (point.z-0.5)/1.3))
            return tuple(v*(0.80+0.20*height) for v in base[:3])+(1,)
        def weights(index):
            if isinstance(bone, str):
                return {bone: 1}
            t = index//sides/steps
            blend = max(0, min(1, (t-0.30)/0.4))
            return {bone[0]: 1-blend, bone[1]: blend}
        obj = mesh(name, vertices, faces, tint, 0, weights)
        for loop in obj.data.loops:
            row, col = divmod(loop.vertex_index, sides)
            obj.data.uv_layers.active.data[loop.index].uv = (4+col/sides, row/steps)
        return obj

    def feather(name, start, end, width, bones, row=0):
        a, b = Vector(start), Vector(end)
        length = b-a
        cross = Vector((-length.z, 0, length.x)).normalized() * (1 if length.x > 0 else -1)
        vertices, faces = [], []
        sections, columns = (5, 2) if name.startswith('WingCoverlet') else (9, 4)
        # Curved double-sided feather vanes use a single surface, as in a
        # skinned feather-card mesh; geometry is spent on the silhouette.
        for side in [1]:
            for i in range(sections+1):
                t = i/sections
                shape = math.sin(math.pi*t)**0.40
                for j in range(columns+1):
                    u = j/columns*2-1
                    center = a+length*t+cross*(0.10*math.sin(math.pi*t))
                    center.y += 0.13*t*t-0.05*math.sin(math.pi*t)
                    barb = 1-0.035*math.sin(i*5.7+row)*abs(u)
                    vertex = center+cross*(u*width*shape*barb*(0.8 if u < 0 else 1))
                    vertex.y += side*0.003+0.018*abs(u)**1.5*shape
                    vertices.append(tuple(vertex))
        stride = (sections+1)*(columns+1)
        for side in range(1):
            for i in range(sections):
                for j in range(columns):
                    k = side*stride+i*(columns+1)+j
                    face = (k, k+1, k+columns+2, k+columns+1)
                    faces.append(tuple(reversed(face)) if side else face)
        def weights(index):
            if bones[0] == bones[1]:
                return {bones[0]: 1}
            t = (index%stride)//(columns+1)/sections
            blend = max(0, min(1, (t-0.3)/0.4))
            return {bones[0]: 1-blend, bones[1]: blend}
        obj = mesh(name, vertices, faces, (0.78-row*0.045, 0.80-row*0.043, 0.88-row*0.035, 1), 1, weights)
        for loop in obj.data.loops:
            section, column = divmod(loop.vertex_index, columns+1)
            obj.data.uv_layers.active.data[loop.index].uv = (2+column/columns, section/sections)
        # The central shaft gives the feather a readable construction in neutral light.
        tube(name+'.shaft', [a, a+length*0.5+cross*0.10+Vector((0, -0.0275, 0)), a+length*0.91+cross*0.028+Vector((0, 0.083, 0))], [0.0014, 0.001, 0.0002], 'white', 1, bones, steps=5, sides=3)
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

    def jewel(name, center, size, bone, color='iris'):
        x, y, z = center
        w, h = size
        vertices = [(x, y-0.008, z), (x-w, y, z), (x, y, z+h), (x+w, y, z), (x, y, z-h), (x, y+0.003, z)]
        faces = [(0, i, i%4+1) for i in range(1, 5)]+[(5, i%4+1, i) for i in range(1, 5)]
        return mesh(name, vertices, faces, color, 2, bone)

    def ornament(name, center, size, bone):
        x, y, z = center
        w, h = size
        for sign in [-1, 1]:
            tube(name+str(sign), [(x, y, z-h), (x+sign*w, y, z), (x, y, z+h)], [0.0025, 0.004, 0.001], 'goldLight', 2, bone, 6, 3)
        jewel(name+'Gem', center, (w*0.33, h*0.47), bone)

    # Torso and limb cross-sections are continuous; clothing is layered on top.
    torso = smooth_points([(0.90, 0.134, 0.080), (0.98, 0.145, 0.089), (1.08, 0.105, 0.068), (1.18, 0.121, 0.080), (1.28, 0.153, 0.096), (1.38, 0.155, 0.074), (1.43, 0.073, 0.053)], 18)
    def torso_weights(z):
        if z < 1.02:
            return {'pelvis': 1}
        blend = min(1, max(0, (z-1.08)/0.21))
        return {'spine': 1-blend, 'chest': blend}
    def bodice_color(point):
        neckline = 1.31+0.07*min(1, abs(point.x)/0.15)
        if point.z > neckline:
            return colors['skin']
        return colors['white']
    loft('WhiteFittedBodice', [(p.x, p.y, p.z, 0) for p in torso], bodice_color, 1, torso_weights, 28)
    tube('Neck', [(0, 0, 1.405), (0, 0, 1.46), (0, 0, 1.51)], [0.047, 0.036, 0.041], 'skin', 0, 'neck', 8, 14)
    # A shaped jaw narrows below the cheeks; the face is not a blank sphere.
    profile = smooth_points([(1.535, 0.008, 0.028), (1.55, 0.032, 0.049), (1.58, 0.063, 0.069), (1.62, 0.089, 0.082), (1.67, 0.103, 0.087), (1.72, 0.105, 0.084), (1.77, 0.090, 0.069), (1.80, 0.047, 0.038), (1.81, 0.003, 0.003)], 23)
    def complexion(point):
        cheek = math.exp(-((abs(point.x)-0.063)/0.033)**2-((point.z-1.625)/0.024)**2)*max(0, -point.y/0.08)
        nose = math.exp(-(point.x/0.012)**2-((point.z-1.62)/0.018)**2)*max(0, -point.y/0.08)
        return (0.86+0.03*cheek, 0.64-0.075*cheek-0.035*nose, 0.58-0.035*cheek-0.02*nose, 1)
    face = loft('Face', [(p.x, p.y, p.z, -0.005) for p in profile], complexion, 0, lambda z: {'head': 1}, 40)
    for vertex in face.data.vertices:
        p = vertex.co
        front = max(0, -p.y/0.08)**4
        # An integrated nose bridge reads softly from the front and in profile.
        p.y -= 0.016*math.exp(-(p.x/0.010)**2-((p.z-1.628)/0.021)**2)*front
    tube('NoseAccent', [(0.004, -0.097, 1.626), (0.008, -0.096, 1.620), (0.003, -0.092, 1.617)], [0.0001, 0.00065, 0.0001], (0.65, 0.38, 0.34, 1), 0, 'head', 5, 3)
    vertices = [(0, -0.081, 1.589)]
    for i in range(24):
        a = i/24*math.tau
        x = 0.020*math.cos(a)
        z = 1.592+(0.006 if math.sin(a) > 0 else 0.015)*math.sin(a)
        vertices.append((x, -0.080+abs(x)*0.15, z))
    mesh('MouthSmile', vertices, [(0, i+1, (i+1)%24+1) for i in range(24)], 'dark', 0, 'head')
    mesh('MouthTeeth', [(-0.016, -0.082, 1.594), (0, -0.083, 1.597), (0.016, -0.082, 1.594), (0.012, -0.083, 1.591), (0, -0.084, 1.590), (-0.012, -0.083, 1.591)], [(0, 1, 4, 5), (1, 2, 3, 4)], 'white', 0, 'head')
    ellipsoid('MouthTongue', (0.002, -0.081, 1.582), (0.010, 0.001, 0.003), 'lip', 'head', 4, 8)
    tube('MouthLowerLip', [(-0.012, -0.078, 1.578), (0, -0.080, 1.576), (0.012, -0.078, 1.578)], [0.0003, 0.001, 0.0003], 'lip', 0, 'head', 6, 4)
    for sign, side in [(1, 'L'), (-1, 'R')]:
        x = sign*0.047
        eye = 'eye.'+side
        def eye_y(px, layer=0):
            return -0.010-0.086*math.sqrt(max(0.05, 1-(px/0.110)**2))-layer
        def eye_patch(name, cx, cz, width, height, color, layer):
            vertices = [(cx, eye_y(cx, layer+0.001), cz)]
            for i in range(32):
                a = i/32*math.tau
                px = cx+width*math.cos(a)
                pz = cz+height*math.sin(a)*(0.82+0.18*abs(math.sin(a)))
                vertices.append((px, eye_y(px, layer), pz))
            return mesh(name+'.'+side, vertices, [(0, i+1, (i+1)%32+1) for i in range(32)], color, 0, eye)
        eye_patch('EyeWhite', x, 1.669, 0.031, 0.019, 'white', 0)
        def iris_color(point):
            t = max(0, min(1, (1.690-point.z)/0.040))
            return (0.22+0.64*t, 0.028+0.26*t*t, 0.13+0.20*t, 1)
        eye_patch('Iris', x-sign*0.003, 1.670, 0.014, 0.018, iris_color, 0.002)
        eye_patch('IrisLower', x-sign*0.003, 1.660, 0.0095, 0.006, (0.88, 0.38, 0.40, 1), 0.003)
        eye_patch('Pupil', x-sign*0.003, 1.674, 0.0048, 0.009, 'dark', 0.004)
        eye_patch('EyeCatchlight', x-0.006, 1.680, 0.004, 0.005, 'white', 0.005)
        eye_patch('EyeSmallLight', x+0.005, 1.660, 0.0015, 0.002, 'white', 0.005)
        tube('UpperLash.'+side, [(x-sign*0.034, eye_y(x-sign*0.034, 0.001), 1.667), (x-sign*0.013, eye_y(x-sign*0.013, 0.003), 1.688), (x+sign*0.017, eye_y(x+sign*0.017, 0.003), 1.690), (x+sign*0.033, eye_y(x+sign*0.033, 0.002), 1.680), (x+sign*0.041, eye_y(x+sign*0.041, 0.001), 1.686)], [0.001, 0.003, 0.003, 0.002, 0.0001], 'dark', 0, eye, 14, 4)
        tube('LowerLash.'+side, [(x-sign*0.025, eye_y(x-sign*0.025), 1.654), (x, eye_y(x, 0.001), 1.647), (x+sign*0.029, eye_y(x+sign*0.029), 1.657)], [0.0002, 0.0007, 0.0002], 'lip', 0, eye, 8, 3)
        tube('Brow.'+side, [(x-sign*0.027, -0.088, 1.710), (x-sign*0.005, -0.094, 1.717), (x+sign*0.030, -0.075, 1.710)], [0.0005, 0.0015, 0.0002], 'lip', 0, 'brow.'+side, 8, 4)
        shoulder = (sign*0.172, 0, 1.385)
        elbow, wrist = (sign*0.36, -0.015, 1.19), (sign*0.43, -0.08, 1.01)
        tube('Arm.'+side, [shoulder, (sign*0.25, 0, 1.30), elbow, (sign*0.40, -0.05, 1.09), wrist], [0.050, 0.043, 0.031, 0.033, 0.021], 'skin', 0, ['upper_arm.'+side, 'forearm.'+side], 18, 12)
        tube('Glove.'+side, [(sign*0.397, -0.044, 1.105), wrist, (sign*0.445, -0.085, 0.967)], [0.036, 0.023, 0.025], 'white', 1, ['forearm.'+side, 'hand.'+side], 10, 10)
        tube('WristGold.'+side, [(sign*0.424, -0.075, 1.036), (sign*0.429, -0.078, 1.023)], [0.027, 0.027], 'gold', 2, 'forearm.'+side, 2, 12)
        tube('Palm.'+side, [wrist, (sign*0.447, -0.082, 0.965), (sign*0.446, -0.085, 0.948)], [0.022, 0.030, 0.024], 'skin', 0, 'hand.'+side, 8, 12, 0.6)
        for finger in range(5):
            points = [rig.data.bones[f'finger{finger}.{joint}.{side}'].head_local for joint in range(3)]
            points.append(rig.data.bones[f'finger{finger}.2.{side}'].tail_local)
            tube(f'Finger{finger}.{side}', points, [0.006, 0.005, 0.004, 0.002], 'skin', 0, [f'finger{finger}.0.{side}', f'finger{finger}.2.{side}'], 6, 5)
        hip, knee, ankle = (sign*0.095, 0, 0.92), (sign*0.11, -0.01, 0.52), (sign*0.11, 0.01, 0.12)
        tube('Leg.'+side, [hip, (sign*0.10, 0, 0.76), knee, (sign*0.11, 0.015, 0.35), ankle], [0.078, 0.063, 0.041, 0.046, 0.024], 'skin', 0, ['thigh.'+side, 'shin.'+side], 20, 12)
        tube('WhiteBoot.'+side, [(sign*0.11, 0.008, 0.42), (sign*0.11, 0.012, 0.29), ankle], [0.052, 0.050, 0.031], 'white', 1, 'shin.'+side, 10, 12)
        tube('WhiteShoe.'+side, [(sign*0.11, 0.01, 0.12), (sign*0.11, -0.08, 0.065), (sign*0.11, -0.17, 0.062)], [0.032, 0.042, 0.023], 'white', 1, 'foot.'+side, 8, 10)
        tube('BootGold.'+side, [(sign*0.11, -0.040, 0.42), (sign*0.11, -0.034, 0.25), (sign*0.11, -0.02, 0.13), (sign*0.11, -0.17, 0.075)], [0.003, 0.004, 0.004, 0.001], 'gold', 2, 'shin.'+side, 16, 5)
        # Unequal S-curves, broad clumps and turned tips replace the straight curtain.
        for strand in range(4):
            a = strand/3
            wind = -0.16-0.06*a
            points = [(sign*(0.05+a*0.06), 0.03+a*0.035, 1.78-a*0.035),
                      (sign*(0.15+a*0.04), 0.065+a*0.04, 1.53),
                      (sign*(0.28+a*0.10)+wind*0.35, 0.13+a*0.05, 1.29+0.05*a),
                      (sign*(0.37+a*0.12)+wind, 0.18+a*0.04, 1.01+0.10*a),
                      (sign*(0.28+a*0.10)+wind*1.4, 0.20+a*0.06, 0.76+0.17*a),
                      (sign*(0.39+a*0.09)+wind*1.5, 0.16+a*0.04, 0.68+0.17*a),
                      (sign*(0.48+a*0.10)+wind, 0.10+a*0.04, 0.80+0.18*a)]
            hair_lock(f'HairLock{strand}.{side}', points, [0.025, 0.044, 0.065, 0.061, 0.043, 0.022, 0.0002], ['hair.0.'+side, 'hair.1.'+side], strand%2 == 0, steps=26, tilt=sign*0.5)
        for strand in range(2):
            z = strand*0.14
            hair_lock(f'WindHair{strand}.{side}', [(sign*0.10, 0.07, 1.61-z), (sign*0.25-0.07, 0.12, 1.34-z), (sign*0.53-0.14, 0.15, 1.22-z), (sign*0.65-0.20, 0.10, 1.35-z), (sign*0.53-0.20, 0.04, 1.43-z)], [0.016, 0.029, 0.038, 0.023, 0.0001], ['hair.0.'+side, 'hair.1.'+side], True, steps=22, tilt=0.8)
        for strand in range(3):
            x = sign*(0.016+strand*0.035)
            end = 1.699+strand*0.018 if sign < 0 else 1.726+strand*0.006
            hair_lock(f'Bang{strand}.{side}', [(0.025+x*0.35, -0.007, 1.800), (x*0.8+0.023, -0.070, 1.78), (x*1.08+0.009, -0.106, 1.746), (x*1.3-sign*0.007, -0.111, end)], [0.012, 0.023, 0.017, 0.0001], 'head', strand%2 == 0, steps=16)
        hair_lock('TempleHair.'+side, [(sign*0.09, -0.025, 1.77), (sign*0.12, -0.045, 1.66), (sign*0.13, -0.060, 1.54), (sign*0.19, -0.09, 1.50), (sign*0.20, -0.08, 1.57)], [0.020, 0.025, 0.019, 0.012, 0.0001], 'head', True, steps=18)
        # Three overlapping rows, each with wide tapered feather vanes.
        for row, count in [(0, 9), (1, 8), (2, 6)]:
            for index in range(count):
                t = index/(count-1)
                base = (sign*(0.20+0.44*t), 0.17-row*0.044, 1.42+0.22*math.sin(t*math.pi*0.8)-row*0.055)
                tip = (sign*(0.60+0.57*t-row*0.085), 0.20-row*0.044, 1.98-0.50*t-row*0.14+0.015*math.sin(index*1.7))
                feather(f'Feather{row}.{index}.{side}', base, tip, 0.067-row*0.006, [f'wing{row}.0.{side}', f'wing{row}.1.{side}'], row)
        for index in range(6):
            t = index/5
            feather(f'WingCoverlet{index}.{side}', (sign*(0.20+t*0.29), 0.015, 1.41+t*0.14), (sign*(0.31+t*0.34), 0.00, 1.49+t*0.16), 0.033, [f'wing0.0.{side}', f'wing0.0.{side}'], 2)
        # Delicate gold bodice filigree replaces heavy spherical pauldrons.
        tube('BodiceSeam.'+side, [(sign*0.155, -0.045, 1.38), (sign*0.12, -0.082, 1.30), (sign*0.083, -0.087, 1.18), (sign*0.05, -0.073, 1.06), (0, -0.09, 1.0)], [0.004, 0.004, 0.004, 0.004, 0.002], 'gold', 2, 'chest', 18, 5)
        tube('Neckline.'+side, [(0, -0.103, 1.29), (sign*0.07, -0.102, 1.36), (sign*0.13, -0.075, 1.37)], [0.003, 0.004, 0.003], 'gold', 2, 'chest', 14, 5)
        tube('Tiara.'+side, [(0, -0.086, 1.783), (sign*0.045, -0.082, 1.803), (sign*0.10, -0.045, 1.785), (sign*0.12, 0.00, 1.77)], [0.004, 0.004, 0.004, 0.002], 'gold', 2, 'head', 16, 5)
        ellipsoid('TempleGem.'+side, (sign*0.116, -0.04, 1.77), (0.012, 0.010, 0.025), 'iris', 'head', 8, 10, 2)
        ornament('ShoulderCrest.'+side, (sign*0.185, -0.040, 1.38), (0.035, 0.048), 'upper_arm.'+side)
        ornament('SleeveCrest.'+side, (sign*0.405, -0.085, 1.075), (0.018, 0.025), 'forearm.'+side)
        ornament('HipCrest.'+side, (sign*0.122, -0.075, 0.975), (0.026, 0.052), 'pelvis')
        ornament('BootCrest.'+side, (sign*0.11, -0.045, 0.36), (0.021, 0.043), 'shin.'+side)
        tube('ThighChain.'+side, [(sign*(0.10+0.071*math.cos(t/24*math.tau)), 0.055*math.sin(t/24*math.tau), 0.69+0.025*math.cos(t/24*math.tau)) for t in range(25)], [0.002, 0.002], 'goldLight', 2, 'thigh.'+side, 24, 4)
        jewel('Earring.'+side, (sign*0.112, -0.012, 1.58), (0.010, 0.025), 'head', 'goldLight')
    # Hair cap is restricted to the upper/back scalp to preserve the forehead.
    vertices, faces = [], []
    rows, cols = 8, 32
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
    for strand in range(3):
        x = (strand-1)*0.05
        side = 'L' if x >= 0 else 'R'
        hair_lock('BackHair'+str(strand), [(x, 0.075, 1.78), (x*1.2, 0.126, 1.57), (x*1.8-0.09, 0.19, 1.26), (x*2.5-0.18, 0.24, 0.97), (x*2.3-0.28, 0.26, 0.75), (x*2.3-0.24, 0.28, 0.69)], [0.032, 0.044, 0.058, 0.050, 0.030, 0.0001], ['hair.0.'+side, 'hair.1.'+side], strand%2 == 0, steps=22)
    # Staggered overskirt and long folded trains follow the reference's
    # layered costume. Hidden views remain new design proposals.
    for panel in range(10):
        angle = panel/10*math.tau
        back = max(0, math.sin(angle))
        vertices, faces = [], []
        rows, cols = 7, 4
        for row in range(rows+1):
            t = row/rows
            for col in range(cols+1):
                u = col/cols*2-1
                theta = angle+u*math.pi/10*1.12+0.12*t
                radius = 0.141+0.13*t+0.018*math.sin(t*math.pi)+0.012*math.cos(u*math.pi*2)*t
                length = 0.21+0.11*back+0.065*(panel%2)
                z = 1.01-length*t+0.07*abs(u)**1.5*t**3
                vertices.append((radius*math.cos(theta), radius*0.65*math.sin(theta)-0.009, z))
        for row in range(rows):
            for col in range(cols):
                i = row*(cols+1)+col
                faces.append((i, i+1, i+cols+2, i+cols+1))
        mesh('SkirtPetal'+str(panel), vertices, faces, 'white' if panel%2 else (0.65, 0.64, 0.78, 1), 1, 'pelvis')
        hem = [vertices[rows*(cols+1)+col] for col in range(cols+1)]
        tube('SkirtGoldHem'+str(panel), hem, [0.002, 0.002], 'goldLight', 2, 'pelvis', 5, 3)
    for panel in range(5):
        angle = panel/4*math.pi
        centerline = smooth_points([(0.14*math.cos(angle), 0.10*math.sin(angle)+0.025, 0.99),
                                    (0.25*math.cos(angle)-0.025, 0.17*math.sin(angle)+0.03, 0.77),
                                    (0.42*math.cos(angle)-0.09, 0.26*math.sin(angle)+0.02, 0.52),
                                    (0.50*math.cos(angle)-0.18, 0.31*math.sin(angle), 0.28),
                                    (0.43*math.cos(angle)-0.22, 0.32*math.sin(angle)-0.02, 0.20+0.10*abs(math.cos(angle)))], 12)
        vertices, faces = [], []
        across = Vector((-math.sin(angle), 0.72*math.cos(angle), 0))
        for row, center in enumerate(centerline):
            t = row/12
            width = 0.050+0.055*math.sin(t*math.pi)
            for col in range(7):
                u = col/6*2-1
                point = center+across*(u*width)
                point.y += 0.018*math.cos(u*math.pi*2+0.4)*math.sin(t*math.pi)
                point.z += 0.055*abs(u)**1.4*t**4
                vertices.append(tuple(point))
        for row in range(12):
            for col in range(6):
                i = row*7+col
                faces.append((i, i+1, i+8, i+7))
        mesh('FoldedTrain'+str(panel), vertices, faces, (0.76, 0.74, 0.86, 1) if panel%2 else 'white', 1, 'pelvis')
        for col in [0, 6]:
            tube('TrainBorder'+str(panel)+str(col), [vertices[r*7+col] for r in range(13)], [0.0018, 0.0018], 'gold', 2, 'pelvis', 6, 3)
    ornament('SolarBrooch', (0, -0.105, 1.30), (0.028, 0.050), 'chest')
    ornament('WaistBrooch', (0, -0.083, 1.07), (0.026, 0.054), 'spine')
    ornament('SkirtBrooch', (0, -0.17, 0.86), (0.021, 0.040), 'pelvis')
    for sign, side in [(1, 'L'), (-1, 'R')]:
        for band in range(3):
            z = 1.12+band*0.062
            tube('CorsetScroll'+str(band)+side, [(0, -0.100, z-0.035), (sign*0.055, -0.097, z-0.01), (sign*(0.095+band*0.015), -0.073, z+0.025)], [0.0025, 0.003, 0.0015], 'goldLight', 2, 'chest' if band else 'spine', 10, 3)
        for leaf in range(5):
            x, z = sign*(0.024+leaf*0.018), 1.79-leaf*0.009
            jewel('Laurel'+str(leaf)+side, (x, -0.083+leaf*0.007, z), (0.007, 0.017), 'head', 'goldLight')
        vertices = [(sign*0.025, -0.099, 1.28), (sign*0.11, -0.077, 1.30), (sign*0.081, -0.089, 1.17), (sign*0.025, -0.080, 1.10)]
        mesh('CorsetInlay'+side, vertices, [(0, 1, 2, 3)], (0.10, 0.07, 0.22, 1), 1, 'chest')
        for band in range(3):
            z = 0.90-band*0.055
            tube('SkirtSwag'+side+str(band), [(0, -0.177, z), (sign*0.085, -0.177, z-0.025), (sign*0.17, -0.12, z+0.055)], [0.0015, 0.002, 0.0015], 'goldLight', 2, 'pelvis', 8, 3)
        tube('DiagonalSash'+side, [(sign*0.15, -0.060, 1.38), (sign*0.065, -0.106, 1.27), (-sign*0.05, -0.091, 1.14), (-sign*0.118, -0.068, 1.04)], [0.005, 0.007, 0.006, 0.003], 'goldLight', 2, ['chest', 'spine'], 12, 3)
    tube('Belt', [(0.145*math.cos(a/32*math.tau), 0.093*math.sin(a/32*math.tau), 1.015) for a in range(33)], [0.004, 0.004], 'goldLight', 2, 'pelvis', 32, 4)
    # A recurve bow, held alongside the right hand, remains easy to inspect.
    bow_points = [(-0.49, -0.10, 0.62), (-0.57, -0.10, 0.73), (-0.53, -0.10, 0.87), (-0.48, -0.10, 1.0), (-0.54, -0.10, 1.14), (-0.57, -0.10, 1.27), (-0.49, -0.10, 1.38)]
    tube('GoldRecurveBow', bow_points, [0.006, 0.012, 0.010, 0.015, 0.010, 0.012, 0.006], 'gold', 2, 'hand.R', 30, 6)
    tube('BowGrip', [(-0.48, -0.10, 0.965), (-0.48, -0.10, 1.035)], [0.018, 0.018], 'pink', 0, 'hand.R', 4, 8)
    tube('Bowstring', [bow_points[0], (-0.442, -0.10, 1.0), bow_points[-1]], [0.0008, 0.0008], 'white', 1, 'hand.R', 12, 4)
    # Bring the bow grip into the palm without moving the hand or its rig.
    for part in parts:
        if part.name.startswith(('GoldRecurveBow', 'BowGrip', 'Bowstring')):
            for vertex in part.data.vertices:
                vertex.co.x += 0.035
        if not part.name.startswith(('Feather', 'WingCoverlet')):
            head_groups = {g.index for g in part.vertex_groups if g.name in {'head', 'jaw', 'eye.L', 'eye.R', 'brow.L', 'brow.R'}}
            for vertex in part.data.vertices:
                if any(g.group in head_groups and g.weight > 0 for g in vertex.groups):
                    vertex.co.x *= 1.00
                    vertex.co.y *= 0.94
                    vertex.co.z = 1.480+(vertex.co.z-1.535)*0.98
                elif 'Hair' in part.name:
                    vertex.co.z -= 0.055*max(0, min(1, (vertex.co.z-1.35)/0.30))
    return parts
