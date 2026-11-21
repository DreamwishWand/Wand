"""Synthetic tests for SRC-04 native Steam GUID joins; no game assets needed."""
import json
import tempfile
import unittest
from pathlib import Path

import native1262 as native


class NativeGuidTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_guid_is_exact_token_not_name_guess(self):
        guid = "a" * 32
        item_index = {guid: ["30000031", "30000033"]}
        self.assertEqual(native.exact_guids(["assets/icons/guid:" + guid + ".png"], item_index), [guid])
        self.assertEqual(native.exact_guids(["an icon that looks like item 30000031"], item_index), [])
        self.assertEqual(native.exact_guids(["z" + guid + "0"], item_index), [])
        self.assertEqual(native.exact_guids(["guid:" + "b" * 32], item_index), [])

    def test_merged_manifest_preserves_multi_item_one_guid(self):
        guid = "f" * 32
        rel_path = "ddv_Data/StreamingAssets/aa/win/ui-images-generatedicons_assets_assets/test.bundle"
        image = {
            "assetId": "unity:sha:serialized:3:Sprite",
            "decodedSha256": "b" * 64,
            "exactGuids": [guid],
            "itemIds": ["30000031", "30000033"],
            "variants": {"thumbnail": {"path": "images/thumbnail/bb/pic.webp", "sha256": "c" * 64}},
            "sourceWidth": 1024, "sourceHeight": 1024,
            "containerSha256": "a" * 64,
            "containerPath": rel_path,
            "identityMethod": "exact_guid_in_serialized_name_or_bundle_container"
        }
        checkpoint = {"complete": True, "containerPath": rel_path, "images": [image], "issues": []}
        report = native.combined(self.root, {guid: ["30000031", "30000033"]},
                                 "d" * 64, [rel_path], [rel_path], {rel_path: checkpoint}, [])
        self.assertEqual(report["matchedItems"], 2)
        self.assertEqual(report["matchedUniqueGuids"], 1)
        manifest = json.loads((self.root / "manifest-native.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["items"]), 2)
        self.assertEqual(manifest["items"]["30000031"]["decodedSha256"],
                         manifest["items"]["30000033"]["decodedSha256"])
        self.assertFalse(manifest["publicationApproved"])

    def test_catalog_probe_does_not_infer_guid_to_asset(self):
        folder = self.root / native.CATALOG_FOLDER
        folder.mkdir(parents=True)
        guid = "e" * 32
        (folder / "catalog.json").write_text(json.dumps({"m_KeyDataString": "guid:" + guid}),
                                             encoding="utf-8")
        native.catalog_probe(self.root, self.root / "result", {guid: ["42"]})
        report = json.loads((self.root / "result" / "evidence" / "catalog-probe.json").read_text())
        self.assertEqual(report["matchedGuidTokens"], [guid])
        self.assertFalse(report["publicationApproved"])
        self.assertNotIn("mappedItemIds", report)

    def test_conflicting_asset_links_with_same_item_are_not_selected(self):
        guid = "d" * 32
        path = "icon.bundle"
        base = {
            "exactGuids": [guid], "itemIds": ["1"],
            "variants": {"thumbnail": {"path": "test.png"}},
            "containerSha256": "e" * 64,
            "containerPath": path, "sourceWidth": 100, "sourceHeight": 100
        }
        a = {**base, "assetId": "asset1", "decodedSha256": "a" * 64}
        b = {**base, "assetId": "asset2", "decodedSha256": "b" * 64}
        report = native.combined(self.root, {guid: ["1"]}, "f" * 64,
                                 [path], [path], {path: {"complete": True, "containerPath": path,
                                 "images": [a, b], "issues": []}}, [])
        self.assertEqual(report["matchedItems"], 0)
        self.assertIn("1", report["ambiguousItemIds"])


if __name__ == "__main__":
    unittest.main()
