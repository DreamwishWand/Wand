"""Synthetic-only tests of source-pinned native GridArea 16-way vector math."""
import hashlib
import struct
import tempfile
import unittest
from pathlib import Path

from gridarea_rotation import (
    COS, SIN, COS_FIELD_HASH, SIN_FIELD_HASH,
    rotate_gridarea_vector, verify_original_rotation_metadata,
)


class NativeGridAreaVectorTests(unittest.TestCase):
    # Expected pairs derived from signed x86 IMUL and division by 100
    # performed on each term independently for input vector (2, 3).
    ROTATED = [
        (-2, -3), (-2, -2), (-3, -1), (-2, 0),
        (-3, 2), (-2, 2), (-1, 3), (0, 2),
        (2, 3), (2, 2), (3, 1), (2, 0),
        (3, -2), (2, -2), (1, -3), (0, -2),
    ]
    UNROTATED = [
        (-2, -3), (0, -2), (1, -3), (2, -2),
        (3, -2), (2, 0), (3, 1), (2, 2),
        (2, 3), (0, 2), (-1, 3), (-2, 2),
        (-3, 2), (-2, 0), (-3, -1), (-2, -2),
    ]

    def test_original_signed_16way_coefficients_match_source_hash_names(self):
        self.assertEqual(len(COS), 16)
        self.assertEqual(len(SIN), 16)
        self.assertEqual(hashlib.sha256(
            struct.pack("<16i", *COS)).hexdigest().upper(),
            COS_FIELD_HASH)
        self.assertEqual(hashlib.sha256(
            struct.pack("<16i", *SIN)).hexdigest().upper(),
            SIN_FIELD_HASH)

    def test_all_sixteen_orientations_forward_reverse_and_coverage(self):
        for code in range(16):
            with self.subTest(orientation=code):
                forward = rotate_gridarea_vector(2, 3, code)
                back = rotate_gridarea_vector(2, 3, code, inverse=True)
                self.assertEqual((forward["x"], forward["y"]), self.ROTATED[code])
                self.assertEqual((back["x"], back["y"]), self.UNROTATED[code])
                self.assertEqual(forward["coefficientScale"], 100)
                self.assertTrue(forward["nativeVectorRotationVerified"])
                self.assertFalse(forward["rotatedGridAreaCellMappingVerified"])
                self.assertFalse(forward["placementLegalityVerified"])

    def test_integer_truncation_per_product_not_matrix_or_rounding(self):
        # Noncardinal forward/inverse not necessarily exact round trips.
        forward = rotate_gridarea_vector(2, 3, 1)
        reverse = rotate_gridarea_vector(
            forward["x"], forward["y"], 1, inverse=True)
        self.assertNotEqual((reverse["x"], reverse["y"]), (2, 3))
        self.assertEqual((reverse["x"], reverse["y"]), (1, 2))
        # A nonzero product below 100 must truncate to ZERO, not floor.
        self.assertEqual(
            (rotate_gridarea_vector(1, 0, 2)["x"],
             rotate_gridarea_vector(1, 0, 2)["y"]), (0, 0))
        # GridArea native x86 IMUL is signed 32-bit, including overflow.
        extreme = rotate_gridarea_vector(0x7fffffff, 0, 4)
        self.assertEqual((extreme["x"], extreme["y"]),
                         (0, -1))  # (MAX_INT32*100) wraps to -100

    def test_bounds_bool_and_invalid_orientation_refused(self):
        for kwargs in (
            {"x": 2.5, "y": 0, "orientation": 0},
            {"x": True, "y": 0, "orientation": 0},
            {"x": 0, "y": 0, "orientation": False},
            {"x": 0, "y": 0, "orientation": 16},
            {"x": -0x80000001, "y": 0, "orientation": 0},
            {"x": 0, "y": 0, "orientation": -1},
        ):
            with self.assertRaisesRegex(ValueError, "invalid GridArea"):
                rotate_gridarea_vector(**kwargs)
        with self.assertRaisesRegex(ValueError, "invalid GridArea"):
            rotate_gridarea_vector(0, 0, 0, inverse=1)

    def test_original_field_default_hashes_require_exact_source_values(self):
        # Source-shape synthetic v31 metadata; no proprietary game bytes.
        names = [COS_FIELD_HASH, SIN_FIELD_HASH]
        string_data = b"".join(name.encode() + b"\x00" for name in names)
        strings = 256
        fields = strings + len(string_data)
        defaults = fields + 24
        values = defaults + 24
        raw = bytearray(values + 128)
        struct.pack_into("<II", raw, 0, 0xfab11baf, 31)
        for header_word, offset, length in (
                (6, strings, len(string_data)),
                (24, fields, 24),
                (16, defaults, 24),
                (18, values, 128)):
            struct.pack_into("<II", raw, header_word * 4, offset, length)
        raw[strings:fields] = string_data
        struct.pack_into("<III", raw, fields, 0, 0, 0x04000001)
        struct.pack_into("<III", raw, fields + 12,
                         len(names[0]) + 1, 0, 0x04000002)
        struct.pack_into("<III", raw, defaults, 0, 0, 0)
        struct.pack_into("<III", raw, defaults + 12, 1, 0, 64)
        struct.pack_into("<16i", raw, values, *COS)
        struct.pack_into("<16i", raw, values + 64, *SIN)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "metadata-synthetic-v31.dat"
            path.write_bytes(raw)
            result = verify_original_rotation_metadata(
                path, require_steam_1261=False)
            self.assertEqual(result["metadataVersion"], 31)
            self.assertEqual(result["tables"]["cos"]["coefficientCount"], 16)
            self.assertEqual(result["tables"]["sin"]["coefficientCount"], 16)
            self.assertFalse(result["placementLegalityVerified"])
            with self.assertRaisesRegex(ValueError, "SHA mismatch"):
                verify_original_rotation_metadata(path)
            tampered = bytearray(raw)
            tampered[values + 2] ^= 1
            path.write_bytes(tampered)
            with self.assertRaisesRegex(ValueError, "field hash mismatch"):
                verify_original_rotation_metadata(
                    path, require_steam_1261=False)
            path.write_bytes(raw[:values + 127])
            with self.assertRaisesRegex(ValueError, "table bounds"):
                verify_original_rotation_metadata(
                    path, require_steam_1261=False)


if __name__ == "__main__":
    unittest.main()
