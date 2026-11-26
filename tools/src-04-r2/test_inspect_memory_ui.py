import struct
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from inspect_memory_ui import raw_ptr, raw_links, scan_paths, SCRIPTS

class MemoryUIEvidenceTests(unittest.TestCase):
    def test_pinned_script_pointer_and_candidate_links(self):
        obj=NS(assets_file=NS(name="CAB-ui",externals=[NS(path="archive:/globalgamemanagers.assets"),NS(path="archive:/CAB-mat/CAB-mat")]))
        raw=bytes(16)+struct.pack("<iq",1,538)+struct.pack("<iq",2,123)+struct.pack("<iq",2,456)
        self.assertEqual(raw_ptr(obj,raw,16),("globalgamemanagers.assets",538))
        self.assertEqual(SCRIPTS[538],"CollectionMemoryShardsItem")
        self.assertIsNone(raw_ptr(obj,raw,40+12))
        index={("cab-mat",123):[{"type":"Material","pathId":123}],("cab-mat",456):[{"type":"Material"},{"type":"Material"}]}
        self.assertEqual(raw_links(obj,raw,index,28),[{"offset":28,"type":"Material","pathId":123}])
    def test_source_selection_excludes_unrelated_and_image_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=Path(tmp);data=game/"ddv_Data";aa=data/"StreamingAssets"/"aa"/"win"
            aa.mkdir(parents=True)
            (data/"globalgamemanagers.assets").touch()
            for name in ["menu-uiroot_assets_all.bundle","ui-all_assets_all.bundle","shaders_assets_all.bundle","craftingmaterial-wood_assets_all.bundle","ui-images-generatedicons_assets_all.bundle","ui-atlas-generalatlas_assets_all.bundle","fruit.bundle"]:
                (aa/name).touch()
            nested=aa/"menu-collection_assets_assets";nested.mkdir();(nested/"collection.prefab_123.bundle").touch()
            self.assertEqual({p.name for p in scan_paths(game)},{"globalgamemanagers.assets","menu-uiroot_assets_all.bundle","ui-all_assets_all.bundle","shaders_assets_all.bundle","collection.prefab_123.bundle"})
if __name__=="__main__":
    unittest.main()
