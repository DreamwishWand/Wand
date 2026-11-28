import unittest
import json
from unittest.mock import patch
from pathlib import Path
from integrated_shop_artwork_targets import extract, project, SCHEMA

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
    def test_historical_revision_distinct_reference_and_latest_source(self):
        d=self.source()
        d["bundles"]["A"]["legacyRevisionSha256"]="e"*64
        d["legacyDefinitions"]["A"]={"revisionSha256":"e"*64,"artwork":{"image":"guid:"+"5"*32},
                                     "components":[{"image":"guid:"+"2"*32}]}
        rows,refs=extract(d)
        self.assertEqual(refs,{x*32 for x in "12345"})
        self.assertEqual(rows["A"]["refs"]["Image"],"1"*32)
        self.assertEqual(rows["A"]["historicalRevision"]["refs"]["image"],"5"*32)
        latest={"platform":"Steam","gameVersion":"1.26.2"}
        d["latestSteamSource"]=latest
        d["steamSources"]=[{"platform":"Steam","gameVersion":"1.25.0"},latest]
        with patch("integrated_shop_artwork_targets.resolve",return_value=({g:[{}] if g!="5"*32 else [] for g in refs},{})):
            report,targets=project(json.dumps(d).encode(),Path("."))
        self.assertEqual(targets["gameVersion"],"1.26.2")
        self.assertEqual(report["unresolvedGuids"],["5"*32])
        self.assertEqual(set(targets["targets"]),refs-{"5"*32})

    def test_identity_and_private_boundary(self):
        d=self.source();d["steamRevisions"]["a"*64]["bundleId"]="wrong"
        with self.assertRaises(ValueError):extract(d)
        d=self.source();d["publicationAuthorized"]=True
        with self.assertRaises(ValueError):extract(d)

if __name__=="__main__":unittest.main()
