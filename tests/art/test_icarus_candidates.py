"""Actual-file regression checks for the unaccepted Icarus candidate record."""
import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    'icarus_candidates', ROOT / 'scripts/art/verify_icarus_candidates.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CandidateIntegrityTests(unittest.TestCase):
    def test_repository_design_bytes(self):
        result = MODULE.verify(ROOT, ROOT / 'specs/pet-arena/references/icarus/production-v4-pbr.json')
        self.assertEqual(result['imagesVerified'], 10)
        self.assertFalse(result['productionReady'])

    def test_image_tamper_and_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / 'view.png'
            Image.new('RGB', (8, 12), 'pink').save(image)
            entry = dict(path='view.png', sha256=MODULE.digest(image), dimensions=[8, 12],
                         origin='AI_GENERATED_SUPPLEMENT', status='DESIGN_REVIEW_NOT_APPROVED')
            MODULE.checked_file(root, entry)
            with self.assertRaisesRegex(ValueError, 'dimensions'):
                MODULE.checked_file(root, {**entry, 'dimensions': [12, 8]})
            with self.assertRaisesRegex(ValueError, 'reference'):
                MODULE.checked_file(root, {**entry, 'origin': 'OWNER_SUPPLIED_REFERENCE'})
            with self.assertRaisesRegex(ValueError, 'escaping'):
                MODULE.checked_file(root, {**entry, 'path': '../view.png'})
            Image.new('RGB', (8, 12), 'black').save(image)
            with self.assertRaisesRegex(ValueError, 'hash'):
                MODULE.checked_file(root, entry)

    def test_glb_actual_triangle_and_skin_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'probe.glb'
            data = {'accessors': [{'count': 6}], 'meshes': [{'primitives': [
                {'attributes': {'POSITION': 0}, 'indices': 0}]}], 'materials': [{}], 'skins': [{}]}
            raw = json.dumps(data).encode()
            raw += b' ' * (-len(raw) % 4)
            path.write_bytes(struct.pack('<4sIII4s', b'glTF', 2, 20 + len(raw), len(raw), b'JSON') + raw)
            self.assertEqual(MODULE.glb_facts(path), dict(triangles=2, materials=1, rigged=True))
            path.write_bytes(path.read_bytes() + b'bad')
            with self.assertRaisesRegex(ValueError, 'header'):
                MODULE.glb_facts(path)

    def test_open_art_gate_cannot_be_promoted(self):
        source = ROOT / 'specs/pet-arena/references/icarus/production-v4-pbr.json'
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / 'manifest.json'
            for key in ['ownerApproved', 'productionReady', 'uploadEligible']:
                data = json.loads(source.read_text())
                data['continuityFollowup'][key] = True
                copy.write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError, 'authorize delivery'):
                    MODULE.verify(ROOT, copy)


if __name__ == '__main__':
    unittest.main()
