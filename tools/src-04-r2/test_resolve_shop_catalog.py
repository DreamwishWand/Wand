import json
import struct
import tempfile
import unittest
from pathlib import Path
from resolve_shop_catalog import resolve

class CatalogTests(unittest.TestCase):
    def test_exact_typed_key_and_dependency(self):
        g='a'*32
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)
            (p/'catalog.json').write_text(json.dumps({'m_resourceTypes':[{'m_ClassName':'UnityEngine.Sprite'},{'m_ClassName':'UnityEngine.Texture2D'},{'m_ClassName':'UnityEngine.ResourceManagement.ResourceProviders.IAssetBundleResource'}]}))
            key=lambda s: b'\x00'+struct.pack('<i',len(s))+s.encode()
            a=key(g); b=key('bundle')
            (p/'catalog.keyData.bin').write_bytes(struct.pack('<i',2)+a+b)
            (p/'catalog.bucketData.bin').write_bytes(struct.pack('<8i',2,4,2,0,1,4+len(a),1,2))
            (p/'catalog.entryData.bin').write_bytes(struct.pack('<i',3)+struct.pack('<7i',0,0,1,0,-1,0,0)+struct.pack('<7i',0,0,1,0,-1,0,1)+struct.pack('<7i',1,0,-1,0,-1,1,2))
            (p/'catalog.InternalIds.bin').write_text(g+'\nfoo.bundle\n')
            result,_=resolve(p,{g,'b'*32})
            self.assertEqual({x['class'] for x in result[g]},{'Sprite','Texture2D'})
            self.assertTrue(all(x['dependencies']==['foo.bundle'] for x in result[g]))
            self.assertEqual(result['b'*32],[])
if __name__=='__main__':unittest.main()
