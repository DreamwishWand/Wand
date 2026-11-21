import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("src01_probe", Path(__file__).with_name("probe_formats.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class TestProbe(unittest.TestCase):
    def test_varint_roundtrip(self):
        for number in (0, 1, 127, 128, 255, 16384, 2**32):
            output, end = mod.read_varint(mod.write_varint(number), 0)
            self.assertEqual((number, len(mod.write_varint(number))), (output, end))

    def test_reject_bad_varint(self):
        with self.assertRaises(ValueError):
            mod.read_varint(b"\x80\x00", 0)

    def test_wire_profile(self):
        payload = b"\x08\x05\x12\x03abc"
        result = mod.probe_frame_fields(payload)
        self.assertEqual(result["status"], "wire_profile_only")
        self.assertEqual([v["field"] for v in result["fields"]], [1, 2])
        self.assertEqual(result["bytesTraversed"], len(payload))

    def test_unsupported_wire(self):
        result = mod.probe_frame_fields(b"\x0b")
        self.assertEqual(result["status"], "unrecognized_wire_structure")

    def test_zip_member_inspection(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "game"
            target = root / "ddv_Data" / "StreamingAssets" / "Localization"
            target.mkdir(parents=True)
            with zipfile.ZipFile(target / "LocDB_en-US.zip", "w") as archive:
                archive.writestr("ActivityItem.locbin", b"\x08\x01" * 20)
            result = mod.inspect_localizations(root, 12)
            self.assertEqual(result["en"]["members"]["ActivityItem"]["status"], "structure_sample_only")
            self.assertEqual(result["en"]["members"]["ActivityItem"]["bytes"], 40)
            self.assertEqual(result["fr"]["status"], "missing_archive")


if __name__ == "__main__":
    unittest.main()
