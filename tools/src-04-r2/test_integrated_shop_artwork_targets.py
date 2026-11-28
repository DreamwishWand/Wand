import unittest
from integrated_shop_artwork_targets import extract, SCHEMA

class IntegratedShopArtworkTests(unittest.TestCase):
    def source(self):
        a,b="a"*64,"b"*64
        return {"schema":SCHEMA,"privateOnly":True,"publicationAuthorized":False,
                "counts":{"total":2,"steam":1},
                "bundles":{"A":{"serverObservation":{"revisionSha256":a},"legacyOnly":False},
                           "B":{"legacyOnly":True,"legacyRevisionSha256":b}},
                "serverDefinitions":{"A":{"revisionSha256":a}},
                "steamRevisions":{a:{"bundleId":"A","revisionSha256":a,"nativeOffer":{
                    "Id":"A","Data":{"OnlineId":"A","Image":"guid:"+"1"*32,
                    "Background":"unsupported","Contents":[{"Image":"guid:"+"2"*32}],
                    "MegaBundleAdjustment":{"OverridedImage1":"guid:"+"3"*32}}}}},
                "legacyDefinitions":{"B":{"revisionSha256":b,"artwork":{"image":None,"background":"guid:"+"1"*32},
                                          "components":[{"image":"guid:"+"4"*32}]}}}
    def test_exact_reference_union(self):
        rows,refs=extract(self.source())
        self.assertEqual(refs,{x*32 for x in "1234"})
        self.assertEqual(rows["A"]["unsupportedFields"],["Background"])
        self.assertIsNone(rows["A"]["lightLayout"])
        self.assertEqual(rows["B"]["platform"],"Switch")
        self.assertEqual(rows["B"]["refs"]["background"],"1"*32)
    def test_identity_and_private_boundary(self):
        d=self.source();d["steamRevisions"]["a"*64]["bundleId"]="wrong"
        with self.assertRaises(ValueError):extract(d)
        d=self.source();d["publicationAuthorized"]=True
        with self.assertRaises(ValueError):extract(d)

if __name__=="__main__":unittest.main()
