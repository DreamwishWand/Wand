import struct
import unittest
from types import SimpleNamespace as NS
from inspect_memory_rendering import dxbc_chunks, flatten, material_info, pointer

def container(kind=b"SHDR", payload=b"abcd"):
    size=44+len(payload)
    return b"DXBC"+bytes(16)+struct.pack("<IIII",1,size,1,36)+kind+struct.pack("<I",len(payload))+payload

class NativeRenderingEvidenceTests(unittest.TestCase):
    def test_dxbc_validation(self):
        valid=container()
        self.assertEqual(list(dxbc_chunks(b"junkDXBC"+bytes(32)+valid+b"extra")), [valid])
        self.assertEqual(list(dxbc_chunks(container(b"RDEF"))), [])
        invalid=bytearray(valid)
        struct.pack_into("<I",invalid,32,40)
        self.assertEqual(list(dxbc_chunks(invalid)), [])
        self.assertEqual(list(dxbc_chunks(valid[:-1])), [])
    def test_metadata_nested_arrays(self):
        self.assertEqual(dict(flatten([[1,2],[3]])),{(0,0):1,(0,1):2,(1,0):3})
        with self.assertRaises(ValueError):
            list(flatten([True]))
    def test_material_native_pointer_and_properties(self):
        reader=NS(assets_file=NS(name="CAB-local",externals=[NS(path="archive:/CAB-other/CAB-shader")]))
        p=NS(m_FileID=1,m_PathID=100)
        self.assertEqual(pointer(reader,p),("cab-shader",100))
        self.assertIsNone(pointer(reader,NS(m_FileID=2,m_PathID=100)))
        material=NS(m_Name="UI generic",m_Shader=p,m_SavedProperties=NS(
            m_TexEnvs=[("_MaskTex",None),("_Outline",None)],m_Floats=[("_Progress",1.0),("_Bad",float("nan"))],
            m_Ints=[],m_Colors=[]))
        info=material_info(reader,material)
        self.assertTrue(info["candidateByMaterial"])
        self.assertEqual(info["shaderPointer"],("cab-shader",100))
        self.assertEqual(info["floatProperties"],{"_Progress":1.0})
if __name__=="__main__":
    unittest.main()
