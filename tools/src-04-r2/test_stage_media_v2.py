"""Synthetic SRC-04 R2 staging tests. No actual R2 credentials or game pixels."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import stage_media_v2 as stage


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def put_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(data, sort_keys=True) + "\n").encode()
    path.write_bytes(raw)
    return raw


def fixture(folder):
    from PIL import Image
    root = Path(folder)
    original = Image.new("RGBA", (80, 40), (220, 18, 20, 123))
    pixel_hash = "e" * 64
    files = {}
    for kind in ("thumbnail", "original"):
        rel = f"images-v2/{kind}/ee/{pixel_hash}.webp"
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        original.save(path, "WEBP", lossless=True, exact=True, method=4)
        raw = path.read_bytes()
        files[kind] = {"path":rel,"sha256":digest(raw),"bytes":len(raw),
                       "width":80,"height":40}
    src = root / "source-items" / "items.jsonl"
    src.parent.mkdir(parents=True)
    src.write_text("\n".join(json.dumps({"itemId":i,"iconGuid":"guid:"+"b"*32})
                             for i in (1,257))+"\n")
    source_hash = stage.digest_file(src)
    source_sha = "a" * 64
    row_image = {
        "class":"Sprite",
        "unityAssetId":f"unity:{source_sha}:CAB-test:1:Sprite",
        "textureAssetId":f"unity:{source_sha}:CAB-test:2:Texture2D",
        "decodedSha256":pixel_hash,"sourceBundleSha256":source_sha,
        "sourceWidth":80,"sourceHeight":40,
        "identityEvidence":"exact_catalog_key_and_serialized_bundle_path_id",
        "thumbnail":files["thumbnail"],"original":files["original"],
    }
    row = lambda item_id:{"itemId":item_id,"iconGuid":"guid:"+"b"*32,
                           "status":"verified","image":row_image}
    shards={}
    for i in range(256):
        bucket=f"{i:02x}"
        data={"schema":stage.SHARD_SCHEMA,"bucket":bucket,
              "rows":[row(1),row(257)] if i == 1 else []}
        name=f"id/{bucket}.json"
        raw=put_json(root/"private-media-overlay-v2-latest"/name,data)
        shards[name]={"sha256":digest(raw),"bytes":len(raw),"count":len(data["rows"]),
                      "verified":len(data["rows"])}
    man={
        "schema":stage.MANIFEST_SCHEMA,
        "bucketCount":256,"privateOnly":True,
        "publicationAuthorized":False,"imageByteVerification":True,
        "source":{"sourceItemsSha256":source_hash,"variantPolicy":stage.VARIANT_POLICY},
        "coverage":{"verifiedItems":2,"totalItems":2,"verifiedGuids":1,
                    "unresolvedItems":0,"unresolvedGuids":0},
        "files":shards
    }
    put_json(root/"private-media-overlay-v2-latest"/"manifest.json",man)
    return root, source_hash, files


class LocalAuditTests(unittest.TestCase):
    def test_full_metadata_and_lossless_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, source_hash, _=fixture(tmp)
            sha, files, counts=stage.collect(root,expected_items=2,expected_guids=1,
                                              source_sha=source_hash)
            self.assertEqual(len(sha),64)
            self.assertEqual(len(files),2)  # shared Item IDs deduplicate
            self.assertEqual((counts["itemCount"],counts["guidCount"]),(2,1))
            report=stage.audit(root,files,progress=0)
            self.assertEqual(report["thumbnailCount"],1)
            self.assertEqual(report["originalCount"],1)
    def test_corrupted_image_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, source_hash, entries=fixture(tmp)
            _, files, _=stage.collect(root,expected_items=2,expected_guids=1,
                                       source_sha=source_hash)
            path=root/entries["original"]["path"]
            path.write_bytes(path.read_bytes()+b"bad")
            with self.assertRaisesRegex(ValueError,"IMAGE_BYTE_LENGTH"):
                stage.audit(root,files,progress=0)
    def test_lossy_webp_fails_even_if_rehashed_metadata(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"lossy.webp"
            Image.new("RGB",(80,40),(20,30,40)).save(path,"WEBP",quality=80)
            with self.assertRaisesRegex(ValueError,"WEBP_NOT_LOSSLESS"):
                stage.webp_lossless_dimensions(path)
    def test_invalid_manifest_visibility_flag_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, source_hash, _=fixture(tmp)
            path=root/"private-media-overlay-v2-latest"/"manifest.json"
            value=json.loads(path.read_text())
            value["publicationAuthorized"]=True
            put_json(path,value)
            with self.assertRaisesRegex(ValueError,"MANIFEST_NOT_PRIVATE_V2"):
                stage.collect(root,expected_items=2,expected_guids=1,source_sha=source_hash)
    def test_traversal_and_symlink_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, _, _=fixture(tmp)
            with self.assertRaisesRegex(ValueError,"PATH_TRAVERSAL"):
                stage.ensure_inside(root, "images-v2/../../other")
    def test_apply_requires_private_bucket_confirmation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, source_hash, _=fixture(tmp)
            _, files, _=stage.collect(root,expected_items=2,expected_guids=1,
                                       source_sha=source_hash)
            with self.assertRaisesRegex(ValueError,"PRIVATE_BUCKET_CONFIRMATION"):
                stage.remote_sync(root,files,"b"*64,bucket="test-private-asset",
                    account_id="a"*32,apply=True,confirm=None)
    def test_report_never_contains_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"report.json"
            stage.save_report(path,{"schema":"test","status":"verified_local"})
            self.assertEqual(json.loads(path.read_text())["status"],"verified_local")


if __name__ == "__main__":
    unittest.main()
