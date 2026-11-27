import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import patch
from PIL import Image
from bundle_thumbnails import POLICY
from publish_bundle_thumbnails import BUCKET, key
from source_image_ledger import SCHEMA
from shared_source_delta import extract,prepare,register,classify,targets,TARGET_SCHEMA

class SharedDeltaTests(unittest.TestCase):
    def test_confirmed_guid_reuse_changed_bundle_without_local_images(self):
        g="1"*32; h="2"*32
        native=Image.new("RGBA",(800,400),(1,2,3,0))
        px=hashlib.sha256(native.tobytes()).hexdigest()
        o={"sha256":"a"*64,"bytes":100,"width":800,"height":400}
        t={"sha256":"b"*64,"bytes":50,"width":512,"height":256}
        ledger={"schema":SCHEMA,"bucket":BUCKET,"thumbnailPolicy":POLICY,
                "images":{o["sha256"]:o,t["sha256"]:t},"originals":{"800x400:"+px:o["sha256"]},
                "thumbnails":{o["sha256"]:t["sha256"]}}
        spec={"schema":TARGET_SCHEMA,"gameVersion":"1.27.0","targets":{g:"ui-original",h:"shop-512"}}
        asset=N(name="CAB-abc")
        obj=N(type=N(name="Texture2D"),assets_file=asset,path_id=3,read=lambda:N(image=native))
        ident="unity:"+"c"*64+":CAB-abc:3:Texture2D"
        resolved=[(guid,(ident,{"Image":obj},[("changed.bundle","c"*64,[asset])]),None) for guid in (g,h)]
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"out"
            with patch("shared_source_delta.verify_game_version",return_value="v1.27.0"),patch("shared_source_delta.resolve",return_value=({g:[],h:[]},{})),patch("shared_source_delta.exact_objects",return_value=resolved),patch.object(Image.Image,"save",side_effect=AssertionError("must not encode")):
                result=extract(spec,Path(d),None,out,ledger)
            self.assertEqual(result["ledgerReused"],2)
            self.assertEqual(result["notInVerifiedLedger"],0)
            self.assertFalse((out/"images").exists())
            report,index,cache,objects=prepare(out,ledger)
            self.assertNotIn("thumbnail",index["references"][g])
            self.assertEqual(index["references"][h]["thumbnail"],t["sha256"])
            self.assertEqual(len(objects),2)
            self.assertEqual(register(out,ledger,2,150,False)["networkRequests"],0)
            with self.assertRaises(ValueError):prepare(out,None)

    def test_reference_delta(self):
        self.assertEqual(classify({"a":1,"b":2,"c":3},{"a":1,"b":4,"d":5}),
                         {"a":"unchanged","b":"changed","c":"notReferenced","d":"added"})
        with self.assertRaises(ValueError):
            targets({"schema":TARGET_SCHEMA,"gameVersion":"1.27.0","targets":{"1"*32:"guess"}})

if __name__=="__main__":unittest.main()
