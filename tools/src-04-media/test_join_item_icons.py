"""Offline tests for joining the full SRC-01 item set to exact SRC-04 images."""
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from join_item_icons import join


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, sort_keys=True), encoding="utf-8")


def build_fixture(out):
    # Exactly match the source dataset cardinalities (13,202 items / 9,542 GUIDs).
    # 9,182 GU IDs have exact matching images; 360 remain unresolved.
    raw_items = []
    for index in range(13202):
        n = index if index < 9542 else index - 9542
        raw_items.append({"itemId": index + 1, "iconGuid": "guid:" + f"{n:032x}",
                          "nativeCategory": "Furniture" if index % 2 else "ActivityItem",
                          "rawNameField": f"NativeItem_{index}"})
    item_data = ("\n".join(json.dumps(item) for item in raw_items) + "\n").encode()
    file = out / "source-items" / "items.jsonl"
    file.parent.mkdir(parents=True)
    file.write_bytes(item_data)
    write(out / "source-items" / "manifest.json", {
        "itemCount": 13202, "itemsSha256": sha(item_data),
        "gameVersion": "1.26.2", "platform": "Steam"})
    mapping = {}
    for index in range(9182):
        guid = f"{index:032x}"
        link = {"assetClass": "Sprite",
                "assetId": "unity:fake-" + guid + ":Sprite",
                "counterpartAssetId": "unity:fake-" + guid + ":Texture2D",
                "decodedSha256": f"{index + 1:064x}",
                "identityEvidence": "exact_catalog_key_and_serialized_bundle_path_id",
                "pointerObjectCount": 2,
                "sourceWidth": 128, "sourceHeight": 256,
                "variants": {
                    "detail": {"path": "images/detail/ab/" + guid + ".webp",
                               "sha256": "e" * 64},
                    "thumbnail": {"path": "images/thumbnail/ab/" + guid + ".webp",
                                  "sha256": "f" * 64},
                }}
        mapping[guid] = link
    write(out / "catalog-identity-links-private.json", {
        "schema": "wand.src04.identity-links@2", "publicationApproved": False,
        "verifiedGuidCount": len(mapping), "guidToImage": mapping})
    bundles = {f"dummy_{i}.bundle": {"exactGuidPointerCount": 9182 if i == 0 else 0}
               for i in range(24)}
    write(out / "catalog-identity-report.json", {
        "schema": "wand.src04.identity-probe@2",
        "publicationApproved": False, "imageDecodingPerformed": False,
        "processedBundleCount": 24, "targetBundleCount": 24,
        "crossBundleConflictCount": 0, "warnings": [],
        "totalVerifiedUniqueGuids": 9182, "bundles": bundles})
    return mapping


class JoinTests(unittest.TestCase):
    def test_exact_mapping_fans_out_to_item_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp)
            build_fixture(out)
            result = join(out)
            # Duplicate item GUIDs in the second category must fan out.
            self.assertEqual(result["totalItems"], 13202)
            self.assertEqual(result["totalUniqueGuids"], 9542)
            self.assertEqual(result["verifiedUniqueGuids"], 9182)
            self.assertEqual(result["unresolvedUniqueGuids"], 360)
            self.assertEqual(result["verifiedItems"], 12842)
            self.assertEqual(result["unresolvedItems"], 360)
            self.assertFalse(result["publicationApproved"])
            lines = (out / "item-icon-map-private.jsonl").read_text().splitlines()
            self.assertEqual(len(lines), 13202)
            self.assertEqual(json.loads(lines[0])["status"], "verified")
            self.assertEqual(json.loads(lines[9541])["status"], "unresolved")
            self.assertEqual(json.loads(lines[9542])["status"], "verified")
            self.assertEqual(len(json.loads(
                (out / "item-icon-unresolved-private.json").read_text())["guids"]), 360)

    def test_invalid_evidence_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp)
            links = build_fixture(out)
            links["0" * 32]["identityEvidence"] = "name_similarity"
            write(out / "catalog-identity-links-private.json", {
                "schema": "wand.src04.identity-links@2", "publicationApproved": False,
                "verifiedGuidCount": len(links), "guidToImage": links})
            with self.assertRaisesRegex(ValueError, "Unverified"):
                join(out)
            self.assertFalse((out / "item-icon-map-private.jsonl").exists())

    def test_bad_source_checksum_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp)
            build_fixture(out)
            with (out / "source-items" / "items.jsonl").open("ab") as f:
                f.write(b"tampered")
            with self.assertRaisesRegex(ValueError, "checksum"):
                join(out)

    def test_rejects_unsafe_variant(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp)
            links = build_fixture(out)
            links["0" * 32]["variants"]["detail"]["path"] = "../outside.webp"
            write(out / "catalog-identity-links-private.json", {
                "schema": "wand.src04.identity-links@2", "publicationApproved": False,
                "verifiedGuidCount": len(links), "guidToImage": links})
            with self.assertRaisesRegex(ValueError, "Invalid image path"):
                join(out)


if __name__ == "__main__":
    unittest.main()
