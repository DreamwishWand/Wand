import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from audit_native_map_cdn import digest, pixels
from encode_native_map_originals import encode_one, rebind, reuse_index


class TestNativeMapOriginals(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root/'images').mkdir()
        (self.root/'receipts').mkdir()
        self.im = Image.new('RGBA',(3,2))
        self.im.putdata([(5,8,9,0),(7,3,8,255),(34,18,2,128),
                         (24,33,44,255),(89,64,99,0),(255,2,12,255)])
        buf = io.BytesIO()
        self.im.save(buf,format='PNG')
        raw = buf.getvalue()
        self.png = self.root/(digest(raw)+'.png')
        self.png.write_bytes(raw)
        self.meta = {'width':3,'height':2,'kind':'texture','pixelSha256':pixels(self.im,'texture')}
        self.a = 'a'*64
        self.b = 'b'*64

    def tearDown(self):
        self.tmp.cleanup()

    def test_roundtrip_resume_and_duplicate(self):
        row = encode_one(self.a,self.png,self.meta,self.root)
        data = self.root/'images'/(row['sha256']+'.webp')
        with Image.open(data) as im:
            self.assertEqual(im.convert('RGBA').tobytes(),self.im.tobytes())
        self.assertEqual(row,encode_one(self.a,self.png,self.meta,self.root))
        duplicate = encode_one(self.b,self.png,self.meta,self.root)
        self.assertEqual(row['sha256'],duplicate['sha256'])
        self.assertEqual(len(list((self.root/'images').glob('*.webp'))),1)
        self.png.unlink()
        self.assertEqual(row,encode_one(self.a,self.png,self.meta,self.root))
        data.write_bytes(b'bad')
        with self.assertRaises(ValueError):
            encode_one(self.a,self.png,self.meta,self.root)

    def test_explicit_pixel_reuse(self):
        old = self.root/'prior'
        old.mkdir()
        path = old/'prior.webp'
        self.im.save(path,format='WEBP',lossless=True,quality=100,method=4,exact=True)
        reuse = reuse_index([old],{self.a:self.meta})
        self.assertIn(self.a,reuse)
        row = encode_one(self.a,self.png,self.meta,self.root,reuse[self.a])
        self.assertTrue(row['reusedLocal'])
        self.assertEqual(row['sha256'],digest(path.read_bytes()))
        wrong = {**self.meta,'pixelSha256':'0'*64}
        self.assertEqual(reuse_index([old],{self.a:wrong}),{})

    def test_sdf_red_only_reuse(self):
        old = self.root/'prior'
        old.mkdir()
        im = Image.new('RGBA',self.im.size)
        im.putdata([(r,0,0,255) for r,g,b,a in self.im.getdata()])
        im.save(old/'sdf.webp',format='WEBP',lossless=True)
        meta = {**self.meta,'kind':'sdf','pixelSha256':pixels(self.im,'sdf')}
        reuse = reuse_index([old],{self.a:meta})
        self.assertIn(self.a,reuse)
        self.assertTrue(encode_one(self.a,self.png,meta,self.root,reuse[self.a])['reusedLocal'])

    def test_rebind_masks_and_deduplicate(self):
        row = encode_one(self.a,self.png,self.meta,self.root)
        second = {**row,'sourceSha256':self.b}
        audit = {'images':{self.a:self.meta,self.b:self.meta},
                 'maps':[{'locked':[{'kind':'texture','imageSha256':self.a,
                           'mask':{'kind':'alpha','image':{'kind':'texture','imageSha256':self.b}}}],
                          'unlocked':[{'kind':'texture','imageSha256':self.b}]}],
                 'privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False}
        original = copy.deepcopy(audit)
        rebound = rebind(audit,{self.a:row,self.b:second})
        self.assertEqual(audit,original)
        self.assertEqual(rebound['sourceIdentityCount'],2)
        self.assertEqual(len(rebound['images']),1)
        self.assertEqual(rebound['maps'][0]['locked'][0]['mask']['image']['imageSha256'],row['sha256'])
        self.assertFalse(rebound['worldPlacementVerified'])

    def test_reject_changed_witness(self):
        encode_one(self.a,self.png,self.meta,self.root)
        with self.assertRaises(ValueError):
            encode_one(self.a,self.png,{**self.meta,'pixelSha256':'0'*64},self.root)


if __name__ == '__main__':
    unittest.main()
