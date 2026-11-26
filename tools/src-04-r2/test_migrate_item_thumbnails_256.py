import tempfile
import unittest
from pathlib import Path
from PIL import Image
from migrate_item_thumbnails_256 import make_thumbnail, verify_local, meta, POLICY, pending_breakdown, key
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

    def test_pending_breakdown_counts_shared_original_once(self):
        a,b,c="a"*64,"b"*64,"c"*64
        pending={key(a):meta(a,1000,400,400),key(b):meta(b,200,128,128),key(c):meta(c,300,256,256)}
        result=pending_breakdown(pending,{key(a),key(b)},{a:{1000},b:{199}})
        self.assertEqual(result,{"missingCanonicalOriginals":2,"missingCanonicalOriginalBytes":1200,
                                 "missingCanonicalThumbnailOnly":1,"missingCanonicalThumbnailOnlyBytes":300,
                                 "legacyNameSizeMatches":1,"legacyNameSizeMatchBytes":1000})

if __name__=="__main__":
    unittest.main()
