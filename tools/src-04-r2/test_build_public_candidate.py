"""Synthetic tests for sanitized SRC-04 delivery candidate (no cloud calls)."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import build_public_candidate as builder


def bytes_json(obj):
    return (json.dumps(obj, sort_keys=True, separators=(",", ":")) + "\n").encode()


def fixture(root: Path):
    private = root / "private-media-overlay-v2-latest"
    decoded = "b" * 64
    binary_sha = "c" * 64
    variants = {}
    for kind in ("thumbnail", "original"):
        variants[kind] = {
            "path": f"images-v2/{kind}/bb/{decoded}.webp",
            "sha256": binary_sha, "bytes": 100,
            "width": 128,
            "height": 120
        }
    image = {
        "unityAssetId":"unity:aa:CAB:42:Sprite",
        "decodedSha256":decoded,
        **variants
    }
    index = {}
    for n in range(256):
        bucket = f"{n:02x}"
        rel = f"id/{bucket}.json"
        items = [{"itemId":1,"iconGuid":"guid:" + "d" * 32,
                  "image":image}] if n == 1 else []
        raw = bytes_json({"schema":"wand.src04.media-overlay-shard@2",
                          "bucket":bucket, "rows":items})
        file = private / rel
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(raw)
        index[rel] = {"sha256":hashlib.sha256(raw).hexdigest(),
                      "bytes":len(raw), "count":len(items)}
    private.joinpath("manifest.json").write_bytes(bytes_json({"files":index}))
    verified = {
        variants[k]["path"]:
            (binary_sha, 100, variants[k]["width"], variants[k]["height"], k)
        for k in ("thumbnail","original")
    }
    return verified


class CandidateTests(unittest.TestCase):
    def test_candidate_is_stripped_and_promotion_plan_is_separate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            verified=fixture(root)
            with patch.object(builder,"EXPECTED_ITEMS",1), patch.object(builder,"EXPECTED_GUIDS",1):
                report=builder.prepare(root,verified,root/"public",
                                       root/"private-promotion-plan.json")
            self.assertEqual(report["publicItems"],1)
            self.assertEqual(report["uniquePublicObjects"],1)
            self.assertFalse(report["uploadedToPublic"])
            files=list((root/"public").rglob("*.json"))
            self.assertEqual(len(files),257)
            all_bytes=b"".join(p.read_bytes() for p in files)
            for private in (b"unity:",b"iconGuid",b"decodedSha256",b"private/"):
                self.assertNotIn(private,all_bytes)
            plan=json.loads((root/"private-promotion-plan.json").read_text())
            self.assertFalse(plan["publicationAuthorized"])
            self.assertEqual(len(plan["objects"]),1)
            self.assertEqual({o["target"] for o in plan["objects"]},
                             {f"images/cc/{'c' * 64}.webp"})
            self.assertTrue(all(o["source"].startswith(builder.SOURCE_PREFIX + "/") for o in plan["objects"]))
    def test_fails_closed_when_byte_hash_is_wrong(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            verified=fixture(root)
            path=next(iter(verified))
            old=verified[path]
            verified[path]=("e"*64,*old[1:])
            with patch.object(builder,"EXPECTED_ITEMS",1), patch.object(builder,"EXPECTED_GUIDS",1):
                with self.assertRaisesRegex(ValueError,"IMAGE_NOT_VERIFIED"):
                    builder.prepare(root,verified,root/"public",
                                    root/"private-promotion-plan.json")
    def test_cannot_run_twice_or_overwrite_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); verified=fixture(root)
            with patch.object(builder,"EXPECTED_ITEMS",1), patch.object(builder,"EXPECTED_GUIDS",1):
                builder.prepare(root,verified,root/"public",root/"private-plan.json")
                with self.assertRaisesRegex(ValueError,"PUBLIC_CANDIDATE_ALREADY_EXISTS"):
                    builder.prepare(root,verified,root/"public",root/"other-plan.json")
    def test_incomplete_private_upload_report_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"src04-r2-stage-report.json").write_text(
                json.dumps({"schema":"wand.src04.r2-stage@1","complete":False,
                            "status":"remote_plan_complete"}))
            with self.assertRaisesRegex(ValueError,"PRIVATE_UPLOAD_NOT_VERIFIED"):
                builder.approved_local_stage(root)


if __name__ == "__main__":
    unittest.main()
