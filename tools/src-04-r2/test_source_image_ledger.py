import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import patch
from PIL import Image
from bundle_thumbnails import POLICY
from source_image_ledger import build, load, original, thumbnail, require_pending, SCHEMA
from extract_memory_sources import materialize
from extract_story_puzzle_sources import thumbnail as story_thumbnail
from publish_bundle_thumbnails import BUCKET, key

class SourceImageLedgerTests(unittest.TestCase):
    def test_reuse_without_local_image_and_new_thumbnail(self):
        im=Image.new("RGBA",(800,400),(4,5,6,255))
        px=hashlib.sha256(im.tobytes()).hexdigest()
        sha="a"*64
        m={"sha256":sha,"bytes":100,"width":800,"height":400}
        doc={"schema":SCHEMA,"bucket":BUCKET,"thumbnailPolicy":POLICY,
             "images":{sha:m},"originals":{"800x400:"+px:sha},"thumbnails":{}}
        load(doc)
        asset=N(name="CAB-test")
        obj=N(assets_file=asset,path_id=4,type=N(name="Texture2D"),read=lambda:N(image=im))
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)
            with patch.object(Image.Image,"save",side_effect=AssertionError("unexpected original encode")):
                row=materialize(obj,[("changed.bundle","c"*64,[asset])],{},out,True,doc)
            self.assertTrue(row["reusedPublished"])
            self.assertFalse((out/key(sha)).exists())
            with self.assertRaises(ValueError):require_pending(out,{key(sha):m})
            materialize(obj,[("changed.bundle","c"*64,[asset])],{},out,True,doc,"story-puzzle-thumbnail-cache.json")
            cache=json.loads((out/"story-puzzle-thumbnail-cache.json").read_bytes())["images"]
            t=story_thumbnail(out,m,cache,doc)
            self.assertEqual((t["width"],t["height"]),(512,256))
            self.assertFalse((out/key(sha)).exists())

    def test_require_complete_bound_cdn_receipt(self):
        sha="a"*64
        m={"sha256":sha,"bytes":100,"width":8,"height":4}
        row={**m,"sourcePixelSha256":"b"*64}
        report={"complete":True,"errors":{},"gameVersion":"1.26.2","assets":{"g":{"images":{"Image":row}}}}
        index={"gameVersion":"1.26.2","images":{sha:m}}
        cache={"policy":POLICY,"images":{sha:m}}
        objects={key(sha):100}
        receipt=json.dumps({"schema":"wand.media.memory-publication-receipt@1","bucket":BUCKET,"canonicalMetadataVerified":True,"objects":objects}).encode()
        cdn={"schema":"wand.media.cdn-readback@1","sourceReceiptSha256":hashlib.sha256(receipt).hexdigest(),"cdnVerified":True,"errors":{},"verified":objects}
        doc=build(report,index,cache,receipt,cdn)
        self.assertEqual(original(doc,"b"*64,8,4),m)
        self.assertEqual(thumbnail(doc,m),m)
        with self.assertRaises(ValueError):build(report,index,cache,receipt,{**cdn,"verified":{}})

if __name__=="__main__":unittest.main()
