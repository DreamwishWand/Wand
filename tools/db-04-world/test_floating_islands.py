"""Synthetic-only regression cases for original FloatingIslands source envelopes."""
import hashlib
import unittest
from pathlib import Path

from world import (encode_varint, floating_island_grid_collection_layout,
                   grid_collection_layout, realm_grid_collection_layout)

BASE = Path("ddv_Data/StreamingAssets")
LAYOUT = BASE / "SceneLayouts/FloatingIslands/FloatingIsland_Meadow/FloatingIsland_MeadowLayout.json"
CUSTOM = "SceneLayouts/FloatingIslands/FloatingIsland_Meadow/CustomLocations.json"
GRID = "GridData/FloatingIslands/FloatingIsland_Meadow/FloatingIsland_MeadowGrid-GridData.json"


def field(number, data):
    if type(data) is int:
        return encode_varint(number << 3) + encode_varint(data)
    blob = data.encode("utf-8") if isinstance(data, str) else bytes(data)
    return (encode_varint((number << 3) | 2) +
            encode_varint(len(blob)) + blob)


def direct_collection(path=GRID):
    item = (field(1, 9) + field(2, 40000123) + field(3, 12) +
            field(4, 6) + field(5, 12) + field(6, b"test"))
    object_entry = field(1, 9) + field(2, item)
    native_grid = (field(1, 3) + field(2, path) + field(4, 1) +
                   field(5, object_entry) + field(6, 10))
    return field(1, field(1, 3) + field(2, native_grid)) + field(3, 1)


def wrapped(custom=CUSTOM, collection=None):
    if collection is None:
        collection = direct_collection()
    return field(1, field(4, custom)) + field(2, collection)


class FloatingIslandSourceTests(unittest.TestCase):
    def test_source_native_embedded_grid_collection_and_grid_local_object(self):
        raw = wrapped()
        self.assertIsNone(grid_collection_layout(raw, LAYOUT))
        self.assertIsNone(realm_grid_collection_layout(raw, LAYOUT))
        layout, objects = floating_island_grid_collection_layout(raw, LAYOUT)
        self.assertEqual(layout["layoutKind"], "nativeGridCollection")
        self.assertEqual(layout["embeddedGridCollectionWireField"], 2)
        self.assertEqual(layout["floatingIslandCustomLocationPath"], CUSTOM)
        self.assertEqual(layout["source"]["nativeType"],
                         "floating_island_source_with_embedded_Meta.GridCollection")
        self.assertEqual(layout["gridReferences"],
                         [{"path": GRID, "wireField": "2.1.2.2"}])
        self.assertEqual(layout["defaultObjectCount"], 1)
        self.assertEqual(layout["nativeGridEntries"][0]["gridIdNative"], 3)
        self.assertEqual(layout["nativeGridEntries"][0]["nextGridObjectIdNative"], 10)
        self.assertEqual(len(objects), 1)
        obj = objects[0]
        self.assertEqual(obj["itemId"], 40000123)
        self.assertEqual((obj["x"], obj["y"]), (12, 6))
        self.assertEqual(obj["orientationName"], "Left")
        self.assertEqual(obj["stateSha256"],
                         hashlib.sha256(b"test").hexdigest())
        self.assertFalse(obj["worldCoordinatesVerified"])
        self.assertFalse(layout["worldCoordinatesVerified"])
        self.assertFalse(layout["fixedObjectsVerified"])

    def test_exact_context_path_required_not_just_prefix(self):
        for bad in ("SceneLayouts/FloatingIslands/Other/CustomLocations.json",
                    "SceneLayouts/FloatingIslands/../CustomLocations.json",
                    "SceneLayouts/OffGridBuildings/Other/CustomLocations.json"):
            with self.subTest(custom=bad):
                with self.assertRaisesRegex(ValueError, "path mismatch"):
                    floating_island_grid_collection_layout(wrapped(bad), LAYOUT)
        # Invalid outer data must not silently generate a "verified" layout.
        with self.assertRaises(ValueError):
            floating_island_grid_collection_layout(
                field(1, field(4, CUSTOM)) + field(2, b"broken"), LAYOUT)

    def test_source_path_literal_preserves_game_typo(self):
        # The Steam original uses FloatingIlsnad_Desert in GridData paths.
        desert = BASE / ("SceneLayouts/FloatingIslands/FloatingIsland_Desert/"
                         "FloatingIsland_DesertLayout.json")
        custom = ("SceneLayouts/FloatingIslands/FloatingIsland_Desert/"
                  "CustomLocations.json")
        literal = ("GridData/FloatingIslands/FloatingIlsnad_Desert/"
                   "FloatingIsland_DesertGrid-GridData.json")
        layout, _ = floating_island_grid_collection_layout(
            wrapped(custom, direct_collection(literal)), desert)
        self.assertEqual(layout["nativeGridEntries"][0]["gridDataPath"], literal)
        self.assertEqual(layout["gridReferences"][0]["path"], literal)

    def test_unrelated_sources_not_interpreted_as_floating_islands(self):
        self.assertIsNone(floating_island_grid_collection_layout(
            wrapped(), BASE / "SceneLayouts/Realms/SomeRealm/Layout.json"))
        self.assertIsNone(floating_island_grid_collection_layout(
            b"", BASE / "SceneLayouts/FloatingIslands/FloatingIsland_Meadow/"
                  "CustomLocations.json"))
        # Valid direct Meta.GridCollection still uses the existing reader.
        self.assertIsNone(floating_island_grid_collection_layout(
            direct_collection(), LAYOUT))
        self.assertIsNotNone(grid_collection_layout(direct_collection(), LAYOUT))


if __name__ == "__main__":
    unittest.main()
