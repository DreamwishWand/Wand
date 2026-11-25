import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from resolve_shop_objects import dependency_path,exact_readers,PREFIX

class ObjectTests(unittest.TestCase):
    def test_nested_path_and_escape(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d).resolve()
            self.assertEqual(dependency_path(root,PREFIX+"win/icons/furniture.bundle"),root/"win/icons/furniture.bundle")
            self.assertIsNone(dependency_path(root,PREFIX+"../other.bundle"))
    def test_exact_path_and_dereference(self):
        obj=SimpleNamespace(type=SimpleNamespace(name="Sprite"),assets_file=SimpleNamespace(name="CAB-A"),path_id=12)
        ptr=SimpleNamespace(deref=lambda:obj)
        c={"assets/a/icon.png":ptr,"assets/b/icon.png":ptr}
        result,errors=exact_readers(c,"Assets\\A\\Icon.png","Sprite")
        self.assertEqual(list(result),[("CAB-A",12,"Sprite")])
        self.assertFalse(errors)
        self.assertFalse(exact_readers(c,"icon.png","Sprite")[0])
        self.assertFalse(exact_readers(c,"assets/a/icon.png","Texture2D")[0])
if __name__=="__main__":unittest.main()
