"""SRC-04 exact GUID metadata probe unit tests (no UnityPy or game files)."""
import unittest
from types import SimpleNamespace

import probe_guid_links as probe


def ref(path_id, cls="Sprite", file="CAB-123"):
    return SimpleNamespace(path_id=path_id,
                           type=SimpleNamespace(name=cls),
                           assets_file=SimpleNamespace(name=file))


class MetadataProbeTests(unittest.TestCase):
    def test_exact_guid_token_link_only_no_name_similarity(self):
        guid="a"*32
        wrong="b"*32
        candidates=probe.normalize_container_entries({
            "guid:"+guid:ref(14),
            "painting-something-similar":ref(20),
            "guid:"+wrong:ref(27),
            "prefix"+guid+"suffix":ref(30)
        },{guid})
        self.assertEqual(candidates[guid],{("CAB-123",14,"Sprite")})
        self.assertEqual(set(candidates),{guid})
    def test_one_sprite_preferred_to_one_texture(self):
        key="a"*32
        candidates={key:{("cab",1,"Sprite"),("cab",2,"Texture2D")}}
        valid,unresolved=probe.select_exact(candidates)
        self.assertEqual(valid[key],("cab",1,"Sprite"))
        self.assertEqual(unresolved,{})
    def test_two_sprites_ambiguous_and_skipped(self):
        key="a"*32
        candidates={key:{("cab",1,"Sprite"),("cab",3,"Sprite")}}
        valid,conflicts=probe.select_exact(candidates)
        self.assertEqual(valid,{})
        self.assertEqual(conflicts[key],2)
    def test_container_with_two_guid_tokens_not_mapped(self):
        a="a"*32;b="b"*32
        result=probe.normalize_container_entries({
            a+"_"+b:ref(55),
            a:ref(56,"Mesh")
        },{a,b})
        self.assertFalse(result)
    def test_target_scope_covers_old_references_and_changed_bundles(self):
        old="a"*64
        base_scan={"bySha":{old:["ddv_Data/StreamingAssets/aa/win/old.bundle"]},
                   "files":{"ddv_Data/StreamingAssets/aa/win/old.bundle":{"sha256":old},
                            "ddv_Data/StreamingAssets/aa/win/changed.bundle":{"sha256":"b"*64},
                            "ddv_Data/StreamingAssets/aa/win/untouched.bundle":{"sha256":"e"*64}}}
        overlay={"rows":{1:("guid:"+"f"*32,{"sourceBundleSha256":old})}}
        current={"files":{"ddv_Data/StreamingAssets/aa/win/old.bundle":{"sha256":old},
                          "ddv_Data/StreamingAssets/aa/win/changed.bundle":{"sha256":"c"*64},
                          "ddv_Data/StreamingAssets/aa/win/untouched.bundle":{"sha256":"e"*64},
                          "ddv_Data/StreamingAssets/aa/win/new.bundle":{"sha256":"d"*64}}}
        paths=probe.selected_paths(base_scan,overlay,current)
        self.assertEqual(set(paths),{
            "ddv_Data/StreamingAssets/aa/win/old.bundle",
            "ddv_Data/StreamingAssets/aa/win/changed.bundle",
            "ddv_Data/StreamingAssets/aa/win/new.bundle"
        })


if __name__=="__main__":
    unittest.main()
