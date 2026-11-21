"""Synthetic tests; no copyrighted game files or private media are committed."""
import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from verify_private_overlay import verify

def jbytes(record):
    return (json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n").encode()

def sha(blob):
    return hashlib.sha256(blob).hexdigest()

def fixture(root):
    root = Path(root)
    source = []
    blobs = {}
    files = {}
    for id in range(1, 257):
        b = f"{id % 256:02x}"
        guid = "guid:" + f"{id:032x}"
        source.append({"itemId": id, "iconGuid": guid})
        img_sha = "a" * 64
        image = {
            "class": "Texture2D",
            "unityAssetId": "unity:" + "b" * 64 + ":CAB-fixture:12:Texture2D",
            "textureAssetId": None,
            "sourceSha256": img_sha,
            "identityEvidence": "exact_catalog_key_and_serialized_bundle_path_id",
        }
        for kind in ("thumbnail", "detail"):
            image[kind] = {
                "path": f"images/{kind}/aa/{img_sha}.webp",
                "sha256": "f" * 64, "width": 64, "height": 128
            }
        row = {"itemId": id, "iconGuid": guid, "status": "verified", "image": image}
        path = f"id/{b}.json"
        payload = jbytes({"schema": "wand.src04.media-overlay-shard@1",
                          "bucket": b, "rows": [row]})
        blobs[path] = payload
        files[path] = {"sha256": sha(payload), "bytes": len(payload),
                       "count": 1, "verified": 1}
    content = ("\n".join(json.dumps(row) for row in source) + "\n").encode()
    originals = root / "source.jsonl"
    originals.write_bytes(content)
    manifest = {
        "schema": "wand.src04.media-overlay@1", "privateOnly": True,
        "publicationAuthorized": False, "imageByteVerification": "not_performed",
        "bucketCount": 256,
        "source": {"itemsSha256": sha(content), "itemMapSha256": "d" * 64},
        "coverage": {"complete": False, "scope": "fixture",
                     "totalItems": 256, "verifiedItems": 256, "unresolvedItems": 0,
                     "verifiedGuids": 256, "unresolvedGuids": 0},
        "files": files,
    }
    blobs["manifest.json"] = jbytes(manifest)
    archive = root / "overlay.zip"
    def save():
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
            for path, raw in blobs.items():
                z.writestr("private-media-overlay-latest/" + path, raw)
    save()
    return archive, originals, blobs, manifest, save

class PrivateOverlayAuditTests(unittest.TestCase):
    def test_full_corpus_with_original_source(self):
        with tempfile.TemporaryDirectory() as root:
            archive, originals, _, manifest, _ = fixture(root)
            result = verify(archive, source_items=originals,
                            expected_items=256, expected_guids=256)
            self.assertEqual(result["verifiedItems"], 256)
            self.assertEqual(result["verifiedGuids"], 256)
            self.assertEqual(result["shards"], 256)
            self.assertTrue(result["sourceItemsMatched"])
            self.assertFalse(result["publicationAuthorized"])
            self.assertFalse(result["imageBytesVerified"])

    def test_rejects_changed_shard_bytes(self):
        with tempfile.TemporaryDirectory() as root:
            archive, originals, blobs, _, save = fixture(root)
            blobs["id/01.json"] += b"tampered"
            save()
            with self.assertRaisesRegex(ValueError, "SHARD_DIGEST"):
                verify(archive)

    def test_rejects_nonprivate_manifest(self):
        with tempfile.TemporaryDirectory() as root:
            archive, originals, blobs, manifest, save = fixture(root)
            manifest["publicationAuthorized"] = True
            blobs["manifest.json"] = jbytes(manifest)
            save()
            with self.assertRaisesRegex(ValueError, "PUBLICATION_GATE"):
                verify(archive)

    def test_rejects_wrong_source_hash(self):
        with tempfile.TemporaryDirectory() as root:
            archive, originals, _, _, _ = fixture(root)
            originals.write_bytes(originals.read_bytes() + b"modified")
            with self.assertRaisesRegex(ValueError, "SOURCE_SHA"):
                verify(archive, source_items=originals)

    def test_rejects_unexpected_files(self):
        with tempfile.TemporaryDirectory() as root:
            archive, _, _, _, _ = fixture(root)
            with zipfile.ZipFile(archive, "a") as z:
                z.writestr("private-media-overlay-latest/unknown", b"x")
            with self.assertRaisesRegex(ValueError, "FILE_COUNT"):
                verify(archive)

if __name__ == "__main__":
    unittest.main()
