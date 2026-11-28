import hashlib
import json
import unittest
from project_shop_source_release import select, project
from bundle_thumbnails import POLICY
from shared_source_delta import TARGET_SCHEMA

class ShopSourceReleaseTests(unittest.TestCase):
    def test_exact_public_scope_and_receipt(self):
        g,h,x="1"*32,"2"*32,"3"*32
        a,b="a"*64,"b"*64
        catalog={"schema":"wand.item-master.premium-bundle-source@1",
                 "counts":{"publicDefinitions":1},"source":{"steam":{"gameVersion":"1.26.2"}},
                 "definitions":[{"bundleId":"Bundle_A","current":{"revisionSha256":"c"*64,
                 "artwork":{"image":"guid:"+g},"components":[{"itemId":1,"quantity":1}]},
                 "legacy":{"revisionSha256":"d"*64,"artwork":{},"components":[{"image":"guid:"+h}]}}]}
        targets={"schema":TARGET_SCHEMA,"gameVersion":"1.26.2","targets":{i:"shop-512" for i in (g,h,x)}}
        self.assertEqual(set(select(catalog,targets)["targets"]),{g,h})
        images={a:{"sha256":a,"width":1024,"height":512,"bytes":100},
                b:{"sha256":b,"width":512,"height":256,"bytes":50}}
        index={"schema":"wand.media.shared-image-index-candidate@1","privateOnly":True,
               "gameVersion":"1.26.2","thumbnailPolicy":POLICY,"images":images,
               "references":{g:{"role":"shop-512","original":a,"thumbnail":b}}}
        objects={"images/"+s+".webp":m["bytes"] for s,m in images.items()}
        raw=json.dumps({"schema":"wand.media.shared-image-publication-receipt@1","bucket":"dreamwishwand-media",
                        "gameVersion":"1.26.2","canonicalMetadataVerified":True,"objects":objects}).encode()
        cdn={"schema":"wand.media.cdn-readback@1","origin":"https://media.dreamwishwand.com/",
             "cdnVerified":True,"errors":{},"sourceReceiptSha256":hashlib.sha256(raw).hexdigest(),"verified":objects}
        result=project(catalog,index,raw,cdn)
        self.assertEqual(result["references"],{g:[a,b]})
        self.assertFalse(result["renderingVerified"])
        self.assertNotIn("definitions",result)
        with self.assertRaises(ValueError):project(catalog,index,raw,{**cdn,"verified":{}})
        with self.assertRaises(ValueError):project(catalog,{**index,"references":{x:index["references"][g]}},raw,cdn)

if __name__=="__main__":unittest.main()
