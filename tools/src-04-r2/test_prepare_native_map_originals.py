import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import prepare_native_map_originals as m

class TestPreparation(unittest.TestCase):
    def test_source_lookup_and_changed_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=Path(tmp)
            aa=game/'ddv_Data/StreamingAssets/aa/win'
            aa.mkdir(parents=True)
            def put(path, data):
                path.write_bytes(data)
                return hashlib.sha256(data).hexdigest()
            files={'prefab':('p.bundle',put(aa/'p.bundle',b'p'))}
            scenes={'s.bundle':put(aa/'s.bundle',b's')}
            mono=put(aa/'m_monoscripts.bundle',b'm')
            assembly=put(game/'GameAssembly.dll',b'a')
            with patch.multiple(m,FILES=files,SCENES=scenes,MONO=mono,ASSEMBLY=assembly):
                result=m.sources(game)
                self.assertEqual(result['mono'],aa/'m_monoscripts.bundle')
                self.assertEqual(result['scenes'],[aa/'s.bundle'])
                (aa/'p.bundle').write_bytes(b'changed')
                with self.assertRaises(ValueError):m.sources(game)

    def test_stage_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'stage.json'
            count=[]
            def build():
                count.append(1)
                return {'privateOnly':True}
            self.assertEqual(m.stage(path,build),m.stage(path,build))
            self.assertEqual(count,[1])
            self.assertFalse(path.with_suffix('.tmp').exists())

if __name__=='__main__':unittest.main()
