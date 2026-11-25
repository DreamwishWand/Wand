import base64
import json
import tempfile
import unittest
import zlib
from pathlib import Path
from extract_memory_sources import read_memory_rows, targets, pointer, materialize

class MemorySourceTests(unittest.TestCase):
    def create(self, root, rows):
        fields={}
        for name, typ, values in rows:
            data=json.dumps(values).encode()
            fields["MemoryShard."+name+"@"+typ]={"count":len(values),"packed":base64.b64encode(zlib.compress(data)).decode()}
        p=root/"source.json"
        p.write_text(json.dumps({"gameVersion":"1.26.2","sourceItemsSha256":"a"*64,"sourceIl2cppDumpSha256":"b"*64,"fields":fields}))
        return p

    def test_shared_masks_and_delta_ids(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.create(Path(d),[
                ("ImageAddress","string",[[130000001,"guid:"+"1"*32],[3,"guid:"+"2"*32]]),
                ("MaskDataAddress","string",[[130000001,"guid:"+"3"*32],[3,"guid:"+"3"*32]]),
                ("NumberOfShards","int",[[130000001,10],[3,1]])])
            source,rows=read_memory_rows([p])
            self.assertEqual(list(rows),[130000001,130000004])
            self.assertEqual(source[0],"1.26.2")
            self.assertEqual(len(targets(rows)),3)
            self.assertEqual(targets(rows)["1"*32],{"Texture2D"})
            self.assertEqual(targets(rows)["3"*32],{"MemoryShardMaskData"})

    def test_reject_incomplete(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.create(Path(d),[("ImageAddress","string",[[1,"guid:"+"1"*32]])])
            with self.assertRaises(ValueError):
                read_memory_rows([p])

    def test_reject_bad_delta(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.create(Path(d),[("ImageAddress","string",[[0,"guid:"+"1"*32]])])
            with self.assertRaises(ValueError):
                read_memory_rows([p])

    def test_resolve_exact_external_pointer(self):
        from types import SimpleNamespace as N
        tex=N(type=N(name="Texture2D"))
        other=N(name="CAB-abc",objects={5:tex})
        own=N(name="CAB-own",externals=[N(path="archive:/CAB-abc/CAB-abc")],objects={})
        obj=N(assets_file=own)
        tree={"Mask":{"m_FileID":1,"m_PathID":5}}
        self.assertIs(pointer(tree,"Mask",obj,[own,other],"Texture2D"),tex)
        with self.assertRaises(ValueError):
            pointer(tree,"Mask",obj,[own,other,other],"Texture2D")
        with self.assertRaises(ValueError):
            pointer(tree,"Mask",obj,[own,other],"Sprite")

    def test_mask_roundtrip_and_exact_reuse(self):
        from PIL import Image
        from types import SimpleNamespace as N
        image=Image.new("RGBA",(2,2),(12,34,56,0))
        image.putpixel((1,1),(99,42,31,255))
        asset=N(name="CAB-a")
        obj=N(assets_file=asset,path_id=3,type=N(name="Texture2D"),read=lambda:N(image=image))
        bundles=[("a.bundle","a"*64,[asset])]
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)
            first=materialize(obj,bundles,{},out,True)
            self.assertFalse(first["reused"])
            second=materialize(obj,bundles,{first["unityAssetId"]:[(Path(first["localSource"]),first)]},out,True)
            self.assertTrue(second["reused"])
            self.assertEqual(first["sha256"],second["sha256"])
            with Image.open(first["localSource"]) as got:
                self.assertEqual(got.convert("RGBA").tobytes(),image.tobytes())

if __name__=="__main__":
    unittest.main()
