import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from publish_memory_sources import prepare, split

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
if __name__=="__main__":
    unittest.main()
