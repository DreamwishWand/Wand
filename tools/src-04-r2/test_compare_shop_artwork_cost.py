import unittest

from compare_shop_artwork_cost import compare


def pair(original, thumbnail, original_bytes=200, thumbnail_bytes=50):
    return {"pair": {
        "original": {"sha256": original * 64, "bytes": original_bytes, "width": 1024, "height": 512},
        "thumbnail": {"sha256": thumbnail * 64, "bytes": thumbnail_bytes, "width": 512, "height": 256},
    }}


def plan(pairs, refs):
    return {
        "schema": "wand.media.private-shop-product-artwork-plan@1",
        "publicationAuthorized": False,
        "renderingVerified": False,
        "pairs": pairs,
        "offers": [{"refs": r} for r in refs],
    }


class ReuseCostTests(unittest.TestCase):
    def test_shared_layers_do_not_reduce_storage_if_composited(self):
        a, b = "a" * 32, "b" * 32
        result = compare(plan({a: pair("1", "2"), b: pair("3", "4")},
                              [[["guid", a]], [["guid", b]], [["guid", a], ["guid", b]]]))
        self.assertEqual(result["roles"]["thumbnail"]["multi"]["bytes"], 100)
        self.assertEqual(result["allRolesDeduplicated"]["multiExclusive"], {"objects": 0, "bytes": 0})
        self.assertEqual(result["allRolesDeduplicated"]["total"]["bytes"], 500)
        self.assertFalse(result["renderingVerified"])

    def test_hash_dedup_not_guid_dedup(self):
        a, b, c = "a" * 32, "b" * 32, "c" * 32
        result = compare(plan({a: pair("1", "2"), b: pair("1", "2"), c: pair("3", "4")},
                              [[["guid", a]], [["guid", b], ["guid", c]]]))
        self.assertEqual(result["roles"]["original"]["shared"]["objects"], 1)
        self.assertEqual(result["roles"]["thumbnail"]["multiExclusive"]["bytes"], 50)

    def test_missing_and_item_refs_not_silently_counted(self):
        result = compare(plan({}, [[["item", 123]], [["guid", "a" * 32]]]))
        self.assertEqual(result["itemReferenceCount"], 1)
        self.assertEqual(result["missingGuidCount"], 1)
        self.assertEqual(result["roles"]["thumbnail"]["total"]["bytes"], 0)
        self.assertTrue(result["excludesItemAndScrollBytes"])

    def test_conflicting_hash_metadata_rejected(self):
        a, b = "a" * 32, "b" * 32
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            compare(plan({a: pair("1", "2"), b: pair("1", "2", 201)},
                         [[["guid", a]], [["guid", b]]]))

    def test_reject_unverified_schema_and_oversize_thumbnail(self):
        a = "a" * 32
        p = plan({a: pair("1", "2")}, [[["guid", a]]])
        p["publicationAuthorized"] = True
        with self.assertRaises(ValueError):
            compare(p)
        p["publicationAuthorized"] = False
        p["pairs"][a]["pair"]["thumbnail"]["width"] = 513
        with self.assertRaises(ValueError):
            compare(p)


if __name__ == "__main__":
    unittest.main()
