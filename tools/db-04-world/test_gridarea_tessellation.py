"""Synthetic-only tests of source item GridArea vs explicit caller grid factor."""
import unittest
import tempfile
from pathlib import Path

from gridarea_tessellation import (
    DLL_SHA256, SOURCE_METHODS, GETGRIDAREA_UNWIND, TRYGET_UNWIND,
    gridarea_scaled_source_cell, gridarea_scaled_layer_window,
    verify_original_item_gridarea_tessellation,
)
from gridarea_cardinal_local import cardinal_layer_window
from gridarea_oblique_local import oblique_layer_window


class OriginalItemTessellationTests(unittest.TestCase):
    def test_original_factory_and_transform_source_identity_pins(self):
        self.assertEqual(len(DLL_SHA256), 64)
        self.assertEqual(SOURCE_METHODS[0][0], "GridAreaData.GetGridArea")
        self.assertEqual(SOURCE_METHODS[0][1:3], (0x38FA210, 0x38FA37A))
        self.assertEqual(SOURCE_METHODS[1][1:3], (0x3923550, 0x392355B))
        self.assertEqual(SOURCE_METHODS[2][1:3], (0x3923560, 0x392356A))
        self.assertEqual(len(GETGRIDAREA_UNWIND), 3)
        self.assertEqual(len(TRYGET_UNWIND), 3)
        for entries in (GETGRIDAREA_UNWIND, TRYGET_UNWIND):
            for i in range(len(entries) - 1):
                self.assertEqual(entries[i][1], entries[i+1][0])
        # Original sources are private, never bundled in the public suite.
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / "GameAssembly.dll"
            fake.write_bytes(b"not an original game DLL")
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                verify_original_item_gridarea_tessellation(fake)

    def test_all_sixteen_factor_one_matches_existing_source_mappings(self):
        layers = [11, 12, 21, 22, 31, 32]
        for code in range(16):
            with self.subTest(orientation=code):
                reference = (
                    cardinal_layer_window(3, 2, layers, code, 0, 0,
                                          2 if code in (4,12) else 3,
                                          3 if code in (4,12) else 2)
                    if code in (0,4,8,12) else
                    oblique_layer_window(3, 2, layers, code, 0, 0,
                                         3 if code in (1,2,6,7,9,10,14,15) else 2,
                                         3 if code in (2,6,10,14) else
                                         2 if code in (1,7,9,15) else 3)
                )
                width = len(reference["rows"][0])
                height = len(reference["rows"])
                actual = gridarea_scaled_layer_window(
                    3, 2, layers, code, 1, 0, 0, width, height)
                self.assertEqual(actual["rows"], reference["rows"])
                self.assertTrue(actual["nativeTessellationCoordinateConversionVerified"])
                self.assertFalse(actual["callerGridFactorProvenanceVerified"])
                self.assertFalse(actual["occupancyPredicateVerified"])
                self.assertFalse(actual["placementLegalityVerified"])

    def test_explicit_factor_two_replication_cardinal_and_noncardinal(self):
        original = [11, 12, 21, 22, 31, 32]
        for code, baseline in (
            (8, [[11,21,31],[12,22,32]]),
            (0, [[32,22,12],[31,21,11]]),
            (4, [[12,11],[22,21],[32,31]]),
            (12, [[31,32],[21,22],[11,12]]),
            (2, [[None,12,12],[32,22,11],[32,31,None]]),
            (6, [[12,11,None],[12,22,31],[None,32,32]]),
        ):
            with self.subTest(orientation=code):
                expect = [[value for value in row for _ in range(2)]
                          for row in baseline for _ in range(2)]
                result = gridarea_scaled_layer_window(
                    3, 2, original, code, 2, 0, 0,
                    len(expect[0]), len(expect))
                self.assertEqual(result["rows"], expect)
                self.assertEqual(result["orientedSizeX"], len(expect[0]))
                self.assertEqual(result["orientedSizeY"], len(expect))
                self.assertEqual(result["callerGridTessellationFactor"], 2)
                self.assertEqual(result["itemAreaTessellationFactorSourceValue"], 1)
                self.assertFalse(result["callerGridFactorProvenanceVerified"])
                self.assertFalse(result["placementLegalityVerified"])
                self.assertEqual(result["unmappedOutputCellCount"],
                                 sum(value is None for row in expect for value in row))

    def test_factor_three_uses_integer_division_before_rotation(self):
        raw = [11, 12, 21, 22, 31, 32]
        matrix = gridarea_scaled_layer_window(
            3, 2, raw, 8, 3, 0, 0, 9, 6)
        self.assertEqual(matrix["rows"][0][:6], [11,11,11,21,21,21])
        self.assertEqual(matrix["rows"][2][3:6], [21,21,21])
        self.assertEqual(matrix["rows"][3][3:6], [22,22,22])
        mapped = gridarea_scaled_source_cell(3, 2, 3, 5, 8, 3)
        self.assertEqual((mapped["normalizedInputX"],
                          mapped["normalizedInputY"]), (1,1))
        self.assertEqual(mapped["originalFlatIndex"], 3)
        self.assertEqual((mapped["orientedSizeX"],
                          mapped["orientedSizeY"]), (9,6))
        self.assertTrue(mapped["callerGridFactorExplicitlyProvided"])
        self.assertFalse(mapped["gridObjectAnchorVerified"])

    def test_no_outside_or_invalid_factor_may_fabricate_layer(self):
        for factor in (0, -1, 257, True, 0.5):
            with self.assertRaisesRegex(ValueError, "factor"):
                gridarea_scaled_source_cell(3, 2, 0, 0, 8, factor)
        for args in ((3,2,0,0,16,1), (3,2,0,0,-1,1),
                     (3,2,True,0,8,1), (3,2,2**31,0,8,1)):
            with self.assertRaises(ValueError):
                gridarea_scaled_source_cell(*args)
        for xy in ((-1,0), (0,-1), (6,0), (0,4)):
            point = gridarea_scaled_source_cell(3,2,*xy,8,2)
            self.assertFalse(point["inside"])
            self.assertNotIn("originalFlatIndex", point)
            self.assertFalse(point["placementLegalityVerified"])
        with self.assertRaisesRegex(ValueError, "viewport outside"):
            gridarea_scaled_layer_window(3,2,[0]*6,8,2,5,0,2,1)
        with self.assertRaisesRegex(ValueError, "fixed32"):
            gridarea_scaled_layer_window(3,2,[1]*5,8,2,0,0,2,2)


if __name__ == "__main__":
    unittest.main()
