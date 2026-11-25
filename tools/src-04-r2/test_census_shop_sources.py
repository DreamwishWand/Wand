import json
import struct
import tempfile
import unittest
from pathlib import Path

from census_shop_sources import Census, canonical_candidate, locbin, scan_ident


def field(n, b):
    return bytes([n*8+2,len(b)])+b


class SourceCensusTests(unittest.TestCase):
    def test_locbin_key_only_and_non_bundle_prefix(self):
        raw=field(1,field(1,b"Bundle_Example_Title")+field(2,b"Example"))
        raw+=field(1,field(1,b"UnknownFamily_Title"))
        self.assertEqual(locbin(raw)["UnknownFamily_Title"],None)
        c=Census()
        c.locale(raw,"LocDB_en-US.zip","Liveops.locbin","en")
        rows=c.report()["localizationCandidates"]
        self.assertEqual(len(rows),2)
        self.assertFalse(rows[1]["shopKeyCandidate"])
        self.assertFalse(c.report()["historicalCoverageComplete"])

    def test_native_structural_candidate_keeps_quantities(self):
        d={"OnlineId":"Bundle_Test","Contents":[{"ItemId":123,"Quantity":2},
                                                {"ItemId":456,"Quantity":1}]}
        c=Census()
        c.tree({"embedded":json.dumps(d)},"example")
        self.assertEqual(c.structured[0]["contents"],[[123,2],[456,1]])
        self.assertIsNone(canonical_candidate({**d,"Contents":[{"ItemId":True,"Quantity":1}]}))

    def test_proto_type_inventory_includes_non_shop_classes(self):
        c=Census()
        def row(name,cls):
            return field(1,field(1,name)+field(2,field(5,cls)))
        c.proto(row(b"Test",b"Definitions.OnlineBundleData")+
                row(b"Other",b"Definitions.FurnitureItemData"),"protoDb.bin")
        self.assertEqual(c.count["protoEntries"],2)
        self.assertEqual(len(c.proto_candidates),1)
        self.assertEqual(c.classes["Definitions.FurnitureItemData"],1)

    def test_ascii_and_utf16_candidates_not_offer_proof(self):
        self.assertIn("Bundle_Example",scan_ident(b"\0Bundle_Example\0"))
        self.assertIn("HeroItem_Test",scan_ident(" HeroItem_Test ".encode("utf-16-le")))
        c=Census()
        c.identifiers(b"Bundle_Example","binary")
        self.assertEqual(c.report()["structuredOfferCandidates"],[])
        self.assertFalse(c.report()["serverCatalogQueried"])

    def test_catalog_enumerates_previously_unknown_guid_by_dependency(self):
        c=Census()
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)
            p.joinpath("catalog.json").write_text(json.dumps({"m_resourceTypes":[{"m_ClassName":"UnityEngine.Sprite"}]}))
            guid=b"a"*32
            p.joinpath("catalog.keyData.bin").write_bytes(struct.pack("<i",2)+b"\0"+struct.pack("<i",32)+guid+b"\0"+struct.pack("<i",3)+b"dep")
            p.joinpath("catalog.bucketData.bin").write_bytes(struct.pack("<i",2)+struct.pack("<iii",4,1,0)+struct.pack("<iii",41,1,1))
            p.joinpath("catalog.entryData.bin").write_bytes(struct.pack("<i",2)+struct.pack("<7i",0,0,1,0,0,0,0)+struct.pack("<7i",1,0,-1,0,0,0,0))
            p.joinpath("catalog.InternalIds.bin").write_text("asset\nui-premiumshop-promoart.bundle\n")
            c.addressables(p,"catalog")
        self.assertEqual(c.count["addressableLocations"],2)
        self.assertIn("a"*32,[x["catalogKey"] for x in c.art])

if __name__=="__main__":
    unittest.main()
