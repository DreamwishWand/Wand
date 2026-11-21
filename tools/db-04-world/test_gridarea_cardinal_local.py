"""Synthetic source-native GridArea cardinal oriented cell regression tests."""
import unittest

from gridarea_cardinal_local import (
    SOURCE_SHA256, UNWIND_SEGMENTS,
    cardinal_local_position, cardinal_layer_window,
)


class OriginalCardinalLocalTests(unittest.TestCase):
    def test_original_three_contiguous_unwind_fragments_cover_native_code(self):
        self.assertEqual(UNWIND_SEGMENTS[0][0], 0x3923BB0)
        self.assertEqual(UNWIND_SEGMENTS[0][1], UNWIND_SEGMENTS[1][0])
        self.assertEqual(UNWIND_SEGMENTS[1][1], UNWIND_SEGMENTS[2][0])
        self.assertEqual(UNWIND_SEGMENTS[2][1], 0x3923D79)
        self.assertEqual(len(SOURCE_SHA256), 64)

    def test_exact_cardinal_local_gridarea_coordinate_map(self):
        # Original GridArea width=3, height=2, distinct per-cell values.
        cases = {
            0: [[(2, 1), (1, 1), (0, 1)],
                [(2, 0), (1, 0), (0, 0)]],
            4: [[(0, 1), (0, 0)],
                [(1, 1), (1, 0)],
                [(2, 1), (2, 0)]],
            8: [[(0, 0), (1, 0), (2, 0)],
                [(0, 1), (1, 1), (2, 1)]],
            12: [[(2, 0), (2, 1)],
                 [(1, 0), (1, 1)],
                 [(0, 0), (0, 1)]],
        }
        for code, rows in cases.items():
            for y, row in enumerate(rows):
                for x, expected in enumerate(row):
                    with self.subTest(code=code, x=x, y=y):
                        actual = cardinal_local_position(3, 2, x, y, code)
                        self.assertEqual(
                            (actual["originalLocalX"], actual["originalLocalY"]),
                            expected)
                        self.assertEqual(
                            actual["originalFlatIndex"],
                            expected[0] * 2 + expected[1])
                        self.assertTrue(actual["inside"])
                        self.assertTrue(
                            actual["nativeCardinalPositionTransformVerified"])
                        self.assertFalse(actual["gridObjectAnchorVerified"])
                        self.assertFalse(actual["occupancyPredicateVerified"])
                        self.assertFalse(actual["placementLegalityVerified"])

    def test_raw_mask_oriented_windows_are_not_occupancy_or_placeability(self):
        values = [11, 12, 21, 22, 31, 32]
        cases = {
            0: [[32, 22, 12], [31, 21, 11]],
            4: [[12, 11], [22, 21], [32, 31]],
            8: [[11, 21, 31], [12, 22, 32]],
            12: [[31, 32], [21, 22], [11, 12]],
        }
        for code, rows in cases.items():
            with self.subTest(code=code):
                data = cardinal_layer_window(3, 2, values, code,
                    0, 0, len(rows[0]), len(rows))
                self.assertEqual(data["rows"], rows)
                self.assertTrue(data["rawLayerValuesNotOccupancy"])
                self.assertEqual(data["gridToAreaTessellationRatioAssumed"], "1:1")
                self.assertFalse(data["fullNativeTessellationScalingApplied"])
                self.assertFalse(data["occupancyPredicateVerified"])
                self.assertFalse(data["placementLegalityVerified"])
                data["rows"][0][0] = 999
                self.assertEqual(values, [11, 12, 21, 22, 31, 32])
                cropped = cardinal_layer_window(3, 2, values, code, 1, 0, 1, 1)
                self.assertEqual(cropped["rows"], [[rows[0][1]]])

    def test_noncardinal_invalid_or_outside_cannot_create_layer_values(self):
        for code in (1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15):
            unresolved = cardinal_local_position(3, 2, 0, 0, code)
            self.assertEqual(
                unresolved["status"], "noncardinal_local_position_unresolved")
            self.assertNotIn("originalFlatIndex", unresolved)
            self.assertFalse(unresolved["nativeCardinalPositionTransformVerified"])
            data = cardinal_layer_window(
                3, 2, [0] * 6, code, 0, 0, 1, 1)
            self.assertNotIn("rows", data)
            self.assertFalse(data["placementLegalityVerified"])
        for code, x, y in ((0, -1, 0), (4, 2, 0), (8, 3, 0),
                           (12, 0, 3), (8, 0, -1)):
            outside = cardinal_local_position(3, 2, x, y, code)
            self.assertFalse(outside["inside"])
            self.assertEqual(outside["status"], "outside_original_gridarea")
            self.assertNotIn("originalFlatIndex", outside)
        for bad in ((3, 2, 0, 0, 16), (3, 2, 0, 0, -1),
                    (3, 2, False, 0, 8), (3, 2, 0.5, 0, 8),
                    (3, 2, 2**31, 0, 8), (0, 2, 0, 0, 8)):
            with self.assertRaises(ValueError):
                cardinal_local_position(*bad)
        with self.assertRaisesRegex(ValueError, "window outside"):
            cardinal_layer_window(3, 2, [0] * 6, 4, 0, 0, 3, 1)


if __name__ == "__main__":
    unittest.main()
