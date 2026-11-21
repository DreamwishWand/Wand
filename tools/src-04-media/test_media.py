import gzip
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

SCRIPT = Path(__file__).with_name("media.py")


class MediaPipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.output = self.root / "output"
        self.source.mkdir()

    def run_tool(self, *args):
        command = [sys.executable, str(SCRIPT), *map(str, args)]
        result = subprocess.run(command, text=True, capture_output=True)
        if result.returncode:
            self.fail(f"Command failed: {' '.join(command)}\n{result.stdout}\n{result.stderr}")
        return result

    def create_image(self, name, size, color=(50, 180, 240, 140)):
        path = self.source / name
        Image.new("RGBA", size, color).save(path)
        return path

    def scan(self, *extra):
        self.run_tool("scan", "--input", self.source, "--output", self.output,
                      "--platform", "Steam Windows", "--game-version", "1.26.1", *extra)

    def build(self, *extra):
        self.run_tool("build", "--input", self.source, "--output", self.output, *extra)

    def merge(self, *extra):
        self.run_tool("merge", "--output", self.output, *extra)
        return json.loads((self.output / "manifest.json").read_text(encoding="utf-8"))

    def test_original_resolution_caps_and_resume(self):
        small = self.create_image("small.png", (96, 80))
        large = self.create_image("large.png", (1024, 768))
        self.scan()
        self.build("--include-unmapped", "--keep-originals")
        manifest = self.merge()
        self.assertEqual(len(manifest["images"]), 2)
        self.assertTrue(manifest["complete"])
        records = {record["sourcePath"]: record for record in manifest["images"]}
        self.assertEqual(records["small.png"]["sourceSha256"],
                         hashlib.sha256(small.read_bytes()).hexdigest())
        for name, width, height, detail_width, detail_height in [
            ("small.png", 96, 80, 96, 80),
            ("large.png", 128, 96, 512, 384)
        ]:
            record = records[name]
            for variant, expected in [
                ("thumbnail", (width, height)), ("detail", (detail_width, detail_height))
            ]:
                target = self.output / record["variants"][variant]["path"]
                with Image.open(target) as picture:
                    self.assertEqual(picture.size, expected)
                self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(),
                                 record["variants"][variant]["sha256"])
        original = self.output / records["large.png"]["variants"]["original"]["path"]
        with Image.open(original) as picture:
            self.assertEqual(picture.size, (1024, 768))
        self.assertNotIn("original", records["small.png"]["variants"])
        thumbnail = self.output / records["large.png"]["variants"]["thumbnail"]["path"]
        last_modification = thumbnail.stat().st_mtime_ns
        self.build("--include-unmapped", "--keep-originals", "--verify-existing")
        self.assertEqual(thumbnail.stat().st_mtime_ns, last_modification)

    def test_exact_r39_hash_only_and_catalog_missing(self):
        source = self.create_image("matched.png", (300, 300))
        r39 = self.root / "r39"
        r39.mkdir()
        index = {
            "gameVersion": "1.24.13",
            "items": [
                {"itemID": 12345, "icon": {"sha256": hashlib.sha256(source.read_bytes()).hexdigest()}},
                {"itemID": 67890, "icon": {"sha256": "a" * 64}}
            ]
        }
        (r39 / "query-index.part00").write_bytes(gzip.compress(json.dumps(index).encode("utf-8")))
        self.scan()
        self.build("--r39-index", r39)
        catalog = self.root / "catalog.csv"
        catalog.write_text("item_id\n12345\n67890\n", encoding="utf-8")
        manifest = self.merge("--catalog", catalog)
        self.assertIn("12345", manifest["items"])
        self.assertNotIn("67890", manifest["items"])
        record = manifest["items"]["12345"]
        self.assertTrue(record["links"][0]["evidenceVerified"])
        report = json.loads((self.output / "report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["missingItemIds"], ["67890"])
        self.assertFalse(report["publicationApproved"])

    def test_mapping_conflict_is_not_published_as_certain(self):
        first = self.create_image("one.png", (200, 200))
        second = self.create_image("two.png", (240, 240))
        mapping = self.root / "mapping.csv"
        mapping.write_text(
            "item_id,source_sha256,evidence\n"
            f"123,{hashlib.sha256(first.read_bytes()).hexdigest()},game-reference-1\n"
            f"123,{hashlib.sha256(second.read_bytes()).hexdigest()},game-reference-2\n",
            encoding="utf-8")
        self.scan()
        self.build("--mapping", mapping)
        merged = self.merge()
        self.assertNotIn("123", merged["items"])
        self.assertIn("123", merged["ambiguousItemIds"])
        self.assertFalse(merged["publicationApproved"])

    def test_corrupt_images_and_partial_scans_are_explicit(self):
        (self.source / "broken.png").write_bytes(b"not-a-png")
        self.create_image("valid.png", (16, 16))
        self.scan()
        self.build("--include-unmapped")
        self.merge()
        report = json.loads((self.output / "report.json").read_text(encoding="utf-8"))
        types = {problem["type"] for problem in report["problems"]}
        self.assertIn("corrupt", types)
        self.assertIn("unmapped_image", types)
        self.assertIn("under_128px", types)
        self.assertIn("under_512px", types)
        self.scan("--limit", "1")
        self.build("--include-unmapped")
        partial = self.merge()
        self.assertFalse(partial["complete"])

    def test_source_changes_require_rescan(self):
        path = self.create_image("item.png", (200, 200))
        self.scan()
        Image.new("RGBA", (400, 400), (255, 0, 0, 255)).save(path)
        self.build("--include-unmapped")
        self.merge()
        report = json.loads((self.output / "report.json").read_text(encoding="utf-8"))
        self.assertIn("missing_or_changed_source",
                      {problem["type"] for problem in report["problems"]})


if __name__ == "__main__":
    unittest.main()
