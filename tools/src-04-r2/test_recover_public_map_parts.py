import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from recover_public_map_parts import source_candidates,recover_public,ocean_rows
import json

class FakeS3:
    def __init__(self,objects):
        self.objects=objects
        self.calls=[]
    def get_object(self,*,Bucket,Key):
        self.calls.append(Key)
        raw=self.objects[Key]
        return {"ContentLength":len(raw),"Body":io.BytesIO(raw)}

class PublicMapRecoveryTests(unittest.TestCase):
    def test_legacy_and_canonical_reuse(self):
        buf=io.BytesIO()
        Image.new("RGBA",(4,3),(17,23,5,255)).save(buf,"WEBP",lossless=True)
        raw=buf.getvalue();sha=hashlib.sha256(raw).hexdigest()
        pixel="f"*64
        row={"imageSha256":sha,"imagePath":"images/maps/original/ff/"+pixel+".webp"}
        canonical="images/"+sha+".webp"
        legacy="media/shared/original/ff/"+pixel+".webp"
        self.assertEqual(source_candidates(row,{canonical:len(raw)},{pixel:[(legacy,len(raw))]}),[(canonical,len(raw))])
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);s3=FakeS3({legacy:raw})
            pending,stats=recover_public(s3,[row],root,{}, {pixel:[(legacy,len(raw))]})
            self.assertEqual(pending,{})
            self.assertEqual(stats["reusedLegacy"],1)
            self.assertEqual((root/row["imagePath"]).read_bytes(),raw)
            pending,stats=recover_public(s3,[row],root,{canonical:len(raw)}, {})
            self.assertEqual(stats["getRequests"],0)
            self.assertEqual(s3.calls,[legacy])
    def test_corrupted_canonical_refused(self):
        sha="a"*64;k="images/"+sha+".webp";raw=b"x"*32
        row={"imageSha256":sha,"imagePath":"images/maps/original/aa/"+sha+".webp"}
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                recover_public(FakeS3({k:raw}),[row],Path(temp),{k:len(raw)},{})
    def test_ocean_target_set(self):
        source=json.loads((Path(__file__).parent/"world-map-ocean-source-steam-1.26.2.json").read_bytes())
        rows=ocean_rows(source)
        self.assertEqual(len(rows),7)
        self.assertEqual(sum(r["bytes"] for r in rows),157638)

if __name__=="__main__":
    unittest.main()
