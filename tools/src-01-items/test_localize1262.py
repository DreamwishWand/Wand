import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("localize1262", Path(__file__).with_name("localize1262.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def part(number, text):
    value = text.encode("utf-8")
    return module.make_varint((number << 3) | 2) + module.make_varint(len(value)) + value


def entry(key, text):
    body = part(1, key) + part(2, text)
    return b"\x0a" + module.make_varint(len(body)) + body


class TestLocalizedNames(unittest.TestCase):
    def test_read_pairs(self):
        data = entry("Amethyst_DisplayName", "Amethyst") + entry("Diamond_DisplayName", "Diamond")
        strings = module.decode_locbin(data)
        self.assertEqual(strings["Amethyst_DisplayName"], "Amethyst")
        self.assertEqual(strings["Diamond_DisplayName"], "Diamond")

    def test_unicode_names(self):
        strings = module.decode_locbin(entry("Amethyst_DisplayName", "アメジスト"))
        self.assertEqual(strings["Amethyst_DisplayName"], "アメジスト")

    def test_normalize_formatting(self):
        value = "<nobr>アグラバー</nobr>\u200b<nobr>宮殿</nobr>"
        self.assertEqual(module.clean_display_name(value), "アグラバー宮殿")

    def test_reject_duplicate_key(self):
        with self.assertRaisesRegex(ValueError, "DUPLICATE_LOCALIZATION_KEY"):
            module.decode_locbin(entry("Test_DisplayName", "one") + entry("Test_DisplayName", "two"))

    def test_reject_truncated(self):
        with self.assertRaisesRegex(ValueError, "INVALID_LOCALIZATION_CONTAINER_SIZE"):
            module.decode_locbin(b"\x0a\x03\x0a")

    def test_reject_wrong_wire(self):
        with self.assertRaisesRegex(ValueError, "UNEXPECTED_LOCALIZATION_CONTAINER_FIELD"):
            module.decode_locbin(b"\x08\x01")

    def test_reject_wrong_inner_field(self):
        data = part(1, "Test_DisplayName") + part(3, "Test")
        with self.assertRaisesRegex(ValueError, "UNEXPECTED_LOCALIZATION_ENTRY_FIELD"):
            module.decode_entry(data)

    def test_version_contract(self):
        self.assertEqual(len(module.LOCALES), 8)
        self.assertEqual(len(module.CATEGORY_HASHES), 4)

    def test_varint_roundtrip(self):
        for number in (0, 1, 127, 128, 65535, 2**32):
            data = module.make_varint(number)
            parsed, end = module.varint(data, 0)
            self.assertEqual((parsed, end), (number, len(data)))


if __name__ == "__main__":
    unittest.main()
