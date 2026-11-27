import unittest
import json
from pathlib import Path
from types import SimpleNamespace
from PIL import Image
from inspect_world_map_ocean import find,histogram

class OceanEvidenceTests(unittest.TestCase):
    def test_source_links_and_order(self):
        doc=json.loads((Path(__file__).parent/"world-map-ocean-source-steam-1.26.2.json").read_bytes())
        self.assertFalse(doc["shaderExact"])
        self.assertFalse(doc["publicationAuthorized"])
        self.assertEqual(len(doc["parts"]),45)
        self.assertEqual(len(doc["textures"]),7)
        self.assertEqual({r["sha256"] for r in doc["parts"] if r["kind"]=="sdf"},
                         {r["sha256"] for r in doc["textures"]})
        self.assertEqual(doc["shader"]["pathId"],"-7158045598089910108")
        self.assertEqual(doc["material"]["pathId"],"-1132274334993459592")
        self.assertEqual([r["kind"] for r in doc["parts"][:4]],["fill","fill","sdf","sdf"])
    def test_exact_64bit_identity(self):
        ref={"name":"test","cab":"cab-a","pathId":"-7158045598089910108"}
        obj=SimpleNamespace(type=SimpleNamespace(name="Shader"),assets_file=SimpleNamespace(name="CAB-A"),path_id=int(ref["pathId"]))
        other=SimpleNamespace(type=obj.type,assets_file=obj.assets_file,path_id=obj.path_id+1)
        self.assertIs(find(SimpleNamespace(objects=[other,obj]),ref,"Shader"),obj)
        with self.assertRaises(ValueError):
            find(SimpleNamespace(objects=[other]),ref,"Shader")
        with self.assertRaises(ValueError):
            find(SimpleNamespace(objects=[obj,obj]),ref,"Shader")
    def test_distinguish_native_channels(self):
        im=Image.new("RGBA",(2,1))
        im.putdata([(0,255,0,100),(255,255,0,200)])
        h=histogram(im)
        self.assertEqual((h["R"]["min"],h["R"]["max"]),(0,255))
        self.assertEqual((h["G"]["min"],h["G"]["max"]),(255,255))
        self.assertEqual((h["A"]["min"],h["A"]["max"]),(100,200))
        self.assertEqual(sum(h["A"]["histogram"]),2)

if __name__=="__main__":
    unittest.main()
