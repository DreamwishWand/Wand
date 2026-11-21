import hashlib
import tempfile
import unittest
from pathlib import Path

import extend1262
import steam1262


def definition(key, base, name="Example"):
    def field(number, wire, data):
        tag = steam1262.encode_varint(number * 8 + wire)
        if wire == 0:
            return tag + steam1262.encode_varint(data)
        return tag + steam1262.encode_varint(len(data)) + data
    return b"".join((field(1, 0, base + key), field(2, 2, name.encode()),
                     field(3, 2, ("Tool." + name + "_DisplayName").encode()),
                     field(4, 2, ("guid:" + "a" * 32).encode()),
                     field(999, 0, 999)))


def wrap(key, data):
    return steam1262.encode_varint(key) + steam1262.encode_varint(len(data)) + data


class TestExtendedDefinitions(unittest.TestCase):
    def test_frames_preserve_ids_and_source_role(self):
        pairs = [(1, definition(1, 110000000)), (2, definition(2, 110000000))]
        data = b"".join(wrap(k, rec) for k, rec in pairs)
        decoded = list(extend1262.frames(data))
        self.assertEqual([k for k, _ in decoded], [1, 2])
        rows = [extend1262.parse_definition(k, rec, 110000000, "Tool",
                                             "ddv_Data/StreamingAssets/itemlist/Tool.json", "a" * 64)
                for k, rec in decoded]
        self.assertEqual([r["itemId"] for r in rows], [110000001, 110000002])
        self.assertEqual(rows[0]["localizationKey"], "Tool.Example_DisplayName")
        self.assertEqual(rows[0]["imageGuidField4Candidate"], "guid:" + "a" * 32)
        self.assertIsNone(rows[0]["iconGuid"])
        self.assertIsNone(rows[0]["category"])
        self.assertIsNone(rows[0]["names"]["ja"])

    def test_duplicate_frame_key_fails_closed(self):
        one = wrap(1, definition(1, 110000000))
        with self.assertRaisesRegex(ValueError, "DUPLICATE_NATIVE_FRAME"):
            list(extend1262.frames(one + one))

    def test_item_id_key_mismatch_fails(self):
        with self.assertRaisesRegex(ValueError, "ID_MISMATCH"):
            extend1262.parse_definition(3, definition(2, 110000000), 110000000,
                                        "Tool", "file", "hash")

    def test_pinned_probe_and_corrupt_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / "ddv_Data" / "StreamingAssets" / "itemlist"
            folder.mkdir(parents=True)
            records = [(1, definition(1, 110000000)), (2, definition(2, 110000000)),
                       (3, definition(3, 110000000))]
            data = b"".join(wrap(k, content) for k, content in records)
            file = folder / "Tool.json"
            file.write_bytes(data)
            digest = hashlib.sha256(data).hexdigest()
            probe = {"status": "binary_structure_probe", "size": len(data),
                     "sha256": digest, "source": "ddv_Data/StreamingAssets/itemlist/Tool.json",
                     "frameProbe": {"status": "candidate_frame_model", "frames": [
                         {"frameKey": k, "fieldProfile": {"fields": [{"field": 1, "wire": 0,
                                                                   "integer": 110000000 + k}]}}
                         for k, _ in records]}}
            result = extend1262.pinned_category(root, "Tool.json", probe)
            self.assertEqual(len(result), 3)
            file.write_bytes(data + b"\x00")
            with self.assertRaisesRegex(ValueError, "HASH_MISMATCH"):
                extend1262.pinned_category(root, "Tool.json", probe)


if __name__ == "__main__":
    unittest.main()