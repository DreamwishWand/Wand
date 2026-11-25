import unittest
from select_shop_card_assets import select

class SelectionTests(unittest.TestCase):
    def test_default_main(self):
        row = {"categoryType": "Featured", "visual": {"Image": "guid:"+"a"*32}, "contents": [{"itemId": 123, "visual": {}}]}
        self.assertEqual(select(row)["layout"], "Light_Dual")
        self.assertEqual(select(row)["bindings"]["CurrentImage"], "guid:"+"a"*32)
        row["visual"] = {}
        self.assertEqual(select(row)["bindings"]["CurrentImage"], {"nativeItemIconRequired": 123})

    def test_mega(self):
        row = {"categoryType": "Featured", "visual": {"LightLayout": "Light_Mega_11", "MegaBundleAdjustment": {"OverridedImage1": "guid:"+"b"*32}}, "contents": []}
        self.assertEqual(select(row)["bindings"]["MegaBundleImage1"], "guid:"+"b"*32)
        self.assertEqual(select(row)["bindings"]["MegaBundleImage2"], {"missingContent": 1})

    def test_one_line_and_background_scope(self):
        row = {"categoryType":"DreamBundle", "visual":{"Image":"guid:"+"a"*32,"Background":"guid:"+"b"*32},
               "storeVisual":{"CategoryBackground":"guid:"+"c"*32}, "contents":[{"itemId":123,"visual":{}}]}
        result = select(row)
        self.assertEqual(result["presentation"],"one_line")
        self.assertEqual(result["prefab"],"LightBundle_With_Scroll")
        self.assertNotIn("Background",result["bindings"])
        self.assertEqual(result["offerBackgroundUnbound"],row["visual"]["Background"])
        self.assertEqual(result["menuVisualCandidate"],row["storeVisual"])
        row["categoryType"]="Unknown"
        self.assertEqual(select(row)["status"],"unsupported_category")

if __name__ == "__main__":
    unittest.main()
