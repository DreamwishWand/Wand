"""Synthetic-only regression for source PE64 oblique GridArea cell mapping."""
import unittest

from gridarea_oblique_local import (
    SOURCE_RVA, SOURCE_END, SOURCE_SHA256, OBLIQUE,
    oblique_local_position, oblique_layer_window,
)


class NativeObliqueAreaLocalTests(unittest.TestCase):
    def test_original_pe_function_identity_and_all_twelve_orientations(self):
        self.assertEqual(SOURCE_RVA, 0x3923D80)
        self.assertEqual(SOURCE_END - SOURCE_RVA, 603)
        self.assertEqual(SOURCE_SHA256,
            "befff8088fb717e1cef8501fb9c66b956f4e54fff24e8067a325ed493477ad9b")
        self.assertEqual(OBLIQUE, (1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15))
        expected = {
            1: [[32, 22, 12], [31, 21, 11]],
            2: [[None, 12, 12], [32, 22, 11], [32, 31, None]],
            3: [[12, 11], [22, 21], [32, 31]],
            5: [[12, 11], [22, 21], [32, 31]],
            6: [[12, 11, None], [12, 22, 31], [None, 32, 32]],
            7: [[11, 21, 31], [12, 22, 32]],
            9: [[11, 21, 31], [12, 22, 32]],
            10: [[None, 31, 32], [11, 22, 32], [12, 12, None]],
            11: [[31, 32], [21, 22], [11, 12]],
            13: [[31, 32], [21, 22], [11, 12]],
            14: [[32, 32, None], [31, 22, 12], [None, 11, 12]],
            15: [[32, 22, 12], [31, 21, 11]],
        }
        original = [11, 12, 21, 22, 31, 32]
        for code, rows in expected.items():
            with self.subTest(orientation=code):
                output = oblique_layer_window(
                    3, 2, original, code, 0, 0, len(rows[0]), len(rows))
                self.assertEqual(output["rows"], rows)
                self.assertEqual(output["unmappedOutputCellCount"],
                                 sum(v is None for row in rows for v in row))
                self.assertTrue(output["nativeNoncardinalPositionTransformVerified"])
                self.assertFalse(output["fullNativeTessellationScalingApplied"])
                self.assertFalse(output["gridObjectAnchorVerified"])
                self.assertFalse(output["occupancyPredicateVerified"])
                self.assertFalse(output["placementLegalityVerified"])
                for y, row in enumerate(rows):
                    for x, value in enumerate(row):
                        source = oblique_local_position(3, 2, x, y, code)
                        if value is None:
                            self.assertFalse(source["inside"])
                            self.assertNotIn("originalFlatIndex", source)
                        else:
                            self.assertTrue(source["inside"])
                            self.assertEqual(
                                original[source["originalFlatIndex"]], value)
                output["rows"][0][0] = 999
                self.assertEqual(original, [11, 12, 21, 22, 31, 32])

    def test_cell_center_and_integer_truncation_can_map_multiple_cells(self):
        case = oblique_layer_window(
            5, 4, list(range(20)), 2, 0, 0, 6, 6)
        self.assertEqual((case["orientedSizeX"], case["orientedSizeY"]), (6, 6))
        self.assertEqual(case["unmappedOutputCellCount"], 18)
        self.assertEqual(sum(x is not None for row in case["rows"] for x in row), 18)
        # Exactly native 100*x+50 centre, not Math.round()/floating trig.
        self.assertEqual(oblique_local_position(
            3, 2, 1, 0, 2)["originalFlatIndex"], 1)
        self.assertEqual(oblique_local_position(
            3, 2, 2, 0, 2)["originalFlatIndex"], 1)

    def test_unmapped_is_not_an_unoccupied_grid_cell(self):
        point = oblique_local_position(3, 2, 0, 0, 2)
        self.assertEqual(point["status"], "outside_original_gridarea")
        self.assertFalse(point["inside"])
        self.assertNotIn("originalFlatIndex", point)
        self.assertTrue(point["rawLayerValuesNotOccupancy"])
        self.assertFalse(point["occupancyPredicateVerified"])
        self.assertFalse(point["placementLegalityVerified"])

    def test_bounds_and_cardinal_rejections(self):
        for a in ((3, 2, -1, 0, 2), (3, 2, 3, 0, 2),
                  (3, 2, 0, 3, 2)):
            r = oblique_local_position(*a)
            self.assertFalse(r["inside"])
        for a in ((0, 2, 0, 0, 2), (3, 2, 0, 0, 0),
                  (3, 2, 0, 0, 4), (3, 2, 0, 0, 8),
                  (3, 2, 0, 0, 12), (3, 2, 0, 0, 16),
                  (3, 2, False, 0, 2), (3, 2, 1.2, 0, 2)):
            with self.assertRaises(ValueError):
                oblique_local_position(*a)
        with self.assertRaisesRegex(ValueError, "outside bounds"):
            oblique_layer_window(3, 2, [1]*6, 2, 1, 0, 3, 1)
        with self.assertRaisesRegex(ValueError, "noncardinal"):
            oblique_layer_window(3, 2, [1]*6, 0, 0, 0, 1, 1)


if __name__ == "__main__":
    unittest.main()
