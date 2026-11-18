"""Preserve the V3 owner package and record the subsequent production authorization."""

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

SOURCE = Path('/home/tiecont/Downloads/Aetheria_Icarus_Design_Review_V3')
ROOT = Path('artifacts/character-production/icarus')
EXPECTED = '6bb497272dde6d6fa74a1eb4fccf88a60ae147ed529bd894f23e86441623c7fc'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def immutable_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, indent=2) + '\n').encode()
    if path.exists():
        raise ValueError(f'Record already exists: {path}')
    path.write_bytes(data)


def main():
    selected = SOURCE / 'references/selected_design_01.png'
    assert sha(selected) == EXPECTED, 'Selected source checksum mismatch'
    manifest = SOURCE / 'docs/FILES_SHA256.txt'
    entries = []
    for line in manifest.read_text().splitlines():
        checksum, relative = line.split(maxsplit=1)
        relative = relative.lstrip('*')
        path = SOURCE / relative
        assert path.resolve().is_relative_to(SOURCE.resolve())
        assert sha(path) == checksum, relative
        entries.append({'path': relative, 'sha256': checksum})
    destination = ROOT / 'references/owner-review-v3'
    assert not destination.exists(), 'Preserve existing production intake'
    shutil.copytree(SOURCE, destination)
    for folder in ('meshy', 'blender', 'exports', 'textures', 'unity', 'review', 'provenance', 'supplements'):
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    crop = ROOT / 'references/meshy-front-native.png'
    Image.open(selected).crop((537, 32, 767, 308)).save(crop)
    immutable_json(ROOT / 'provenance/owner-authorization-v3.json', {
        'schemaVersion': 1, 'petId': 'pet-v3-fire-icarus',
        'recordedAt': datetime.now(timezone.utc).isoformat(),
        'authority': 'Owner instruction in current Codex conversation',
        'decision': 'APPROVED_VISUAL_DIRECTION_AND_ICARUS_MESHY_DEVELOPMENT',
        'sourcePackage': str(SOURCE), 'sourceManifestSha256': sha(manifest),
        'selectedSourceSha256': EXPECTED, 'packageFiles': entries,
        'supersedes': 'Previous initial-design and 5-credit/per-job permission restrictions',
        'scope': ['Icarus V3 visual direction', 'reference upload to Meshy',
                  'available Meshy credits for justified iterations', 'Blender/Unity offline production'],
        'excluded': ['credit purchase', 'public release', 'other Pets', 'gameplay activation'],
        'sourceMetadataUnchanged': True, 'newSupplementApproval': False,
        'decisions': {'anatomy': 'Fully humanoid; no tail or paw feet', 'bodyHeightMeters': 1.68,
                      'wings': 'Upper-back attachment, foldable', 'weapon': 'Upgraded Phoenix Fire Bow'},
        'release': 'DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC',
    })
    immutable_json(ROOT / 'provenance/pilot-01-request.json', {
        'petId': 'pet-v3-fire-icarus', 'input': str(crop.resolve()), 'inputSha256': sha(crop),
        'inputOrigin': 'Exact native crop of approved selected_design_01.png',
        'cropBox': [537, 32, 767, 308], 'nativePixels': [230, 276],
        'interpretationCandidateExcluded': 'front_standalone_candidate_native_1024x1536.png',
        'estimatedCredits': 15, 'balanceBefore': 1044,
        'objective': 'Evaluate approved silhouette, humanoid anatomy, face, hair and wings in rig-friendly topology',
        'limitations': ['276px native detail', 'hidden geometry inferred by Meshy', 'not final art'],
        'settings': {'ai_model': 'meshy-t2.5', 'model_type': 'smart-topology',
                     'texture_model': 'meshy-n1', 'texture_resolution': '2k', 'should_texture': True,
                     'pose_mode': 't-pose', 'target_polycount': 14000, 'target_formats': ['glb', 'fbx'],
                     'image_enhancement': False, 'multi_view_thumbnails': True},
    })
    print(json.dumps({'manifestFilesVerified': len(entries), 'selectedSha256': EXPECTED,
                      'input': str(crop.resolve()), 'inputSha256': sha(crop)}, indent=2))


if __name__ == '__main__':
    main()
