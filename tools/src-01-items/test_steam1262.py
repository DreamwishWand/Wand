import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("steam1262", Path(__file__).with_name("steam1262.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def field(key, wire, value):
    header = module.encode_varint((key << 3) | wire)
    if wire == 0:
        return header + module.encode_varint(value)
    return header + module.encode_varint(len(value)) + value


def frame(category, offset, name=b"Example"):
    num = module.CATEGORIES[category][0] + offset
    record = field(1, 0, num) + field(2, 2, name) + field(4, 2, b"guid:" + b"a" * 32)
    return module.encode_varint(offset) + module.encode_varint(len(record)) + record


class Steam1262Test(unittest.TestCase):
    def test_native_frame(self):
        rows = module.parse_category(frame("Furniture", 7), "Furniture")
        self.assertEqual(rows[0]["itemId"], 40000007)
        self.assertEqual(rows[0]["rawNameField"], "Example")
        self.assertIsNone(rows[0]["names"]["ja"])
        self.assertIsNone(rows[0]["category"])

    def test_two_frames(self):
        rows = module.parse_category(frame("Clothing", 1) + frame("Clothing", 2), "Clothing")
        self.assertEqual([x["itemId"] for x in rows], [50000001, 50000002])

    def test_reject_duplicate(self):
        with self.assertRaisesRegex(ValueError, "DUPLICATE_FRAME"):
            module.parse_category(frame("Furniture", 1) * 2, "Furniture")

    def test_reject_mismatch(self):
        with self.assertRaisesRegex(ValueError, "ITEM_FRAME_KEY_MISMATCH"):
            module.parse_category(frame("Furniture", 1), "Clothing")

    def test_reject_noncanonical(self):
        with self.assertRaisesRegex(ValueError, "NON_CANONICAL_VARINT"):
            module.varint(b"\x80\x00", 0)

    def test_reject_truncated(self):
        with self.assertRaises(ValueError):
            module.parse_category(b"\x01\x80", "Furniture")

    def test_reject_empty(self):
        with self.assertRaises(ValueError):
            module.parse_category(b"", "Furniture")


if __name__ == "__main__":
    unittest.main()
