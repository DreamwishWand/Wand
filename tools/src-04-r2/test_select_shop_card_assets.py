import unittest
from select_shop_card_assets import select

class SelectionTests(unittest.TestCase):
    def test_default_main(self):
        row = {"visual": {"Image": "guid:"+"a"*32}, "contents": [{"itemId": 123, "visual": {}}]}
        self.assertEqual(select(row)["layout"], "Light_Dual")
        self.assertEqual(select(row)["bindings"]["CurrentImage"], "guid:"+"a"*32)
        row["visual"] = {}
        self.assertEqual(select(row)["bindings"]["CurrentImage"], {"nativeItemIconRequired": 123})

    def test_mega(self):
        row = {"visual": {"LightLayout": "Light_Mega_11", "MegaBundleAdjustment": {"OverridedImage1": "guid:"+"b"*32}}, "contents": []}
        self.assertEqual(select(row)["bindings"]["MegaBundleImage1"], "guid:"+"b"*32)
        self.assertEqual(select(row)["bindings"]["MegaBundleImage2"], {"missingContent": 1})

if __name__ == "__main__":
    unittest.main()
