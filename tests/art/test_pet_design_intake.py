"""Synthetic references test integrity gates, never artistic acceptance."""

import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("pet_design_intake", REPO / "scripts/art/pet_design_intake.py")
INTAKE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INTAKE)


class DesignIntakeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / "reference.png"
        image = Image.new("RGB", (20, 16))
        image.putdata([(x * 10, y * 12, (x + y) * 5) for y in range(16) for x in range(20)])
        image.save(self.source)
        self.design = json.loads((REPO / "specs/pet-arena/references/icarus/design-intake-v2.json").read_text())
        self.design["source"].update(path=str(self.source), dimensions=[20, 16],
                                     sha256=hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.design["crops"] = [dict(c, box=[i % 10, i % 8, i % 10 + 5, i % 8 + 5])
                                for i, c in enumerate(self.design["crops"])]
        self.manifest = self.root / "input.json"

    def build(self, design=None):
        self.manifest.write_text(json.dumps(design or self.design))
        return INTAKE.build(self.manifest, self.root / "output")

    def test_original_bytes_and_all_crop_pixels_survive_and_rebuild_is_idempotent(self):
        result = self.build()
        package = Path(result["package"])
        self.assertEqual((package / "concept/source.png").read_bytes(), self.source.read_bytes())
        self.assertEqual(result["cropsVerified"], 16)
        self.assertEqual(result["ownerApproval"], "MISSING")
        self.assertEqual(result["paidJobsAllowed"], 0)
        self.assertFalse(result["productionReady"])
        self.assertEqual(self.build(), result)

    def test_changed_source_is_rejected_before_package_writes(self):
        self.source.write_bytes(b"changed source")
        with self.assertRaisesRegex(ValueError, "Source hash mismatch"):
            self.build()
        self.assertFalse((self.root / "output").exists())

    def test_changed_design_cannot_overwrite_existing_revision(self):
        result = self.build()
        changed = copy.deepcopy(self.design)
        changed["appearance"]["hair"] = "changed interpretation"
        with self.assertRaisesRegex(ValueError, "Immutable design differs"):
            self.build(changed)
        self.assertEqual(INTAKE.verify(result["package"]), result)

    def test_tampered_crop_source_and_index_are_rejected(self):
        result = self.build()
        root = Path(result["package"])
        for relative in ("turnaround/front.png", "concept/source.png", "provenance/manifest.json"):
            path = root / relative
            original = path.read_bytes()
            path.write_bytes(original + b"tampered")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                INTAKE.verify(root)
            path.write_bytes(original)

    def test_invalid_crop_and_escaped_ids_are_rejected_before_writes(self):
        mutations = [("crop", [0, 0, 21, 16]), ("crop", [-1, 0, 10, 10]),
                     ("pet", "../escape"), ("folder", "../../escape"), ("duplicate", None)]
        for kind, value in mutations:
            with self.subTest(kind=kind, value=value):
                design = copy.deepcopy(self.design)
                if kind == "crop":
                    design["crops"][0]["box"] = value
                elif kind == "pet":
                    design["petId"] = value
                elif kind == "folder":
                    design["crops"][0]["folder"] = value
                else:
                    design["crops"][0]["id"] = design["crops"][1]["id"]
                with self.assertRaises(ValueError):
                    self.build(design)
                self.assertFalse((self.root / "output").exists())

    def test_intake_cannot_grant_owner_approval_or_spending(self):
        for field, value in (("allowedPaidJobs", 1), ("ownerDesignApproval", "inferred"),
                             ("creditAuthorization", {"credits": 5})):
            design = copy.deepcopy(self.design)
            design["generationGate"][field] = value
            with self.assertRaisesRegex(ValueError, "cannot authorize"):
                self.build(design)

    def test_generated_or_unspecified_authoritative_origin_is_rejected(self):
        for origin in ("AI_GENERATED", "OWNER_APPROVED_GENERATION", "", None):
            with self.subTest(origin=origin):
                design = copy.deepcopy(self.design)
                design["source"]["origin"] = origin
                with self.assertRaisesRegex(ValueError, "owner-supplied"):
                    self.build(design)
                self.assertFalse((self.root / "output").exists())

    def test_missing_or_untraceable_coverage_is_rejected(self):
        for kind in ("missing", "duplicate", "unknown-reference", "empty-references", "approved-status"):
            with self.subTest(kind=kind):
                design = copy.deepcopy(self.design)
                if kind == "missing":
                    design["coverage"].pop()
                elif kind == "duplicate":
                    design["coverage"].append(design["coverage"][0])
                elif kind == "unknown-reference":
                    design["coverage"][0]["references"] = ["invented-view"]
                elif kind == "empty-references":
                    design["coverage"][0]["references"] = []
                else:
                    design["coverage"][0]["status"] = "DESIGN_APPROVED"
                with self.assertRaisesRegex(ValueError, "[Cc]overage"):
                    self.build(design)
                self.assertFalse((self.root / "output").exists())

    def test_turnaround_ids_must_be_turnaround_assets(self):
        design = copy.deepcopy(self.design)
        design["crops"][1]["folder"] = "details"
        with self.assertRaisesRegex(ValueError, "Missing turnaround"):
            self.build(design)
        self.assertFalse((self.root / "output").exists())

    def test_symlinked_crop_is_rejected(self):
        result = self.build()
        path = Path(result["package"]) / "turnaround/front.png"
        path.unlink()
        path.symlink_to(self.source)
        with self.assertRaisesRegex(ValueError, "Symlinks|escapes"):
            INTAKE.verify(result["package"])


if __name__ == "__main__":
    unittest.main()
