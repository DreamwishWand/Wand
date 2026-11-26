import tempfile
import unittest
from pathlib import Path
from PIL import Image
from migrate_item_thumbnails_256 import make_thumbnail, verify_local, meta, POLICY
from stage_media_v2 import digest_file

class Item256Tests(unittest.TestCase):
    def test_native_small_reuse_and_large_resize(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            out=root/"generated"
            for w,h in [(128,64),(256,200),(512,320),(320,512),(798,589)]:
                p=root/f"{w}-{h}.webp"
                Image.new("RGBA",(w,h),(23,41,52,200)).save(p,format="WEBP",lossless=True,quality=100,method=6,exact=True)
                o=meta(digest_file(p),p.stat().st_size,w,h)
                verify_local(p,o)
                t=make_thumbnail(p,o,out)
                self.assertEqual(max(t["width"],t["height"]),min(256,max(w,h)))
                if max(w,h)<=256:
                    self.assertEqual(t,o)
                    self.assertFalse((out/"images"/(o["sha256"]+".webp")).exists())
                else:
                    verify_local(out/"images"/(t["sha256"]+".webp"),t)
                    self.assertEqual(make_thumbnail(p,o,out,t),t)
                self.assertEqual(digest_file(p),o["sha256"])
    def test_corrupt_cache_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            p=root/"original.webp"
            Image.new("RGB",(512,256)).save(p,format="WEBP",lossless=True)
            o=meta(digest_file(p),p.stat().st_size,512,256)
            t=make_thumbnail(p,o,root)
            (root/"images"/(t["sha256"]+".webp")).write_bytes(b"corrupt")
            with self.assertRaises(ValueError):
                make_thumbnail(p,o,root,t)

if __name__=="__main__":
    unittest.main()
