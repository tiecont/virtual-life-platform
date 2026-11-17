"""Verify candidate bytes and GLB facts; never certify artistic acceptance."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

from PIL import Image


def digest(path):
    checksum = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


def checked_file(root, entry):
    path = (root / entry['path']).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('Missing or escaping design file')
    if digest(path) != entry['sha256']:
        raise ValueError('Design hash mismatch')
    with Image.open(path) as image:
        if list(image.size) != entry['dimensions']:
            raise ValueError('Design dimensions mismatch')
        image.verify()
    if entry['origin'] != 'AI_GENERATED_SUPPLEMENT':
        raise ValueError('Generated image cannot become owner reference')
    if entry['status'] != 'DESIGN_REVIEW_NOT_APPROVED':
        raise ValueError('This candidate record does not confer approval')


def glb_facts(path):
    with path.open('rb') as stream:
        magic, version, length = struct.unpack('<4sII', stream.read(12))
        if (magic, version, length) != (b'glTF', 2, path.stat().st_size):
            raise ValueError('Invalid GLB header')
        size, kind = struct.unpack('<I4s', stream.read(8))
        if kind != b'JSON' or size > 16 * 1024 * 1024:
            raise ValueError('Invalid GLB JSON chunk')
        data = json.loads(stream.read(size))
    triangles = 0
    for mesh in data.get('meshes', []):
        for primitive in mesh['primitives']:
            if primitive.get('mode', 4) != 4:
                raise ValueError('Only triangle primitives can be measured here')
            accessor = primitive.get('indices', primitive['attributes']['POSITION'])
            count = data['accessors'][accessor]['count']
            if count % 3:
                raise ValueError('Incomplete triangle primitive')
            triangles += count // 3
    return {'triangles': triangles, 'materials': len(data.get('materials', [])),
            'rigged': bool(data.get('skins', []))}


def verify(root, manifest, require_models=False):
    data = json.loads(manifest.read_text())
    if data['productionReady'] is not False or data['runtimeEnabled'] is not False:
        raise ValueError('Candidate cannot enable runtime or production')
    if data['state'] != 'ART_REVISION_REQUIRED':
        raise ValueError('Unresolved candidate requires art revision')
    followup = data['continuityFollowup']
    if any(followup[key] is not False for key in
           ('ownerApproved', 'productionReady', 'uploadEligible')):
        raise ValueError('Open continuity review cannot authorize delivery')
    handoff = followup.get('offlineHandoff')
    if handoff is not None and (handoff.get('state') != 'ARTIST_HANDOFF_REQUIRED'
                               or handoff.get('productionReady') is not False
                               or handoff.get('geometryEdited') is not False):
        raise ValueError('Inspection handoff cannot claim production or geometry repair')
    images = data['designImages'] + data['continuityFollowup']['images']
    if len({entry['path'] for entry in images}) != len(images):
        raise ValueError('Duplicate image path')
    for entry in images:
        checked_file(root, entry)
    checked_models = 0
    for entry in data['candidateModels']:
        path = Path(entry['localPath'])
        if not path.is_file():
            if require_models:
                raise ValueError('Required local model missing')
            continue
        if digest(path) != entry['sha256']:
            raise ValueError('Model hash mismatch')
        facts = glb_facts(path)
        if any(facts[key] != entry[key] for key in facts):
            raise ValueError('Model metadata disagrees with actual GLB')
        checked_models += 1
    return {'imagesVerified': len(images), 'modelsVerified': checked_models,
            'modelsMissing': len(data['candidateModels']) - checked_models,
            'artAcceptance': 'ART_REVISION_REQUIRED', 'productionReady': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--require-models', action='store_true')
    args = parser.parse_args()
    manifest = args.root / 'specs/pet-arena/references/icarus/production-v4-pbr.json'
    print(json.dumps(verify(args.root, manifest, args.require_models)))
