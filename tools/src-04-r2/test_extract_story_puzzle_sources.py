import base64
import json
import tempfile
import unittest
import zlib
from pathlib import Path
from PIL import Image
from bundle_thumbnails import digest, image_info
from extract_story_puzzle_sources import read_story_rows, target_roles, thumbnail

class StoryPuzzleSourceTests(unittest.TestCase):
    def source(self, root, incomplete=False):
        fields = {}
        for field in ("ImageAddress", "IconAddress", "BlurredIconAddress", "PuzzleTemplateAddress", "IsMissionItem"):
            typ = "bool" if field == "IsMissionItem" else "string"
            rows = [[10, True]] if typ == "bool" else [[10, "guid:" + "a"*32], [2, "guid:" + "b"*32]]
            if incomplete and field == "ImageAddress":
                rows.pop()
            fields["Story."+field+"@"+typ] = {"count": len(rows), "packed": base64.b64encode(zlib.compress(json.dumps(rows).encode())).decode()}
        p = root / "source.json"
        p.write_text(json.dumps({"gameVersion":"1.26.2", "sourceItemsSha256":"c"*64, "sourceIl2cppDumpSha256":"d"*64, "fields":fields}))
        return p

    def test_roles_and_sparse_mission_flags(self):
        with tempfile.TemporaryDirectory() as d:
            source, rows = read_story_rows([self.source(Path(d))])
            self.assertEqual(source[0], "1.26.2")
            self.assertTrue(rows[10]["IsMissionItem"])
            self.assertFalse(rows[12]["IsMissionItem"])
            self.assertEqual(target_roles(rows)["a"*32], {"ImageAddress", "IconAddress", "BlurredIconAddress"})

    def test_incomplete_source_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                read_story_rows([self.source(Path(d), True)])

    def test_thumbnail_original_reuse_and_bounds(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root/"images").mkdir()
            for size in [(240,120),(800,400)]:
                import io
                buf=io.BytesIO()
                Image.new("RGBA", size, (5,6,7,255)).save(buf,format="WEBP",lossless=True,quality=100,method=6,exact=True)
                raw=buf.getvalue()
                sha=digest(raw)
                original=image_info(raw,sha)
                (root/"images"/(sha+".webp")).write_bytes(raw)
                t=thumbnail(root,original,{})
                if size[0]<=512:
                    self.assertEqual(t,original)
                else:
                    self.assertEqual((t["width"],t["height"]),(512,256))
                self.assertEqual(thumbnail(root,original,{sha:t}),t)

if __name__ == "__main__":
    unittest.main()
