import io
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from bundle_thumbnails import generate, digest, SOURCE_BUNDLE

class BundleThumbnailTests(unittest.TestCase):
    def test_large_small_and_resume(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            rows=[]
            for n,size in enumerate([(1200,600),(128,80),(600,1200)]):
                f=root/"images"/"ui"/"original"/f"{n}.webp"
                f.parent.mkdir(parents=True,exist_ok=True)
                Image.new("RGBA",size,(20,60,100,128)).save(f,format="WEBP",lossless=True)
                raw=f.read_bytes()
                rows.append({"bundlePath":"ddv/"+SOURCE_BUNDLE,"class":"Sprite",
                             "original":{"path":f.relative_to(root).as_posix(),"sha256":digest(raw),
                                         "bytes":len(raw),"width":size[0],"height":size[1]}})
            rows.append({"bundlePath":"unrelated.bundle","class":"Sprite","original":{}})
            m=root/"assets.jsonl"
            m.write_text("\n".join(json.dumps(r) for r in rows),encoding="utf-8")
            output=root/"out"
            r=generate(root,[m],output,{})
            self.assertEqual(r["sourcePromoArtHashes"],3)
            ix=json.loads((output/"thumbnail-index.json").read_text())["images"]
            self.assertEqual((ix[rows[0]["original"]["sha256"]]["thumbnail"]["width"],ix[rows[0]["original"]["sha256"]]["thumbnail"]["height"]),(512,256))
            self.assertEqual(ix[rows[1]["original"]["sha256"]]["thumbnail"]["sha256"],rows[1]["original"]["sha256"])
            self.assertEqual(ix[rows[2]["original"]["sha256"]]["thumbnail"]["height"],512)
            inventory={"images/"+v["thumbnail"]["sha256"]+".webp":v["thumbnail"]["bytes"] for v in ix.values()}
            r=generate(root,[m],output,inventory)
            self.assertEqual(r["cachedThumbnails"],3)
            self.assertEqual(r["candidateUploads"],0)
if __name__=="__main__":
    unittest.main()
