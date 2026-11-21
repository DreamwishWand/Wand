import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("source_scan.py")


class SourceScanTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        base = Path(self.workspace.name)
        self.root = base / "game"
        self.out = base / "output"
        self.root.mkdir()

    def run_scan(self, *additional):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root), "--out", str(self.out), *additional],
            capture_output=True, text=True, check=False,
        )

    def read(self, name):
        return json.loads((self.out / name).read_text(encoding="utf-8"))

    def test_steam_incremental_and_diff(self):
        (self.root / "GameAssembly.dll").write_bytes(b"gameassembly")
        data = self.root / "Dreamlight_Data" / "il2cpp_data" / "Metadata"
        data.mkdir(parents=True)
        (data / "global-metadata.dat").write_bytes(b"metadata")
        result = self.run_scan("--platform", "steam", "--version", "1.26.1")
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = self.read("source-manifest.json")
        report = self.read("source-report.json")
        self.assertEqual(manifest["platform"]["value"], "steam")
        self.assertEqual(manifest["game_version"]["status"], "user_provided")
        self.assertEqual(manifest["platform"]["status"], "user_provided")
        self.assertTrue(report["ready_for_downstream"])
        self.assertIsInstance(manifest["files"][0]["mtime_ns"], str)
        self.assertEqual(report["file_count"], 2)
        self.assertEqual(report["hashed_now"], 2)
        records = {item["path"]: item for item in manifest["files"]}
        self.assertEqual(records["GameAssembly.dll"]["sha256"], hashlib.sha256(b"gameassembly").hexdigest())
        self.assertNotIn(str(self.root), json.dumps(manifest))

        second = self.run_scan("--platform", "steam", "--version", "1.26.1")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(self.read("source-report.json")["reused_hashes"], 2)

        (self.root / "GameAssembly.dll").write_bytes(b"changed content")
        third = self.run_scan("--platform", "steam", "--version", "1.26.1")
        self.assertEqual(third.returncode, 0, third.stderr)
        diff = self.read("source-diff.json")
        self.assertEqual(diff["modified"]["count"], 1)
        self.assertEqual(diff["unchanged_count"], 1)

    def test_game_version_from_fullversion_and_cache(self):
        (self.root / "GameAssembly.dll").write_bytes(b"assembly")
        (self.root / "steam_api64.dll").write_bytes(b"steam")
        (self.root / "FullVersion.txt").write_text("1.26.1+abcdef\n", encoding="utf-8")
        streaming = self.root / "ddv_Data" / "StreamingAssets"
        streaming.mkdir(parents=True)
        (streaming / "FullVersion.txt").write_text("1.26.1+abcdef\n", encoding="utf-8")
        result = self.run_scan()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = self.read("source-report.json")
        self.assertEqual(report["game_version"]["status"], "verified_from_file")
        self.assertEqual(report["game_version"]["value"], "1.26.1")
        self.assertEqual(len(report["game_version"]["evidence"]), 2)
        self.assertTrue(report["ready_for_downstream"])
        again = self.run_scan()
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(self.read("source-report.json")["reused_hashes"], 4)

    def test_disagreeing_fullversion_marks_incomplete(self):
        (self.root / "GameAssembly.dll").write_bytes(b"assembly")
        (self.root / "steam_api64.dll").write_bytes(b"steam")
        (self.root / "FullVersion.txt").write_text("1.26.1\n", encoding="utf-8")
        streaming = self.root / "ddv_Data" / "StreamingAssets"
        streaming.mkdir(parents=True)
        (streaming / "FullVersion.txt").write_text("1.25.3\n", encoding="utf-8")
        result = self.run_scan()
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.read("source-report.json")["ready_for_downstream"])
        self.assertEqual(self.read("source-report.json")["game_version"]["status"], "conflict")

    def test_explicit_version_conflict(self):
        (self.root / "GameAssembly.dll").write_bytes(b"assembly")
        (self.root / "steam_api64.dll").write_bytes(b"steam")
        (self.root / "FullVersion.txt").write_text("1.26.1\n", encoding="utf-8")
        result = self.run_scan("--version", "1.25.3")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.read("source-report.json")["game_version"]["status"], "conflict")

    def test_switch_nso_id(self):
        exefs = self.root / "exefs"
        exefs.mkdir()
        header = bytearray(0x60)
        header[:4] = b"NSO0"
        header[0x40:0x60] = bytes(range(32))
        (exefs / "main").write_bytes(header)
        result = self.run_scan()
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = self.read("source-manifest.json")
        self.assertEqual(manifest["platform"]["value"], "switch")
        self.assertEqual(manifest["build_id"]["status"], "verified")
        self.assertEqual(manifest["build_id"]["value"], bytes(range(32)).hex().upper())
        self.assertEqual(manifest["build_id"]["evidence"][0]["short_id"], bytes(range(8)).hex().upper())

    def test_mixed_platform_does_not_publish_manifest(self):
        (self.root / "GameAssembly.dll").write_bytes(b"exe")
        exefs = self.root / "exefs"
        exefs.mkdir()
        (exefs / "main").write_bytes(b"fake")
        result = self.run_scan()
        self.assertEqual(result.returncode, 2)
        self.assertFalse((self.out / "source-manifest.json").exists())
        self.assertFalse(self.read("source-report.json")["ready_for_downstream"])

    def test_output_cannot_be_inside_game(self):
        (self.root / "a.bin").write_bytes(b"untouched")
        target = self.root / "results"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root), "--out", str(target)],
            capture_output=True, text=True, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(target.exists())
        self.assertEqual((self.root / "a.bin").read_bytes(), b"untouched")

    def test_checkpoint_hash_reuse(self):
        (self.root / "UnityPlayer.dll").write_bytes(b"engine")
        first = self.run_scan()
        self.assertEqual(first.returncode, 0, first.stderr)
        original = self.read("source-manifest.json")
        self.out.joinpath("source-manifest.json").unlink()
        checkpoint = {
            "schema_version": 1,
            "root_key": original["root_key"],
            "status": "incomplete",
            "files": original["files"],
        }
        self.out.joinpath("source-checkpoint.json").write_text(json.dumps(checkpoint), encoding="utf-8")
        resumed = self.run_scan()
        self.assertEqual(resumed.returncode, 0, resumed.stderr)
        self.assertEqual(self.read("source-report.json")["reused_hashes"], 1)
        self.assertFalse(self.out.joinpath("source-checkpoint.json").exists())

    def test_refuses_reusing_output_for_other_root(self):
        (self.root / "UnityPlayer.dll").write_bytes(b"engine")
        self.assertEqual(self.run_scan().returncode, 0)
        another = Path(self.workspace.name) / "different"
        another.mkdir()
        (another / "UnityPlayer.dll").write_bytes(b"other")
        attempted = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(another), "--out", str(self.out)],
            capture_output=True, text=True, check=False,
        )
        self.assertNotEqual(attempted.returncode, 0)
        self.assertEqual(self.read("source-manifest.json")["files"][0]["sha256"], hashlib.sha256(b"engine").hexdigest())


if __name__ == "__main__":
    unittest.main()
