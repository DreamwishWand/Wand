import unittest
from promoart_catalog_delta import catalog_index, compare, verification_targets

A, B, C, D = (x * 32 for x in "abcd")
DEP = "{UnityEngine.AddressableAssets.Addressables.RuntimePath}/StandaloneWindows64/promoart_assets_all.bundle"

def row(g, path="assets/art.png", cls="UnityEngine.Sprite", deps=None):
    return {"catalogKey": g, "class": cls, "internalId": path,
            "dependencies": [DEP] if deps is None else deps}

class PromoArtDeltaTests(unittest.TestCase):
    def test_filters_and_deduplicates_only_typed_guid_locations(self):
        r = row(A)
        result = catalog_index([r, r, row("Bundle_Test"), row(B, cls="UnityEngine.GameObject"),
                                row(C, deps=["other.bundle"]), row(D, path="assets/PromoArt/x.png", deps=[])])
        self.assertEqual(set(result), {A, D})
        self.assertEqual(len(result[A]), 1)
        self.assertEqual(result[A][0]["class"], "Sprite")

    def test_added_removed_and_relocated(self):
        before = catalog_index([row(A), row(B), row(C)])
        after = catalog_index([row(B, "assets/new.png"), row(C), row(D)])
        result = compare(before, after)
        self.assertEqual(result[A]["status"], "removed_promoart_guid")
        self.assertEqual(result[B]["status"], "catalog_location_changed")
        self.assertEqual(result[C]["status"], "catalog_unchanged_bytes_unverified")
        self.assertEqual(result[D]["status"], "added_promoart_guid")
        self.assertEqual(set(verification_targets(result)), {B, C, D})

    def test_dependency_hash_is_not_pixel_proof(self):
        idx = catalog_index([row(A)])
        result = compare(idx, idx, {DEP: "old"}, {DEP: "new"})
        self.assertEqual(result[A]["status"], "dependency_bytes_changed")
        self.assertEqual(result[A]["changedDependencies"], [DEP])
        self.assertEqual(set(verification_targets(result)), {A})
        same = compare(idx, idx, {DEP: "same"}, {DEP: "same"})
        self.assertEqual(same[A]["status"], "catalog_and_dependency_bytes_unchanged")
        self.assertFalse(verification_targets(same))

    def test_missing_dependency_is_unknown_even_when_catalog_equal(self):
        idx = catalog_index([row(A)])
        result = compare(idx, idx, {DEP: "same"}, {DEP: None})
        self.assertEqual(result[A]["unverifiedDependencies"], [DEP])
        self.assertEqual(result[A]["status"], "catalog_unchanged_bytes_unverified")

if __name__ == "__main__":
    unittest.main()
