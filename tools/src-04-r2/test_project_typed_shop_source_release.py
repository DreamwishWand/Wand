import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from bundle_thumbnails import POLICY, image_info
from source_image_ledger import SCHEMA
from project_typed_shop_source_release import select, batches, stage, release
from shared_source_delta import prepare

class TypedShopReleaseTests(unittest.TestCase):
    def test_scope_pairs_batches_stage_and_verified_release(self):
        g,h,x="1"*32,"2"*32,"3"*32
        catalog={"schema":"wand.item-master.premium-bundle-source@1","counts":{"publicDefinitions":1},
                 "source":{"steam":{"gameVersion":"1.26.2"}},"definitions":[
            {"bundleId":"Bundle_A","current":{"revisionSha256":"a"*64,
            "artwork":{"image":"guid:"+g,"background":"guid:"+h},
            "components":[{"image":"guid:"+g}]},"legacy":None}]}
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/"source";(source/"images").mkdir(parents=True)
            def original(color,cls):
                image=Image.new("RGBA",(2,2),color)
                p=root/"test.webp";image.save(p,format="WEBP",lossless=True,quality=100,method=6,exact=True)
                data=p.read_bytes();sha=hashlib.sha256(data).hexdigest()
                (source/"images"/(sha+".webp")).write_bytes(data)
                m=image_info(data,sha)
                return {"original":{**m,"sourcePixelSha256":hashlib.sha256(image.tobytes()).hexdigest()},
                        "thumbnail":m,"unityAssetId":"unity:"+cls}
            sprite=original((1,2,3,255),"Sprite");texture=original((4,5,6,255),"Texture2D")
            bg=original((7,8,9,255),"Texture2D");private=original((10,11,12,255),"Sprite")
            report={"schema":"wand.media.private-typed-shop-sources@1","gameVersion":"1.26.2",
                    "privateOnly":True,"publicationAuthorized":False,"renderingVerified":False,
                    "complete":True,"errors":{},"assets":{g:{"sources":{"Sprite":sprite,"Texture2D":texture}},
                       h:{"sources":{"Texture2D":bg}},x:{"sources":{"Sprite":private}}}}
            cache={"policy":POLICY,"images":{v["original"]["sha256"]:v["thumbnail"] for v in (sprite,texture,bg,private)}}
            version,entries,images=select(catalog,report,cache)
            self.assertEqual(set(entries),{g+":Sprite",g+":Texture2D",h+":Texture2D"})
            self.assertNotIn(private["original"]["sha256"],images)
            groups=batches(entries,max_objects=2,max_bytes=100000)
            self.assertEqual(len(groups),2)
            for i,rows in enumerate(groups):
                dest=root/str(i);stage(source,dest,version,rows,None)
                _,index,_,objects=prepare(dest,None)
                self.assertEqual(len(objects),len(rows))
                stage(source,dest,version,rows,None)
            with self.assertRaises(ValueError):release(version,entries,images,None)
            ledger={"schema":SCHEMA,"bucket":"dreamwishwand-media","thumbnailPolicy":POLICY,
                    "images":images,"originals":{},"thumbnails":{}}
            public=release(version,entries,images,ledger)
            self.assertEqual(public["references"][g]["Sprite"],[sprite["original"]["sha256"]]*2)
            self.assertEqual(public["references"][g]["Texture2D"],[texture["original"]["sha256"]]*2)
            self.assertFalse(public["renderingVerified"])
            self.assertNotIn("unityAssetId",json.dumps(public))
            self.assertNotIn(x,public["references"])
            del report["assets"][g]["sources"]["Texture2D"]
            with self.assertRaises(ValueError):select(catalog,report,cache)

if __name__=="__main__": unittest.main()
