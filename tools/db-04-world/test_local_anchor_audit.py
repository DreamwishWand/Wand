"""Synthetic-only tests for source-local anchor envelopes (not placement rules)."""
import unittest
from local_anchor_audit import audit_anchor_envelopes


def source(factor=2, path="GridData/Rooms/Example.json"):
    return ([{"layoutId": "SceneLayouts/Rooms/Example.json",
              "layoutKind": "nativeGridCollection",
              "nativeGridEntries": [{"gridIdNative": 0,
                                     "gridDataPath": path,
                                     "tessellationFactor": factor}]}],
            [{"gridId": path, "sizeX": 12, "sizeY": 8}])


def anchor(x, y):
    return {"layoutId": "SceneLayouts/Rooms/Example.json",
            "gridIdNative": 0, "x": x, "y": y}


class AuditEnvelopeTests(unittest.TestCase):
    def test_factor_two_extends_native_coordinate_envelope_not_permissions(self):
        layouts, grids = source(2)
        report = audit_anchor_envelopes(
            layouts, grids, [anchor(11, 7), anchor(23, 15), anchor(24, 15)])
        self.assertEqual(report["counts"], {
            "anchorsExamined": 3, "withinRawDimensions": 1,
            "outsideRawWithinTessellationEnvelope": 1,
            "outsideTessellationEnvelope": 1,
            "missingGridOriginal": 0, "unknownNativeDimensionsOrFactor": 0})
        self.assertFalse(report["nativeWorldTransformVerified"])
        self.assertFalse(report["placementLegalityVerified"])
        self.assertTrue(report["coordinateEnvelopeIsNotEditPermission"])

    def test_factor_one_and_zero_coordinates(self):
        layouts, grids = source(1)
        counts = audit_anchor_envelopes(
            layouts, grids, [anchor(0, 0), anchor(11, 7), anchor(12, 7)])
        self.assertEqual(counts["counts"]["withinRawDimensions"], 2)
        self.assertEqual(counts["counts"]["outsideTessellationEnvelope"], 1)

    def test_absent_grid_and_unknown_factor_not_placement_permission(self):
        layouts, grids = source(2)
        missing = audit_anchor_envelopes(layouts, [], [anchor(1, 1)])
        self.assertEqual(missing["counts"]["missingGridOriginal"], 1)
        layouts[0]["nativeGridEntries"][0]["tessellationFactor"] = 0
        unknown = audit_anchor_envelopes(layouts, grids, [anchor(1, 1)])
        self.assertEqual(
            unknown["counts"]["unknownNativeDimensionsOrFactor"], 1)

    def test_layout_identity_is_essential_when_native_ids_repeat(self):
        layouts, grids = source(2)
        layouts.append({"layoutId": "SceneLayouts/Rooms/Other.json",
                        "layoutKind": "nativeGridCollection",
                        "nativeGridEntries": [{"gridIdNative": 0,
                                              "gridDataPath": grids[0]["gridId"],
                                              "tessellationFactor": 1}]})
        anchors = [anchor(23, 15),
                   {"layoutId": "SceneLayouts/Rooms/Other.json",
                    "gridIdNative": 0, "x": 23, "y": 15}]
        counts = audit_anchor_envelopes(layouts, grids, anchors)["counts"]
        self.assertEqual(counts["outsideRawWithinTessellationEnvelope"], 1)
        self.assertEqual(counts["outsideTessellationEnvelope"], 1)

    def test_duplicate_identity_and_invalid_anchor_rejected(self):
        layouts, grids = source()
        with self.assertRaisesRegex(ValueError, "duplicate layoutId"):
            audit_anchor_envelopes(layouts * 2, grids, [])
        with self.assertRaisesRegex(ValueError, "invalid source-local anchor"):
            audit_anchor_envelopes(layouts, grids, [anchor(False, 2)])
        with self.assertRaisesRegex(ValueError, "absent layout-native"):
            audit_anchor_envelopes(
                layouts, grids, [{**anchor(2, 2), "gridIdNative": 2}])


if __name__ == "__main__":
    unittest.main()
