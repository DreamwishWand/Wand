"""Synthetic-only native House/Room source regression tests.

All fixtures are invented protobuf-wire messages. Do not commit game bytes.
"""
import hashlib
import unittest
from pathlib import Path

from world import (STREAM, encode_varint, grid_collection_layout,
                   interior_grid_collection_layout)


def field(number, value):
    if type(value) is int:
        return encode_varint(number << 3) + encode_varint(value)
    data = value.encode("utf-8") if isinstance(value, str) else bytes(value)
    return (encode_varint((number << 3) | 2) +
            encode_varint(len(data)) + data)


def grid_collection(path="GridData/Rooms/Room20x20-GridData.json"):
    state = b"synthetic-room-state"
    grid_object = (field(1, 7) + field(2, 40000123) +
                   field(3, 5) + field(4, 6) + field(5, 0) +
                   field(6, state))
    objects = field(5, field(1, 7) + field(2, grid_object))
    grid = (field(1, 13) + field(2, path) + field(4, 1) +
            objects + field(6, 8))
    return field(1, field(1, 13) + field(2, grid)) + field(3, 1)


def house_wrap(context=None, embedded=None):
    if context is None:
        context = field(3, field(1, 1)) + field(5, 160100000)
    if embedded is None:
        embedded = grid_collection()
    return field(1, context) + field(2, embedded)


class InteriorSourceTests(unittest.TestCase):
    def test_house_opaque_context_and_source_native_grid_object(self):
        location = (STREAM / "SceneLayouts/Houses/MickeyHouse/MickeyHouse.json")
        context = field(3, field(1, 1)) + field(5, 160100000)
        raw = house_wrap(context=context)
        self.assertIsNone(grid_collection_layout(raw, location))
        layout, objects = interior_grid_collection_layout(raw, location)
        self.assertEqual(layout["layoutKind"], "nativeGridCollection")
        self.assertEqual(layout["layoutId"],
                         "SceneLayouts/Houses/MickeyHouse/MickeyHouse.json")
        self.assertEqual(layout["embeddedGridCollectionWireField"], 2)
        self.assertEqual(layout["unparsedInteriorContextSha256"],
                         hashlib.sha256(context).hexdigest())
        self.assertEqual(layout["source"]["nativeType"],
                         "interior_source_with_embedded_Meta.GridCollection")
        self.assertEqual(layout["gridReferences"], [{
            "path": "GridData/Rooms/Room20x20-GridData.json",
            "wireField": "2.1.2.2"}])
        self.assertEqual(layout["defaultObjectCount"], 1)
        self.assertEqual(layout["nativeGridEntries"][0]["gridIdNative"], 13)
        self.assertEqual(layout["nativeGridEntries"][0]
                         ["nextGridObjectIdNative"], 8)
        self.assertEqual(len(objects), 1)
        self.assertEqual(objects[0]["gridObjectIdNative"], 7)
        self.assertEqual(objects[0]["gridIdNative"], 13)
        self.assertEqual(objects[0]["itemId"], 40000123)
        self.assertEqual((objects[0]["x"], objects[0]["y"]), (5, 6))
        self.assertEqual(objects[0]["stateSha256"],
                         hashlib.sha256(b"synthetic-room-state").hexdigest())
        self.assertEqual(objects[0]["positionBasis"], "nativeGridLocal")
        self.assertFalse(objects[0]["worldCoordinatesVerified"])
        self.assertFalse(layout["worldCoordinatesVerified"])
        self.assertFalse(layout["fixedObjectsVerified"])

    def test_player_house_uses_same_envelope_without_fabricated_settings(self):
        location = (STREAM / "SceneLayouts/Houses/"
                    "PlayerHouse-Additional-1_DefaultLayout.json")
        context = field(1, field(1, 4)) + field(1, field(1, 9))
        layout, objects = interior_grid_collection_layout(
            house_wrap(context=context), location)
        self.assertEqual(layout["unparsedInteriorContextSha256"],
                         hashlib.sha256(context).hexdigest())
        self.assertEqual(len(objects), 1)
        self.assertNotIn("worldTransform", layout)
        self.assertNotIn("placementPermission", layout)

    def test_wrapped_boutique_and_direct_scrooge_have_distinct_parsers(self):
        boutique = STREAM / "SceneLayouts/Rooms/Boutique/Boutique-DefaultLayout.json"
        context = field(1, field(1, 1)) + field(2, field(3, 4))
        parsed = interior_grid_collection_layout(
            house_wrap(context=context), boutique)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed[0]["gridReferences"][0]["wireField"],
                         "2.1.2.2")
        scrooge = (STREAM /
                   "SceneLayouts/Rooms/ScroogeShop/ScroogeShop_DefaultLayout.json")
        direct = grid_collection(path="GridData/Rooms/ScroogeShop-GridData.json")
        self.assertIsNone(interior_grid_collection_layout(direct, scrooge))
        self.assertEqual(grid_collection_layout(direct, scrooge)[0]
                         ["gridReferences"][0]["wireField"], "1.2.2")

    def test_unrelated_or_custom_location_sources_are_not_reinterpreted(self):
        raw = house_wrap()
        for path in (
            "SceneLayouts/FloatingIslands/FloatingIsland_Meadow/FloatingIsland_MeadowLayout.json",
            "SceneLayouts/OffGridBuildings/Castle/Castle-DefaultLayout.json",
            "SceneLayouts/Realms/Moana/MoanaLayout.json",
            "SceneLayouts/Houses/MickeyHouse/CustomLocations.json",
            "SceneLayouts/Rooms/Boutique/CustomLocations.json",
        ):
            with self.subTest(path=path):
                self.assertIsNone(interior_grid_collection_layout(
                    raw, STREAM / path))

    def test_bad_native_interior_wrapper_fails_closed(self):
        path = STREAM / "SceneLayouts/Houses/MickeyHouse/MickeyHouse.json"
        raw = house_wrap()
        with self.assertRaisesRegex(ValueError, "unexpected native interior"):
            interior_grid_collection_layout(raw + field(9, 3), path)
        with self.assertRaises(ValueError):
            interior_grid_collection_layout(
                field(1, field(3, 1)) + field(2, b"not a collection"), path)
        with self.assertRaises(ValueError):
            interior_grid_collection_layout(
                field(1, field(3, 1)) + field(1, field(3, 2)) +
                field(2, grid_collection()), path)
        # A safe-looking item path does NOT establish that the original
        # GridData is actually present; bundle reference validation decides.
        self.assertIsNone(interior_grid_collection_layout(
            b"", STREAM / "SceneLayouts/Rooms/ScroogeShop/CustomLocations.json"))


if __name__ == "__main__":
    unittest.main()
