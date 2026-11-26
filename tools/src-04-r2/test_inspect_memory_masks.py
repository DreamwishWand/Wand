import hashlib
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from inspect_memory_masks import color_stats, read_pixels

class MemoryMaskEvidenceTests(unittest.TestCase):
    def test_channel_histograms_include_transparent_rgb(self):
        im = Image.new("RGBA", (3, 2))
        im.putdata([(5,0,0,0),(10,20,30,255),(10,20,30,255),
                    (0,0,0,0),(10,20,30,255),(1,2,3,128)])
        report = color_stats(im)
        self.assertEqual(report["distinctRgba"], 4)
        self.assertEqual(report["transparentPixels"], 2)
        self.assertEqual(report["transparentNonzeroRgbPixels"], 1)
        self.assertEqual(report["channelHistograms"][3], {"0":2,"128":1,"255":3})
        self.assertEqual(report["dominantColors"][0],
            {"rgba":[10,20,30,255],"pixels":3,"boundsInclusive":[1,0,2,1]})
        self.assertEqual(report["decodedRgbaSha256"], hashlib.sha256(im.tobytes()).hexdigest())
    def test_exact_webp_sha_and_dimensions(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root/"images").mkdir()
            p = root/"images"/"tmp.webp"
            im = Image.new("RGBA",(2,2),(8,9,10,0))
            im.save(p,format="WEBP",lossless=True,quality=100,method=6,exact=True)
            raw=p.read_bytes()
            sha=hashlib.sha256(raw).hexdigest()
            path=root/"images"/(sha+".webp")
            p.rename(path)
            meta={"sha256":sha,"bytes":len(raw),"width":2,"height":2}
            self.assertEqual(read_pixels(root,sha,meta).tobytes(),im.tobytes())
            with self.assertRaisesRegex(ValueError,"dimensions"):
                read_pixels(root,sha,{**meta,"width":3})
            path.write_bytes(raw+b"x")
            with self.assertRaisesRegex(ValueError,"bytes mismatch"):
                read_pixels(root,sha,meta)
if __name__ == "__main__":
    unittest.main()
