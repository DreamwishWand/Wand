import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from bundle_thumbnails import digest, image_info, POLICY
from publish_story_puzzle_sources import prepare
from publish_memory_sources import split

class StoryPublicationTests(unittest.TestCase):
    def test_prepare_and_missing_only_plan(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/"images").mkdir()
            def make(size,color):
                import io
                b=io.BytesIO()
                Image.new("RGBA",size,color).save(b,format="WEBP",lossless=True)
                raw=b.getvalue()
                sha=digest(raw)
                (root/"images"/(sha+".webp")).write_bytes(raw)
                return image_info(raw,sha)
            o=make((1024,512),"red")
            t=make((512,256),"red")
            icon=make((512,256),"blue")
            blurred=make((512,256),"green")
            row={"ImageAddress":"guid:"+"a"*32,"IconAddress":"guid:"+"b"*32,"BlurredIconAddress":"guid:"+"c"*32,"PuzzleTemplateAddress":"guid:"+"d"*32,"IsMissionItem":True}
            source=("1.26.2","e"*64,"f"*64)
            report={"schema":"wand.media.private-story-puzzle-sources@1","complete":True,"errors":{},"gameVersion":source[0],"sourceItemsSha256":source[1],"sourceIl2cppDumpSha256":source[2],"items":{"1":row},"assets":{k*32:{"original":v} for k,v in zip("abc",(o,icon,blurred))}}
            index={"schema":"wand.media.story-puzzle-index@1","gameVersion":source[0],"thumbnailPolicy":POLICY,"maxThumbnailLongEdge":512,"images":{v["sha256"]:v for v in (o,t,icon,blurred)},"items":{"1":{"isMissionItem":True,"image":{"original":o["sha256"],"thumbnail":t["sha256"]},"icon":icon["sha256"],"blurredIcon":blurred["sha256"]}}}
            for name,data in [("source-report",report),("index-candidate",index),("thumbnail-cache",{"policy":POLICY,"images":{o["sha256"]:t}})]:
                (root/("story-puzzle-"+name+".json")).write_text(json.dumps(data))
            with patch("publish_story_puzzle_sources.read_story_rows",return_value=(source,{1:row})):
                objects,_=prepare(root,[])
                self.assertEqual(len(objects),4)
                k="images/"+o["sha256"]+".webp"
                existing,pending=split(objects,{k:o["bytes"]})
                self.assertEqual(set(existing),{k})
                self.assertEqual(len(pending),3)
                (root/k).write_bytes(b"bad")
                with self.assertRaises(ValueError):
                    prepare(root,[])

if __name__=="__main__":
    unittest.main()
