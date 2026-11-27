import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from recover_world_map_parts import source_rows, recover_local, matches, install

class RecoverMapPartsTests(unittest.TestCase):
    def test_bundled_native_evidence(self):
        report=json.loads((Path(__file__).parent/"world-map-source-steam-1.26.2.json").read_bytes())
        rows=source_rows(report)
        self.assertEqual(len(rows),109)
        self.assertEqual(len({r["layoutEvidence"]["guid"] for r in rows}),109)
        self.assertEqual(len({r["imagePath"] for r in rows}),109)

    def test_exact_local_recovery_and_resume(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            source=root/"download"
            source.mkdir()
            out=root/"cache"
            buf=io.BytesIO()
            Image.new("RGBA",(12,10),(1,2,3,255)).save(buf,"WEBP",lossless=True,quality=100,method=6,exact=True)
            raw=buf.getvalue()
            sha=hashlib.sha256(raw).hexdigest()
            filename="a"*64+".webp"
            p={"imagePath":"images/maps/original/aa/"+filename,"imageSha256":sha}
            (source/filename).write_bytes(b"wrong")
            self.assertEqual(recover_local([p],[source],out),{sha:p})
            (source/(sha+".webp")).write_bytes(raw)
            self.assertEqual(recover_local([p],[source],out),{})
            self.assertTrue(matches(out/p["imagePath"],sha))
            self.assertEqual(recover_local([p],[],out),{})
            with self.assertRaises(ValueError):
                install(raw,out/p["imagePath"],"b"*64)

if __name__=="__main__":
    unittest.main()
