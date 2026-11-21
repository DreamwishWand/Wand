"""Entirely synthetic private native DutyAch milestone projection tests."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-03-guide"))
import duty_milestones as db
import native_guide as native


def vf(n, v):
    return native.encode_varint(n << 3) + native.encode_varint(v)


def sf(n, data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return native.encode_varint((n << 3) | 2) + native.encode_varint(len(data)) + data


def frame(offset, wire):
    return native.encode_varint(offset) + native.encode_varint(len(wire)) + wire


def milestones(value, reward, amount):
    return vf(1, value) + vf(2, reward) + vf(3, amount)


def fixture():
    source = [
        vf(1, 2110000001) + sf(2, "PRIVATE_DUTY_A") +
        sf(13, milestones(2, 300001, 2)) +
        sf(13, milestones(10, 300002, 3)),
        vf(1, 2110000002) + sf(2, "PRIVATE_DUTY_B") +
        sf(13, "OPAQUE_PRIVATE_SUBMESSAGE"),
        vf(1, 2110000003) + sf(2, "PRIVATE_DUTY_C")
    ]
    raw = b"".join(frame(i + 1, wire) for i, wire in enumerate(source))
    hash_ = db.sha(raw)
    index = {
        "schema": db.GUIDE_SCHEMA, "family": "duties",
        "target": {"platform": "Steam", "gameVersion": "1.26.1"},
        "records": [
            {
                "id": str(2110000001 + i), "rawName": "PRIVATE_DUTY_" + str(i),
                "nativeWireSha256": db.sha(wire),
                "source": {
                    "file": db.SOURCE_FILE, "sha256": hash_,
                    "frameIndex": i
                }
            } for i, wire in enumerate(source)
        ]
    }
    return raw, index


class DutyMilestonesTests(unittest.TestCase):
    def test_full_source_guide_provenance_and_typed_milestones(self):
        raw, guide = fixture()
        out = db.project(raw, guide)
        self.assertEqual(out["schema"], db.SCHEMA)
        self.assertEqual(out["summary"], {
            "nativeRows": 3, "typedMilestoneDefinitions": 1,
            "typedMilestones": 2, "opaqueOrMixedDefinitions": 1,
            "noField13Definitions": 1
        })
        self.assertEqual(out["records"][0]["evidenceState"], "typed_milestone_fields")
        self.assertEqual(out["records"][0]["milestones"], [
            {"milestone": 2, "rewardItem": 300001, "rewardAmount": 2},
            {"milestone": 10, "rewardItem": 300002, "rewardAmount": 3}
        ])
        self.assertEqual(out["records"][1]["evidenceState"], "opaque_or_mixed_field13")
        self.assertEqual(out["records"][1]["milestones"], [])
        self.assertEqual(out["records"][2]["evidenceState"], "no_field13_observed")
        self.assertEqual(out["records"][2]["milestones"], [])
        self.assertFalse(out["evidence"]["rewardEligibilityVerified"])
        self.assertFalse(out["evidence"]["rewardOwnershipVerified"])
        self.assertFalse(out["evidence"]["writerAuthorized"])

    def test_mixed_or_unordered_milestones_not_promoted(self):
        raw, guide = fixture()
        source = [
            vf(1, 2110000001) + sf(2, "PRIVATE_DUTY_A") +
            sf(13, milestones(10, 300001, 2)) +
            sf(13, milestones(2, 300002, 3)),
            vf(1, 2110000002) + sf(13, milestones(2, 300001, 1)) +
            sf(13, b"PRIVATE_OPAQUE"),
            vf(1, 2110000003) + sf(2, "PRIVATE_DUTY_C"),
        ]
        raw = b"".join(frame(i + 1, wire) for i, wire in enumerate(source))
        for i, wire in enumerate(source):
            guide["records"][i]["nativeWireSha256"] = db.sha(wire)
            guide["records"][i]["source"]["sha256"] = db.sha(raw)
        out = db.project(raw, guide)
        self.assertEqual(out["summary"]["typedMilestoneDefinitions"], 0)
        self.assertEqual(out["summary"]["opaqueOrMixedDefinitions"], 2)
        self.assertEqual(out["records"][0]["milestones"], [])
        self.assertEqual(out["records"][1]["milestones"], [])

    def test_source_hash_or_frame_digest_mismatch_is_rejected(self):
        raw, guide = fixture()
        guide["records"][0]["source"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "INVALID_PROVENANCE"):
            db.project(raw, guide)
        raw, guide = fixture()
        for record in guide["records"]:
            record["source"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "SOURCE_HASH_MISMATCH"):
            db.project(raw, guide)
        raw, guide = fixture()
        guide["records"][0]["nativeWireSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "FRAME_PROVENANCE_MISMATCH"):
            db.project(raw, guide)

    def test_duplicate_id_and_frame_invalid(self):
        raw, guide = fixture()
        guide["records"][1]["id"] = guide["records"][0]["id"]
        with self.assertRaisesRegex(ValueError, "INVALID_PROVENANCE"):
            db.project(raw, guide)
        raw, guide = fixture()
        guide["records"][1]["source"]["frameIndex"] = 0
        with self.assertRaisesRegex(ValueError, "INVALID_PROVENANCE"):
            db.project(raw, guide)

    def test_true_int32_ranges_and_opaque_future_fields(self):
        a = db._milestone(milestones(4, 123, 1))
        self.assertEqual(a["rewardAmount"], 1)
        self.assertIsNone(db._milestone(milestones(0, 123, 1)))
        self.assertIsNone(db._milestone(milestones(5, 2 ** 32, 1)))
        self.assertIsNone(db._milestone(sf(1, b"not native int")))
        self.assertIsNone(db._milestone(vf(1, 5) + vf(2, 8) + vf(3, 1) + vf(4, 4)))

    def test_private_output_atomic_and_never_prints_source_records(self):
        raw, guide = fixture()
        out = db.project(raw, guide)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "guide" / "duty-milestones.private.json"
            db.write_private_output(path, out)
            read = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(read, out)
            self.assertIn("PRIVATE", json.dumps(guide))
            # Source-derived IDs and reward IDs stay inside private output.
            self.assertEqual(out["summary"]["typedMilestones"], 2)
            self.assertNotIn("2110000001", json.dumps(out["summary"]))
            self.assertNotIn("300001", json.dumps(out["summary"]))


if __name__ == "__main__":
    unittest.main()
