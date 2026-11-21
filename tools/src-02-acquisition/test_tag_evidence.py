import importlib.util
import tempfile
import unittest
from pathlib import Path

MOD = Path(__file__).with_name('extract_tag_evidence.py')
spec = importlib.util.spec_from_file_location('native_tag', MOD)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def v(n):
    out = bytearray()
    while n >= 128:
        out.append((n & 127) | 128)
        n >>= 7
    out.append(n)
    return bytes(out)


def field(i, value):
    if isinstance(value, bytes):
        return v(i << 3 | 2) + v(len(value)) + value
    return v(i << 3) + v(value)


def frame(i, key=b'Synthetic'):
    blob = field(1, i) + field(2, key) + field(3, b'Tag.Synthetic_DisplayName')
    return v(i - 2_000_000_000) + v(len(blob)) + blob


class TestNativeTag(unittest.TestCase):
    def test_exact_field_id_name_localization_key_and_frame_offset(self):
        rows = list(mod.native_frames(frame(2_000_700_001)))
        self.assertEqual(rows, [(2_000_700_001, 700_001, 'Synthetic', 'Tag.Synthetic_DisplayName')])

    def test_duplicate_or_malformed_native_fields_rejected(self):
        b = field(1, 2_000_700_001) + field(1, 2_000_700_001) + field(2, b'X') + field(3, b'Y')
        payload = v(700_001) + v(len(b)) + b
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_OR_BAD_NATIVE_FIELD'):
            list(mod.native_frames(payload))
        with self.assertRaisesRegex(ValueError, 'TAG_FRAME_ID_MISMATCH'):
            list(mod.native_frames(v(700_002) + frame(2_000_700_001)[len(v(700_001)):]))

    def test_tag_source_version_required_before_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'Tag.json').write_bytes(frame(2_000_700_001))
            src = root / 'src02'; src.mkdir()
            with self.assertRaisesRegex(ValueError, 'WRONG_VERSION_TAG_ORIGINAL'):
                mod.extract(root / 'Tag.json', src, root / 'output')

    def test_tag_references_from_recipe_and_ingredient_membership(self):
        recipes = b'{"ingredients":[{"kind":"anyTag","tagId":2001400000},{"kind":"tagAlternatives","tagIds":[2001200011,2001200019]}]}\n'
        members = b'{"tagIds":[2001200019,2001200028]}\n'
        selectors, tags = mod.refs_from_acquisition(recipes, members)
        self.assertEqual(selectors, {2001400000, 2001200011, 2001200019})
        self.assertEqual(tags, {2001200019, 2001200028})


if __name__ == '__main__':
    unittest.main()