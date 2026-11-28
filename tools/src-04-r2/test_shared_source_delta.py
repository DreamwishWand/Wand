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
from shared_source_delta import extract,prepare,register,classify,targets,stage_subset,TARGET_SCHEMA,REPORT_SCHEMA

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

    def test_sprite_texture_alias_requires_pixel_identity(self):
        g="1"*32
        native=Image.new("RGBA",(32,16),(1,2,3,255))
        other=Image.new("RGBA",(32,16),(1,2,4,255))
        a="unity:"+"a"*64+":CAB-abc:3:Texture2D"
        b="unity:"+"a"*64+":CAB-abc:4:Sprite"
        m={"sha256":"c"*64,"bytes":100,"width":32,"height":16,
           "sourcePixelSha256":hashlib.sha256(native.tobytes()).hexdigest()}
        ledger={"schema":SCHEMA,"bucket":BUCKET,"thumbnailPolicy":POLICY,
                "images":{m["sha256"]:{k:v for k,v in m.items() if k!="sourcePixelSha256"}},
                "originals":{},"thumbnails":{}}
        spec={"schema":TARGET_SCHEMA,"gameVersion":"1.26.2","targets":{g:"shop-512"}}
        for alias,valid in [(native,True),(other,False)]:
            with tempfile.TemporaryDirectory() as d:
                out=Path(d)/"out"
                refs=lambda im:{"Image":N(read=lambda:N(image=im))}
                resolved=[(g,(a,refs(native),[]),None),(g,(b,refs(alias),[]),None)]
                with patch("shared_source_delta.verify_game_version",return_value="v1.26.2"),patch("shared_source_delta.resolve",return_value=({g:[]},{})),patch("shared_source_delta.exact_objects",return_value=resolved),patch("shared_source_delta.materialize",return_value=m) as encode,patch("shared_source_delta.local_image",return_value=m):
                    if valid:
                        result=extract(spec,Path(d),None,out,ledger)
                        self.assertEqual(result["uniqueImages"],1)
                        report=json.loads((out/"shared-source-report.json").read_bytes())
                        self.assertEqual(report["assets"][g]["equivalentSourceObjects"],[b])
                    else:
                        with self.assertRaises(ValueError):extract(spec,Path(d),None,out,ledger)
                    self.assertEqual(encode.call_count,1)

    def test_stage_verified_subset_without_reloading_or_reencoding(self):
        g,h,x=("1"*32,"2"*32,"3"*32)
        original={"sha256":"a"*64,"bytes":100,"width":800,"height":400}
        thumb={"sha256":"b"*64,"bytes":50,"width":512,"height":256}
        ledger={"schema":SCHEMA,"bucket":BUCKET,"thumbnailPolicy":POLICY,
                "images":{original["sha256"]:original,thumb["sha256"]:thumb},
                "originals":{},"thumbnails":{original["sha256"]:thumb["sha256"]}}
        report={"schema":REPORT_SCHEMA,"gameVersion":"1.26.2","privateOnly":True,
                "publicationAuthorized":False,"complete":False,
                "targets":{i:"shop-512" for i in (g,h,x)},
                "assets":{i:{"original":original} for i in (g,h)},
                "errors":{h:["ambiguous"]},"unresolved":[h,x]}
        spec={"schema":TARGET_SCHEMA,"gameVersion":"1.26.2","targets":{g:"shop-512"}}
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/"source";source.mkdir()
            p=source/"shared-source-report.json"
            raw=json.dumps(report).encode();p.write_bytes(raw)
            with patch("shared_source_delta.exact_objects",side_effect=AssertionError("must not extract")),patch.object(Image.Image,"save",side_effect=AssertionError("must not encode")):
                out=Path(d)/"out"
                result=stage_subset(source,out,spec,ledger)
                self.assertEqual(result["ledgerReused"],2)
                child,index,cache,objects=prepare(out,ledger)
                self.assertEqual(child["parentSourceReportSha256"],hashlib.sha256(raw).hexdigest())
                self.assertEqual(set(index["references"]),{g})
                self.assertEqual(index["references"][g]["thumbnail"],thumb["sha256"])
                self.assertEqual(p.read_bytes(),raw)
                for bad in (h,x):
                    with self.assertRaisesRegex(ValueError,"Unresolved requested"):
                        stage_subset(source,Path(d)/bad,{**spec,"targets":{bad:"shop-512"}},ledger)
                    self.assertFalse((Path(d)/bad).exists())

    def test_reference_delta(self):
        self.assertEqual(classify({"a":1,"b":2,"c":3},{"a":1,"b":4,"d":5}),
                         {"a":"unchanged","b":"changed","c":"notReferenced","d":"added"})
        with self.assertRaises(ValueError):
            targets({"schema":TARGET_SCHEMA,"gameVersion":"1.27.0","targets":{"1"*32:"guess"}})

if __name__=="__main__":unittest.main()
