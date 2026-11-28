"""Regression for native texture cache: source identities, not display names."""
import io,zipfile,zlib,unittest
from convert_native_hair_assets import read_reused_map,digest
class Cache(unittest.TestCase):
    def test_reuse_requires_both_original_hashes(self):
        pixels=bytes(range(20));packed=zlib.compress(pixels)
        info=dict(sourceSha256='1'*64,payloadSha256='2'*64,width=2,height=2,format=12,mips=2)
        sampler=(1,1,0.,0,0,0);key='CAB-test:123'
        row=dict(info,sampler=list(sampler),colorSpace=0,mipByteLengths=[16,4],rgbaSha256=digest(pixels),asset=dict(sha256=digest(packed),bytes=len(packed)))
        mem=io.BytesIO()
        with zipfile.ZipFile(mem,'w') as z:z.writestr(row['asset']['sha256']+'.wht',packed)
        with zipfile.ZipFile(mem) as z:
            cache=({'textures':{key:row}},z)
            self.assertEqual(read_reused_map(cache,key,info,sampler,0),(row,packed))
            for field in ('sourceSha256','payloadSha256'):
                self.assertIsNone(read_reused_map(cache,key,dict(info,**{field:'3'*64}),sampler,0))
            self.assertIsNone(read_reused_map(cache,'missing',info,sampler,0))
            row['rgbaSha256']='0'*64
            with self.assertRaises(ValueError):read_reused_map(cache,key,info,sampler,0)
if __name__=='__main__':unittest.main()
