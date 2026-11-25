import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from publish_memory_sources import prepare, split, add_thumbnails

class MemoryPublicationTests(unittest.TestCase):
    def test_independent_sources_and_dedup(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/"images").mkdir()
            raw=root/"images"/"temp.webp"
            Image.new("RGB",(4,4),(1,0,0)).save(raw,format="WEBP",lossless=True)
            digest=hashlib.sha256(raw.read_bytes()).hexdigest()
            meta={"sha256":digest,"bytes":raw.stat().st_size,"width":4,"height":4}
            raw.rename(root/"images"/(digest+".webp"))
            g,m="a"*32,"b"*32
            rows={1:{"ImageAddress":"guid:"+g,"MaskDataAddress":"guid:"+m,"NumberOfShards":1}}
            doc={"schema":"wand.media.private-memory-sources@1","complete":True,"errors":{},
                 "gameVersion":"1.26.2","sourceItemsSha256":"s","sourceIl2cppDumpSha256":"d",
                 "items":{"1":rows[1]},"assets":{g:{"images":{"Image":meta}},m:{"images":{"Mask":meta,"Outline":meta}}},
                 "summary":{"uniqueOutputImages":1}}
            (root/"memory-source-report.json").write_text(json.dumps(doc))
            with patch("publish_memory_sources.read_memory_rows",return_value=(("1.26.2","s","d"),rows)):
                objects,index=prepare(root,[])
                self.assertEqual(len(objects),1)
                self.assertEqual(index["references"][m],{"Mask":digest,"Outline":digest})
                self.assertEqual(index["items"]["1"],[g,m,1])
                self.assertFalse(index["pieceBitMappingVerified"])
                self.assertNotIn("localSource",json.dumps(index))
                existing,pending=split(objects,{})
                self.assertFalse(existing)
                self.assertEqual(pending,objects)
                existing,pending=split(objects,{next(iter(objects)):meta["bytes"]})
                self.assertEqual(existing,objects)
                self.assertFalse(pending)
                with self.assertRaises(ValueError):
                    split(objects,{next(iter(objects)):1})
                doc["assets"][m]["images"].pop("Outline")
                (root/"memory-source-report.json").write_text(json.dumps(doc))
                with self.assertRaises(ValueError):
                    prepare(root,[])
    def test_thumbnail_only_resizes_completed_image(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/"images").mkdir()
            def original(size,color):
                p=root/"images"/"tmp.webp"
                Image.new("RGB",size,color).save(p,format="WEBP",lossless=True)
                raw=p.read_bytes()
                sha=hashlib.sha256(raw).hexdigest()
                p.rename(root/"images"/(sha+".webp"))
                return {"sha256":sha,"bytes":len(raw),"width":size[0],"height":size[1]}
            image=original((1024,576),(9,42,87))
            mask=original((1024,576),(1,0,0))
            tiny=original((265,246),(5,4,3))
            objects={"images/"+v["sha256"]+".webp":v for v in (image,mask,tiny)}
            index={"references":{"a":{"Image":image["sha256"]},"b":{"Mask":mask["sha256"],"Outline":mask["sha256"]},"c":{"Image":tiny["sha256"]}}}
            self.assertEqual(add_thumbnails(root,objects,index),2)
            self.assertEqual(len(objects),4)
            self.assertEqual(index["schema"],"wand.media.memory-index@2")
            self.assertEqual(index["references"]["b"],{"Mask":mask["sha256"],"Outline":mask["sha256"]})
            thumb=index["images"][index["references"]["a"]["Thumbnail"]]
            self.assertEqual((thumb["width"],thumb["height"]),(512,288))
            self.assertEqual(index["references"]["c"]["Thumbnail"],tiny["sha256"])
            with patch("publish_memory_sources.resize",side_effect=AssertionError("must reuse cache")):
                add_thumbnails(root,objects,index)
if __name__=="__main__":
    unittest.main()
