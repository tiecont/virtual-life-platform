"""Self-contained smoke tests; don't run Blender or Unity."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

HOME = Path(__file__).resolve().parents[2] / ".agents/skills/aetheria-character-production"


def mod(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


preflight = mod(HOME / "scripts/preflight.py", "preflight")
receipts = mod(HOME / "scripts/validate_receipts.py", "receipts")


class SkillChecks(unittest.TestCase):
    def test_missing_files_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            result = preflight.inspect(Path(temp), "icarus")
            self.assertEqual(result["status"], "BLOCKED")
            self.assertIn("Missing regular PNG", "\n".join(result["errors"]))

    def test_icarus_example_requires_review(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            example = json.loads((HOME / "assets/07_spec.icarus.example.json").read_text())
            for name, (w, h) in preflight.PNG_RULES.items():
                Image.new("RGB", (w, h), (255, 255, 255)).save(root / name)
            (root / "07_spec.json").write_text(json.dumps(example))
            result = preflight.inspect(root, "icarus")
            self.assertEqual(result["status"], "BLOCKED")
            self.assertTrue(any("palette" in e.lower() for e in result["errors"]))
            example.update({"referenceHashes": {n: preflight.hash_file(root / n) for n in preflight.PNG_RULES},
                            "designRevision": "owner-approved-r1", "paletteReviewStatus": "OWNER_APPROVED",
                            "designApprovalReference": "Owner message approved r1 exact SHA list"})
            (root / "07_spec.json").write_text(json.dumps(example))
            good = preflight.inspect(root, "icarus")
            self.assertEqual(good["status"], "STRUCTURAL_PREFLIGHT_PASS_NOT_ART_APPROVAL")

    def test_receipt_hard_stop(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "H1").mkdir()
            (root / "H1/face.png").write_bytes(b"actual-fixture-bytes")
            data = json.loads((HOME / "assets/gate-receipt.template.json").read_text())
            data["artifactHashes"] = {"face.png": receipts.hash_file(root / "H1/face.png")}
            (root / "H1/receipt.json").write_text(json.dumps(data))
            self.assertEqual(receipts.inspect(root)["status"], "NOT_FULLY_APPROVED")
            self.assertEqual(receipts.inspect(root)["gates"][0]["status"], "PENDING_OWNER_REVIEW")

    def test_approved_chain_requires_previous_hash(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            previous = None
            for gate in receipts.GATES:
                folder = root / gate
                folder.mkdir()
                hashes = {}
                for name in receipts.REQUIRED_FILES[gate].split():
                    artifact = folder / name
                    artifact.write_text(f"schema fixture {gate} {name}")
                    hashes[name] = receipts.hash_file(artifact)
                data = json.loads((HOME / "assets/gate-receipt.template.json").read_text())
                data.update({"gate": gate, "status": "OWNER_APPROVED", "sourceRevision": "a"*40,
                             "ownerApprovalRef": f"fixture-approval-{gate}",
                             "ownerApprovedAt": "2026-11-18T12:00:00+07:00",
                             "commands": ["fixture-only"],
                             "artifactHashes": hashes,
                             "previousGateReceiptSha256": previous})
                receipt_path = folder / "receipt.json"
                receipt_path.write_text(json.dumps(data))
                previous = receipts.hash_file(receipt_path)
            self.assertEqual(receipts.inspect(root)["status"], "SCHEMA_AND_HASH_PASS_NOT_AUTHENTICATED")
            (root / "H2" / "front.png").write_text("changed")
            self.assertEqual(receipts.inspect(root)["status"], "NOT_FULLY_APPROVED")

    def test_missing_middle_gate_blocks_next_approval(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for gate in ("H1", "H3"):
                folder = root / gate
                folder.mkdir()
                (folder / "evidence.txt").write_text("fixtures")
                data = json.loads((HOME / "assets/gate-receipt.template.json").read_text())
                data.update({"gate": gate, "status": "OWNER_APPROVED", "sourceRevision": "a"*40,
                             "ownerApprovalRef": "fixture", "ownerApprovedAt": "date",
                             "commands": ["fixture"],
                             "artifactHashes": {"evidence.txt": receipts.hash_file(folder / "evidence.txt")}})
                (folder / "receipt.json").write_text(json.dumps(data))
            result = receipts.inspect(root)
            self.assertEqual(result["status"], "NOT_FULLY_APPROVED")
            self.assertTrue(any("Previous gate" in err for err in result["errors"]))


if __name__ == "__main__":
    unittest.main()
