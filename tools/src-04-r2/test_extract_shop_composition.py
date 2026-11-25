import json
import unittest
from extract_shop_composition import extract

class CompositionTests(unittest.TestCase):
    def test_source_fields_are_not_guessed(self):
        part = {"ItemId": 123, "Quantity": 2, "ImageAdjustment": {},
                "AdjustImage": True, "Description": "private source text"}
        offer = {"Id": "Bundle_A", "Data": {"OnlineId": "Bundle_A",
                  "Background": "guid:"+"a"*32, "Layout": "Dual_2",
                  "Contents": [part], "ImageAdjustment": {"MarginBottom": 70}}}
        store = {"Id": "Store_A", "Data": {"OnlineId": "Store_A",
                  "AccentColor": "#123456", "BundleContents": [offer]}}
        snap = {"OnlineId": "ShopA", "Categories": [{"Data": {"Featured": {"Stores": [store], "CategoryBackground": "guid:"+"b"*32, "AccentColor":"#AA112278"}}}]}
        raw = json.dumps({"Data": {"ShopA": json.dumps(snap)}}).encode()
        d = extract(raw)
        self.assertFalse(d["renderingVerified"])
        self.assertFalse(d["publicationAuthorized"])
        a = d["offers"][0]
        self.assertEqual(a["visual"]["Layout"], "Dual_2")
        self.assertEqual(a["visual"]["ImageAdjustment"]["MarginBottom"],70)
        self.assertNotIn("Image",a["visual"])
        self.assertEqual(a["storeVisual"],{"AccentColor":"#123456"})
        self.assertEqual(a["contents"],[{"itemId":123,"quantity":2,"visual":{"ImageAdjustment":{},"AdjustImage":True}}])
        self.assertEqual(a["categoryType"],"Featured")
        self.assertEqual(a["categoryVisual"]["CategoryBackground"],"guid:"+"b"*32)
        self.assertEqual(d["categories"][0]["visual"],a["categoryVisual"])

if __name__ == "__main__":
    unittest.main()
