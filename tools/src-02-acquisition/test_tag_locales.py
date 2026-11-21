import importlib.util
import tempfile
import unittest
from pathlib import Path

FILE = Path(__file__).with_name('extract_tag_locales.py')
spec = importlib.util.spec_from_file_location('tag_locales', FILE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def v(n):
    result=bytearray()
    while n >= 128:
        result.append((n & 127) | 128);n >>= 7
    result.append(n)
    return bytes(result)


def f(field, value:bytes):
    return v(field << 3 | 2) + v(len(value)) + value


def entry(name=b'Fake_DisplayName', value='テスト'.encode('utf8')):
    msg=f(1,name)+f(2,value)
    return f(1,msg)


class TagLocaleTest(unittest.TestCase):
    def test_tag_locbin_protobuf_records_decode_exact_key_and_utf8_value(self):
        obj=mod.parse_tag_locbin(entry()+entry(b'Second_DisplayName',b'English'))
        self.assertEqual(obj['Fake_DisplayName'],'テスト')
        self.assertEqual(obj['Second_DisplayName'],'English')

    def test_duplicate_localization_key_rejected(self):
        with self.assertRaisesRegex(ValueError,'DUPLICATE_LOCALIZATION_KEY'):
            mod.parse_tag_locbin(entry()+entry())

    def test_bad_native_shape_and_missing_translations_rejected(self):
        with self.assertRaisesRegex(ValueError,'LOCBIN_MISSING_KEY_OR_VALUE'):
            mod.parse_tag_locbin(f(1,f(1,b'X')))
        with self.assertRaisesRegex(ValueError,'LOCBIN_INVALID_UTF8'):
            mod.parse_tag_locbin(entry(value=b'\xff'))
        with self.assertRaisesRegex(ValueError,'LOCBIN_UNSAFE_STRING'):
            mod.parse_tag_locbin(entry(value=b'\n'))

    def test_wrong_or_missing_archive_cannot_be_accepted_as_current(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);t=root/'tag';t.mkdir();loc=root/'locales';loc.mkdir()
            with self.assertRaisesRegex((ValueError,FileNotFoundError),'UNTRUSTED_TAG_PARENT|INVALID_INPUT'):
                mod.extract(t,loc,root/'out')


if __name__ == '__main__':
    unittest.main()