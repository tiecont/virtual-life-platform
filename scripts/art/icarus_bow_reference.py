"""Extract canonical V3 bow reference without generated interpretation."""
import hashlib
import json
from pathlib import Path

from PIL import Image

root = Path('artifacts/character-production/icarus')
source = root / 'references/owner-review-v3/references/selected_design_01.png'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '6bb497272dde6d6fa74a1eb4fccf88a60ae147ed529bd894f23e86441623c7fc'
path = root / 'references/phoenix-bow-native.png'
assert not path.exists()
box = (1080, 584, 1301, 900)
Image.open(source).crop(box).save(path)
(root / 'provenance/bow-01-request.json').write_text(json.dumps({
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'inputSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'cropBox': box,
    'origin': 'Native crop from approved V3 sheet; luminous effects still present',
    'objective': 'Separate canonical Phoenix bow silhouette and ruby/gold ornament draft',
    'estimatedCredits': 15, 'ai_model': 'meshy-t2.5', 'texture_model': 'meshy-n1',
    'target_polycount': 3500, 'target_formats': ['glb', 'fbx'],
    'qualityGate': 'ART_REVISION_REQUIRED until geometry/string/VFX separation reviewed'
}, indent=2) + '\n')
print(str(path.resolve()))
