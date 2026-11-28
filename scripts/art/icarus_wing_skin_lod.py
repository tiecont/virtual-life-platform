"""Consolidate the approved 104 feather partitions into one skinned GLB primitive.

Copy the lightweight master's actual vertex, normal and UV data. The original
part names become separately poseable joints. Neutral rest, atlas and topology
remain exact, and the center ornament provides the physical mount position.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct

import numpy as np

SOURCE = "1e88fb2754f5885a2f51f90ecc530a3dbb2be32f672056bdc3497ca1704fd1b6"
ATLAS = "8f01e0ca253c045543454c0382f6768a4e102321b4f4d469790e97b6ecbcff1f"


def build(path, output):
    raw = path.read_bytes()
    if sha256(raw).hexdigest() != SOURCE:
        raise ValueError("Expected the verified 17,782-triangle color LOD")
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+length])
    data = raw[28+length:]
    old_views, old_access = doc['bufferViews'], doc['accessors']
    def contents(i):
        v = old_views[i]
        start = v.get('byteOffset', 0)
        return data[start:start+v['byteLength']]
    def read(i, width):
        a = old_access[i]
        if a.get('byteOffset', 0) or 'byteStride' in old_views[a['bufferView']]:
            raise ValueError("Unexpected interleaving in the pinned LOD")
        kind = {5126: '<f4', 5123: '<u2', 5125: '<u4'}[a['componentType']]
        return np.frombuffer(contents(a['bufferView']), kind).reshape(a['count'], width)
    atlas = contents(doc['images'][0]['bufferView'])
    if sha256(atlas).hexdigest() != ATLAS:
        raise ValueError("Color texture does not match the approved atlas")
    attrs = {'POSITION': [], 'NORMAL': [], 'TEXCOORD_0': [], 'JOINTS_0': [], 'WEIGHTS_0': []}
    faces, parts, pivots, base, offset = [], [], [], 0, 0
    for i, node in enumerate(doc['nodes']):
        if set(node) != {'name', 'mesh'}:
            raise ValueError("Expected an untransformed feather node")
        primitive, = doc['meshes'][node['mesh']]['primitives']
        for key, width in [('POSITION',3), ('NORMAL',3), ('TEXCOORD_0',2)]:
            attrs[key].append(read(primitive['attributes'][key], width))
        points = attrs['POSITION'][-1]
        index = read(primitive['indices'], 1).ravel().astype(np.uint32)
        faces.append(index+base)
        parts.append({'name':node['name'], 'indexOffset':offset, 'indexCount':len(index)})
        offset += len(index)
        base += len(points)
        joints = np.zeros((len(points), 4), np.uint8)
        joints[:,0] = i
        weights = np.zeros((len(points), 4), np.float32)
        weights[:,0] = 1
        attrs['JOINTS_0'].append(joints)
        attrs['WEIGHTS_0'].append(weights)
        # Put each neutral joint at its inboard end, with the center jewel
        # pivoting at its own midpoint. Axes follow the imported mesh space.
        lo, hi = points.min(axis=0), points.max(axis=0)
        center = (lo + hi) / 2
        if node['name'] != 'tripo_part_56':
            ends = np.abs(points[:, 0])
            center = points[ends <= ends.min() + .15*(ends.max()-ends.min())].mean(axis=0)
        pivots.append(center)
    assert len(parts) == 104 and offset == 17782 * 3
    blob = bytearray()
    doc['bufferViews'], doc['accessors'] = [], []
    def view(binary, target=None):
        blob.extend(bytes(-len(blob) % 4))
        v = {'buffer':0, 'byteOffset':len(blob), 'byteLength':len(binary)}
        if target is not None:
            v['target'] = target
        doc['bufferViews'].append(v)
        blob.extend(binary)
        return len(doc['bufferViews'])-1
    def store(values, typename, component, target=None, bounds=False):
        a = {'bufferView':view(values.tobytes(), target), 'type':typename, 'componentType':component, 'count':len(values)}
        if bounds:
            a.update(min=values.min(axis=0).tolist(), max=values.max(axis=0).tolist())
        doc['accessors'].append(a)
        return len(doc['accessors'])-1
    combined = {}
    for k, chunks in attrs.items():
        a = np.concatenate(chunks)
        combined[k] = store(a, 'VEC'+str(a.shape[1]), 5121 if k=='JOINTS_0' else 5126, 34962, k=='POSITION')
    indices = store(np.concatenate(faces).astype('<u4'), 'SCALAR', 5125, 34963)
    inverse = np.tile(np.eye(4, dtype='<f4'), (len(pivots),1,1))
    inverse[:, 3, :3] = -np.array(pivots)  # glTF matrices are column-major
    binds = store(inverse, 'MAT4', 5126)
    doc['images'][0]['bufferView'] = view(atlas)
    doc['meshes'] = [{'name':'Reviewed feathers', 'primitives':[{'attributes':combined,'indices':indices,'material':0}]}]
    doc['nodes'] = [{'name':p['name'], 'translation':loc.tolist()} for p,loc in zip(parts,pivots)]
    root, surface = len(parts), len(parts)+1
    doc['nodes'].extend([{'name':'WingRoot','children':list(range(root))}, {'name':'WingSurface','mesh':0,'skin':0}])
    doc['skins'] = [{'name':'Individual feather joints','skeleton':root,'joints':list(range(root)),'inverseBindMatrices':binds}]
    doc['scenes'] = [{'nodes':[root, surface]}]
    doc['scene'] = 0
    doc['buffers'] = [{'byteLength':len(blob)}]
    meta = json.dumps(doc, separators=(',',':')).encode()
    meta += b' '*(-len(meta)%4)
    blob.extend(bytes(-len(blob)%4))
    binary = (struct.pack('<4sIIII', b'glTF',2,28+len(meta)+len(blob),len(meta),0x4e4f534a) +
              meta + struct.pack('<II',len(blob),0x004e4942) + blob)
    output.mkdir(parents=True, exist_ok=False)
    (output/'IcarusWing.glb').write_bytes(binary)
    (output/'wing-skin.json').write_text(json.dumps({'sourceSha256':SOURCE,'outputSha256':sha256(binary).hexdigest(),
        'atlasSha256':ATLAS,'primitiveCount':1,'triangles':offset//3,'rigParts':parts,
        'mount':'tripo_part_56','scope':'Private neutral fitting; flight and skill motion require review.'},indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    build(args.source, args.output)
