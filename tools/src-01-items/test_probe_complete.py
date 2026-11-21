import base64
import hashlib
import json
import tempfile
import zlib
import unittest
from pathlib import Path

import probe_complete
import steam1262


def make_field(n, wire, content):
    tag = steam1262.encode_varint(n * 8 + wire)
    if wire == 0:
        return tag + steam1262.encode_varint(content)
    return tag + steam1262.encode_varint(len(content)) + content


def test_records():
    rows = []
    examples = []
    for k in (1, 2, 3):
        frame = (make_field(1, 0, 110000000 + k) +
                 make_field(2, 2, f"Tool_{k}".encode()) +
                 make_field(3, 2, f"Tool.Tool_{k}_DisplayName".encode()) +
                 make_field(4, 2, ("guid:" + "a" * 32).encode()))
        rows.append(steam1262.encode_varint(k) + steam1262.encode_varint(len(frame)) + frame)
        examples.append({"frameKey": k, "frameBytes": len(frame),
                         "fieldProfile": {"fields": [{"field": 1, "wire": 0,
                                                      "integer": 110000000 + k}]}})
    return b"".join(rows), examples


def test_info(blob, examples, *, size=None):
    return {"source": "ddv_Data/StreamingAssets/itemlist/Tool.json",
            "size": len(blob) if size is None else size,
            "headBase64": base64.b64encode(blob).decode(),
            "sha256": hashlib.sha256(blob).hexdigest(),
            "status": "binary_structure_probe",
            "frameProbe": {"status": "candidate_frame_model", "frames": examples}}


class TestProbeComplete(unittest.TestCase):
    def test_complete_source_recovers_all_with_provenance(self):
        blob, examples = test_records()
        decoded = probe_complete.records_for_complete_source("Tool.json", test_info(blob, examples))
        self.assertEqual([row["itemId"] for row in decoded], [110000001, 110000002, 110000003])
        self.assertEqual(decoded[0]["source"]["sha256"], hashlib.sha256(blob).hexdigest())
        self.assertIsNone(decoded[0]["iconGuid"])
        self.assertEqual(decoded[0]["localizationKey"], "Tool.Tool_1_DisplayName")
        self.assertTrue(all(value is None for value in decoded[0]["names"].values()))

    def test_truncated_probe_never_claims_complete_file(self):
        blob, examples = test_records()
        self.assertIsNone(probe_complete.records_for_complete_source(
            "Tool.json", test_info(blob, examples, size=len(blob) + 1)))

    def test_full_probe_hash_mismatch_fails_closed(self):
        blob, examples = test_records()
        info = test_info(blob, examples)
        info["sha256"] = "a" * 64
        with self.assertRaisesRegex(ValueError, "DIGEST_MISMATCH"):
            probe_complete.records_for_complete_source("Tool.json", info)

    def test_probe_id_sample_mismatch_fails_closed(self):
        blob, examples = test_records()
        examples[1]["frameKey"] = 8
        with self.assertRaisesRegex(ValueError, "ID_BASE"):
            probe_complete.records_for_complete_source("Tool.json", test_info(blob, examples))

    def test_complete_locbin_exact_category_key_join(self):
        blob, examples = test_records()
        first_key = "Tool.Tool_1_DisplayName"
        def string_field(number, text):
            return make_field(number, 2, text.encode("utf-8"))
        entries = [string_field(1, f"Tool_{key}_DisplayName") +
                   string_field(2, f"Localized {key}") for key in (1, 2, 3)]
        loc_binary = b"".join(make_field(1, 2, entry) for entry in entries)
        crc = f"{zlib.crc32(loc_binary) & 0xffffffff:08x}"
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            loc = {"archiveEntries": 1, "source":
                       "ddv_Data/StreamingAssets/Localization/LocDB_en-US.zip",
                   "sha256": "a" * 64, "members": {"Tool": {
                       "bytes": len(loc_binary), "crc32": crc,
                       "headBase64": base64.b64encode(loc_binary).decode()}}}
            probe = {"schema": "wand.src01.format-probe@1", "gameVersion": "1.26.2",
                     "platform": "Steam", "itemlistCandidates": {
                          "Tool.json": test_info(blob, examples),
                          "Other.json": {**test_info(blob[:20], examples, size=len(blob) + 100),
                             "source": "ddv_Data/StreamingAssets/itemlist/Other.json"}},
                     "localization": {"en": loc}}
            (root / "probe.json").write_text(json.dumps(probe))
            result = probe_complete.build(root / "probe.json", root / "out")
            self.assertEqual(result["localizedByLocale"]["en"], 3)
            data = [json.loads(line) for line in (root / "out/definitions.jsonl").read_text().splitlines()]
            self.assertEqual(data[0]["names"]["en"], "Localized 1")
            self.assertEqual(data[0]["localizationKey"], first_key)
            self.assertIsNone(data[0]["names"]["ja"])
            manifest = json.loads((root / "out/manifest.json").read_text())
            self.assertEqual(manifest["localizationEvidence"]["en"]["members"]["Tool"]["crc32"], crc)
            probe["localization"]["en"]["members"]["Tool"]["crc32"] = "a" * 8
            (root / "probe.json").write_text(json.dumps(probe))
            with self.assertRaisesRegex(ValueError, "CRC_MISMATCH"):
                probe_complete.build(root / "probe.json", root / "out2")

    def test_combined_partial_manifest_marks_remaining_unverified(self):
        blob, examples = test_records()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            probe = {"schema": "wand.src01.format-probe@1", "gameVersion": "1.26.2", "platform": "Steam",
                     "itemlistCandidates": {"Tool.json": test_info(blob, examples),
                        "Other.json": {**test_info(blob[:20], examples, size=len(blob) + 100),
                                       "source": "ddv_Data/StreamingAssets/itemlist/Other.json"}}}
            (root / "probe.json").write_text(json.dumps(probe))
            outcome = probe_complete.build(root / "probe.json", root / "out")
            self.assertEqual(outcome["definitions"], 3)
            manifest = json.loads((root / "out/manifest.json").read_text())
            self.assertEqual(manifest["unresolvedCategories"], ["Other"])
            self.assertEqual(manifest["categories"]["Tool.json"]["count"], 3)


if __name__ == "__main__":
    unittest.main()