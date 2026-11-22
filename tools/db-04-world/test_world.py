import base64
import hashlib
import json
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

from audit_footprint_candidates import audit_footprint_candidates
from footprint_hypotheses import (
    candidate_layer_cells, projection_hypotheses, validate_footprint,
    native_gridarea_layer_at, native_gridarea_layer_window,
    native_gridarea_cardinal_dimensions)
from audit_layout_terrain import audit_snapshot
from native_pe_evidence import (
    capture_native_pe, file_offset_for_rva, pe64_sections,
    target_methods_from_dump, validate_private_report, write_private_report,
)
from pe_unwind import correlate_rvas, read_pe_runtime_functions
from disassemble_native_pe import (
    disassemble_private_windows, write_private_disassembly,
)
from package_snapshot import package_snapshot
from verify_bundle import checked_footprint, checked_grid, validate_snapshot
from terrain_codec import (describe_native_packing, floor_at, decode_window,
                           count_packed_palette_indices, EVIDENCE)

from world import (STREAM, diff_records, encode_varint, explicit_references,
                   extract, footprint, parse_grid_structure, parse_itemlist,
                   parse_world_registry, grid_collection_layout,
                   realm_grid_collection_layout, offgrid_grid_collection_layout,
                   default_village_layout,
                   restrictions, wire_fields)


def field(number, value, wire=None):
    if wire is None:
        wire = 0 if type(value) is int else 2
    if wire == 0:
        return encode_varint(number << 3) + encode_varint(value)
    if wire == 2:
        raw = value.encode("utf-8") if isinstance(value, str) else bytes(value)
        return encode_varint((number << 3) | 2) + encode_varint(len(raw)) + raw
    raise ValueError("test wire type")


def indexed(base, offset, name, grid=None, extra=b""):
    native_id = base + offset
    item = field(1, native_id) + field(2, name) + field(3, "test." + name)
    if grid is not None:
        item += field(6, grid)
    return encode_varint(offset) + encode_varint(len(item + extra)) + item + extra


def grid(x, y, cells, floor=2048):
    return (field(1, x) + field(2, y) +
            field(3, struct.pack("<" + "I" * len(cells), *cells)) +
            field(4, floor))


class NativeWireTests(unittest.TestCase):
    def test_native_index_and_grid_values(self):
        raw = indexed(40000000, 10, "TestChair", grid(2, 2, [68, 68, 0, 76]))
        records = parse_itemlist(raw, "Furniture")
        self.assertEqual(list(records), [40000010])
        cells = footprint(records[40000010][0])
        self.assertEqual((cells["sizeX"], cells["sizeY"]), (2, 2))
        self.assertEqual(cells["layerValues"], [68, 68, 0, 76])
        self.assertEqual(cells["acceptedFloorTypesFlag"], 2048)
        self.assertFalse(cells["cellIndexToXYVerified"])
        self.assertFalse(cells["layerMaskSemanticsVerified"])

    def test_original_nullable_stride_override_wire5_preserves_absence_and_zero(self):
        def native_stride(payload=None):
            shape = grid(2, 2, [1, 2, 4, 8])
            if payload is not None:
                shape += field(5, payload)
            raw = indexed(40000000, 12, "TestWithStride", shape)
            return footprint(parse_itemlist(raw, "Furniture")[40000012][0])

        absent = native_stride()
        self.assertIsNone(absent["strideOverride"])
        self.assertFalse(absent["strideOverrideSourceVerified"])
        self.assertNotIn("strideOverride", absent["nativeWireFields"])
        checked_footprint({"itemId": 40000012, "footprint": absent})
        for value in (1, 2, 3, 4):
            stride = native_stride(field(1, value))
            self.assertEqual(stride["strideOverride"], value)
            self.assertTrue(stride["strideOverrideSourceVerified"])
            self.assertEqual(stride["nativeWireFields"]["strideOverride"], "6.5")
            self.assertFalse(stride["strideOverridePlacementSemanticsVerified"])
            checked_footprint({"itemId": 40000012, "footprint": stride})

        # Nullable<int> explicit 0 is a length-zero wrapper, NOT null.
        zero = native_stride(b"")
        self.assertEqual(zero["strideOverride"], 0)
        self.assertTrue(zero["strideOverrideSourceVerified"])
        negative = native_stride(field(1, 0xffffffff))
        self.assertEqual(negative["strideOverride"], -1)
        self.assertFalse(negative["strideOverridePlacementSemanticsVerified"])

        bad_wrappers = (
            field(1, 1) + field(1, 2),  # duplicate nested value
            field(2, 1),                 # unsupported nested field
            field(1, 0x100000000),      # invalid int32 representation
        )
        for raw in bad_wrappers:
            with self.assertRaises(ValueError):
                native_stride(raw)
        malformed = grid(2, 2, [1, 2, 4, 8]) + field(5, 3, wire=0)
        raw = indexed(40000000, 13, "WrongStrideWire", malformed)
        with self.assertRaisesRegex(ValueError, "wrong-wire"):
            footprint(parse_itemlist(raw, "Furniture")[40000013][0])

        # Even if a manifest hash is recomputed, it cannot promote a
        # source-null stride to a claimed explicit positive value.
        forged = dict(absent, strideOverride=2)
        with self.assertRaisesRegex(ValueError, "stride override evidence"):
            checked_footprint({"itemId": 40000012, "footprint": forged})
        forged = dict(absent, strideOverrideSourceVerified=True)
        with self.assertRaisesRegex(ValueError, "stride override evidence"):
            checked_footprint({"itemId": 40000012, "footprint": forged})

    def test_source_literal_json_griddata_is_read_only_not_protobuf(self):
        # Matches the *structure* of Steam 1.26.2 original Village04
        # BlockSpawn sources. These are explicit arrays, not bit-packed bytes.
        document = {
            "SizeX": 2, "SizeY": 3,
            "FloorTypes": [0, 262144, 4, 262148, 512, 262656],
        }
        raw = json.dumps(document).encode("utf-8")
        grid = parse_grid_structure(raw, source_game_version="1.26.2")
        self.assertEqual(grid["sizeX"], 2)
        self.assertEqual(grid["sizeY"], 3)
        self.assertEqual(grid["nativeFloorTypes"], document["FloorTypes"])
        self.assertEqual(grid["nativeSourceFormat"],
                         "original_json_direct_floor_values")
        self.assertEqual(grid["nativeFloorTypePalette"], [])
        self.assertIsNone(grid["compactedFloorTypesBase64"])
        self.assertIsNone(grid["nativePaletteIndexCellCounts"])
        self.assertTrue(grid["terrainDecoding"]["decoded"])
        self.assertEqual(grid["terrainDecoding"]["packing"],
                         "x_major_direct_floor_values")
        self.assertFalse(grid["terrainDecoding"]["placementLegalityVerified"])
        checked_grid(grid, source_game_version="1.26.2")

        forged = dict(grid, nativeFloorTypes=[0] * 6)
        with self.assertRaisesRegex(ValueError, "index evidence"):
            checked_grid(dict(forged,
                terrainDecoding={"status":"forged","decoded":True}),
                source_game_version="1.26.2")
        with self.assertRaisesRegex(ValueError, "original JSON GridData evidence"):
            checked_grid(dict(grid, compactedFloorTypesBase64="AAA="),
                         source_game_version="1.26.2")
        # Do not reinterpret future game builds using old getter/axis proof.
        future = parse_grid_structure(raw, source_game_version="1.27.0")
        self.assertFalse(future["terrainDecoding"]["decoded"])
        checked_grid(future, source_game_version="1.27.0")
        with self.assertRaisesRegex(ValueError, "index evidence"):
            checked_grid(grid, source_game_version="1.27.0")

    def test_original_steam1262_direct_json_can_have_empty_compacted_fields(self):
        # Original Expansion02/MythDungeon GridData can preserve BOTH optional
        # compressed fields, explicitly empty, alongside direct uint32 floors.
        # The empties do not activate a competing terrain representation.
        base = {"SizeX": 2, "SizeY": 3,
                "FloorTypes": [0, 1024, 1024, 0, 0, 1024]}
        extended = dict(base, CompactedFloorTypeIndex=[],
                        CompactedFloorTypes="")
        original = parse_grid_structure(
            json.dumps(base).encode("utf-8"), source_game_version="1.26.2")
        with_empties = parse_grid_structure(
            json.dumps(extended).encode("utf-8"), source_game_version="1.26.2")
        self.assertEqual(with_empties, original)
        self.assertTrue(with_empties["terrainDecoding"]["decoded"])
        checked_grid(with_empties, source_game_version="1.26.2")
        future = parse_grid_structure(
            json.dumps(extended).encode("utf-8"), source_game_version="1.27.0")
        self.assertFalse(future["terrainDecoding"]["decoded"])
        checked_grid(future, source_game_version="1.27.0")

        invalid = (
            dict(base, CompactedFloorTypeIndex=[]),
            dict(base, CompactedFloorTypes=""),
            dict(base, CompactedFloorTypeIndex=[0], CompactedFloorTypes=""),
            dict(base, CompactedFloorTypeIndex=[], CompactedFloorTypes="AA=="),
            dict(base, CompactedFloorTypeIndex=None, CompactedFloorTypes=""),
            dict(base, CompactedFloorTypeIndex=[], CompactedFloorTypes=None),
            dict(base, CompactedFloorTypeIndex=[], CompactedFloorTypes="", Extra=1),
        )
        for item in invalid:
            with self.subTest(keys=item.keys(), extra=item.get("CompactedFloorTypes")):
                with self.assertRaises(ValueError):
                    parse_grid_structure(
                        json.dumps(item).encode("utf-8"),
                        source_game_version="1.26.2")

    def test_literal_json_griddata_rejects_malformed_native_source(self):
        for raw in (
            b'{"SizeX":2,"SizeX":2,"SizeY":1,"FloorTypes":[0,0]}',
            b'{"SizeX":2,"SizeY":2,"FloorTypes":[0]}',
            b'{"SizeX":1,"SizeY":1,"FloorTypes":[-1]}',
            b'{"SizeX":1,"SizeY":1,"FloorTypes":[4294967296]}',
            b'{"SizeX":1,"SizeY":1,"FloorTypes":[1],"Unknown":5}',
            b'{"SizeX":1,"SizeY":1,"FloorTypes":[NaN]}',
        ):
            with self.assertRaises(ValueError):
                parse_grid_structure(raw, source_game_version="1.26.2")

    def test_new_game_version_keeps_raw_packed_grid_without_native_index_claim(self):
        # Reuse synthetic bytes: only the Steam 1.26.1/1.26.2 native read paths have
        # been inspected; later-version GridData stays uninterpreted.
        packed = bytes((0x01, 0x23, 0x41, 0x03, 0x20))
        palette = [0, 8, 16, 32, 64]
        raw = (field(1, 3) + field(2, 3) +
               field(4, struct.pack("<" + "I" * len(palette), *palette)) +
               field(5, packed))
        current = parse_grid_structure(raw, source_game_version="1.27.0")
        self.assertEqual(current["sizeX"], 3)
        self.assertEqual(current["sizeY"], 3)
        self.assertEqual(current["nativeFloorTypePalette"], palette)
        self.assertEqual(current["compactedFloorTypesBase64"],
                         base64.b64encode(packed).decode("ascii"))
        self.assertEqual(current["nativeCompactedByteCount"], len(packed))
        self.assertIsNone(current["nativePaletteIndexCellCounts"])
        self.assertFalse(current["nativeFloorIndexToLocalXYCorroborated"])
        self.assertEqual(current["terrainDecoding"]["status"],
                         "native_packing_not_verified_for_game_version")
        self.assertFalse(current["terrainDecoding"]["decoded"])
        checked_grid(current, source_game_version="1.27.0")

        forged = dict(current, terrainDecoding=describe_native_packing(
            3, 3, palette, packed, source_game_version="1.26.1"))
        with self.assertRaisesRegex(ValueError, "evidence mismatches"):
            checked_grid(forged, source_game_version="1.27.0")
        forged_flag = dict(current, nativeFloorIndexToLocalXYCorroborated=True)
        with self.assertRaisesRegex(ValueError, "index proof flag"):
            checked_grid(forged_flag, source_game_version="1.27.0")
        # If a future game changes its packing, no earlier bit/padding
        # assumption may discard the raw input on import.
        future = parse_grid_structure(
            raw[:-1] + bytes((0xff,)), source_game_version="1.27.0")
        self.assertFalse(future["terrainDecoding"]["decoded"])
        self.assertIsNone(future["nativePaletteIndexCellCounts"])

    def test_steam1262_source_correlated_readonly_native_grid_and_histogram(self):
        # Steam 1.26.2 original getter + bit-width read paths were compared
        # against pinned 1.26.1 PE64 originals. Synthetic 4-bit bytes do
        # not constitute a claim about placement permissions or 3D geometry.
        packed = bytes((0x01, 0x23, 0x41, 0x03, 0x20))
        palette = [0, 8, 16, 32, 64]
        raw = (field(1, 3) + field(2, 3) +
               field(4, struct.pack("<" + "I" * len(palette), *palette)) +
               field(5, packed))
        record = parse_grid_structure(raw, source_game_version="1.26.2")
        self.assertTrue(record["terrainDecoding"]["decoded"])
        self.assertEqual(record["terrainDecoding"]["cellBits"], 4)
        self.assertIn("steam_1.26.2_pinned_native",
                      record["terrainDecoding"]["sampleBasedEncodingEvidence"])
        self.assertEqual(record["nativePaletteIndexCellCounts"], [2, 2, 2, 2, 1])
        self.assertTrue(record["nativeFloorIndexToLocalXYCorroborated"])
        self.assertFalse(record["terrainDecoding"]["placementLegalityVerified"])
        self.assertFalse(record["terrainDecoding"]["nativeCodeBodyVerified"])
        checked_grid(record, source_game_version="1.26.2")
        self.assertEqual(decode_window(
            3, 3, palette, packed, 0, 0, 3, 3,
            source_game_version="1.26.2"), [
                [0, 32, 0], [8, 64, 32], [16, 8, 16]])
        with self.assertRaisesRegex(ValueError, "evidence mismatches"):
            checked_grid(dict(record, terrainDecoding=describe_native_packing(
                3, 3, palette, packed, source_game_version="1.26.1")),
                source_game_version="1.26.2")

    def test_reject_invalid_grid_and_duplicate_record(self):
        record = indexed(40000000, 2, "Test", grid(2, 2, [1, 2]))
        parsed = parse_itemlist(record, "Furniture")
        with self.assertRaisesRegex(ValueError, "uint32"):
            footprint(parsed[40000002][0])
        with self.assertRaisesRegex(ValueError, "duplicate"):
            parse_itemlist(record + record, "Furniture")

    def test_frame_key_mismatch(self):
        item = field(1, 40000099) + field(2, "Something")
        raw = encode_varint(100) + encode_varint(len(item)) + item
        with self.assertRaisesRegex(ValueError, "mismatched"):
            parse_itemlist(raw, "Furniture")

    def test_reject_malformed_native_wire(self):
        with self.assertRaises(ValueError):
            wire_fields(b"\x0a\xff")
        with self.assertRaises(ValueError):
            wire_fields(b"\x08\x80\x00")

    def test_protodb_worlds_villages_and_explicit_area_relations(self):
        realm = (field(1, "Worlds!Example") +
                 field(20, 2000500001) +
                 field(21, "SceneLayouts/Realms/Example/Example.json") +
                 field(22, 1540000001))
        worlds = field(1, realm)
        villages = (field(1, "SceneLayouts/Village04/DefaultVillageLayout01.json") +
                    field(2, field(1, "SceneLayouts/Expansion01/Default.json") +
                          field(2, b"opaque_conditions")))
        # AreaType 0 is a protobuf default, even when field1 is absent.
        area_data = (field(1, 1540000000) +
                     field(2, field(7, 3) + field(8, 4)) +
                     field(2, field(1, 3) + field(7, 9) + field(8, 10)))
        def record(key, typename, payload):
            return field(1, field(1, key) +
                         field(2, field(5, typename) + field(6, payload)))
        db = (record("Worlds", "Definitions.WorldData", worlds) +
              record("DefaultVillages", "Meta.DefaultVillageList", villages) +
              record("Village04Layout1", "Definitions.Scene.VillageAreaData", area_data))
        catalog, areas, problems = parse_world_registry(
            db, {1540000000, 1540000001})
        self.assertEqual(len(catalog), 3)
        self.assertEqual(len(areas), 2)
        self.assertEqual(areas[0]["nativeAreaTypeName"], "Beach")
        self.assertFalse(areas[0]["nativeAreaTypeFieldPresent"])
        self.assertEqual(areas[1]["nativeAreaTypeName"], "Urban")
        self.assertEqual(catalog[0]["sceneId"], 1540000001)
        self.assertEqual(catalog[0]["universeTagItemId"], 2000500001)
        self.assertEqual(problems, [])
        self.assertEqual(catalog[1]["worldIdKind"], "derivedLayoutKey")

    def test_source_default_grid_collection_has_real_native_coordinates(self):
        path = STREAM / "SceneLayouts/Village04/MeadowGrids.json"
        # Object ID zero is a protobuf default, omitted in both map and object.
        zero_object = (field(2, 40600004) + field(3, 61) +
                       field(4, 77) + field(5, 12))
        four_object = (field(1, 4) + field(2, 40000001) +
                       field(3, 12) + field(4, 5) + field(5, 4) +
                       field(6, b"state"))
        data = field(1, field(2,
            field(2, "GridData/Villages/Village04-MeadowLevel-GridData.json") +
            field(4, 1) +
            field(5, field(2, zero_object)) +
            field(5, field(1, 4) + field(2, four_object)) +
            field(6, 5))) + field(3, 1)
        parsed = grid_collection_layout(data, path)
        self.assertIsNotNone(parsed)
        layout, objects = parsed
        self.assertEqual(layout["layoutKind"], "nativeGridCollection")
        self.assertEqual(layout["defaultObjectCount"], 2)
        self.assertEqual(layout["nativeGridEntries"][0]["tessellationFactor"], 1)
        self.assertEqual(objects[0]["itemId"], 40600004)
        self.assertEqual((objects[0]["x"], objects[0]["y"]), (61, 77))
        self.assertEqual(objects[0]["orientationName"], "Left")
        self.assertEqual(objects[1]["orientationName"], "Right")
        self.assertFalse(objects[0]["fixedImmovableVerified"])
        self.assertFalse(objects[0]["worldCoordinatesVerified"])
        self.assertEqual(objects[1]["stateByteCount"], 5)
        # Real protobuf map object ID mismatch is a corrupt source.
        corrupted = data.replace(field(1, 4) + field(2, four_object),
                                 field(1, 3) + field(2, four_object))
        with self.assertRaisesRegex(ValueError, "disagree"):
            grid_collection_layout(corrupted, path)

    def test_realm_embedded_gridcollection_uses_original_nested_wire_fields(self):
        path = STREAM / "SceneLayouts/Realms/Example/ExampleRealm.json"
        native_grid = (field(2, "GridData/Worlds/Example-GridData.json") +
                       field(4, 1) +
                       field(5, field(2, field(2, 40000001) +
                                      field(3, 4) + field(4, 7))) +
                       field(6, 1))
        collection = field(1, field(2, native_grid)) + field(3, 1)
        wrapper = (field(1, field(3,
                    "SceneLayouts/Realms/Example/CustomLocations.json")) +
                   field(2, collection))
        parsed = realm_grid_collection_layout(wrapper, path)
        self.assertIsNotNone(parsed)
        layout, objects = parsed
        self.assertEqual(layout["layoutKind"], "nativeGridCollection")
        self.assertEqual(layout["defaultObjectCount"], 1)
        self.assertEqual(layout["embeddedGridCollectionWireField"], 2)
        self.assertEqual(layout["realmCustomLocationPath"],
                         "SceneLayouts/Realms/Example/CustomLocations.json")
        self.assertEqual(layout["gridReferences"][0]["wireField"], "2.1.2.2")
        self.assertEqual(layout["nativeGridEntries"][0]["gridIdNative"], 0)
        self.assertEqual(layout["nativeGridEntries"][0]["gridDataPathWireField"],
                         "2.1.2.2")
        self.assertEqual((objects[0]["x"], objects[0]["y"]), (4, 7))
        self.assertFalse(objects[0]["worldCoordinatesVerified"])
        self.assertFalse(objects[0]["fixedImmovableVerified"])
        # A realm wrapper is NOT itself a top-level native GridCollection.
        self.assertIsNone(grid_collection_layout(wrapper, path))
        self.assertIsNone(realm_grid_collection_layout(
            wrapper, STREAM / "SceneLayouts/Village04/Area.json"))
        bad_ref = wrapper.replace(
            b"SceneLayouts/Realms/Example/CustomLocations.json",
            b"SceneLayouts/Realms/../badx/CustomLocations.json")
        # A source path with traversal components is rejected without guessing.
        with self.assertRaises(ValueError):
            realm_grid_collection_layout(bad_ref, path)
        no_grids = field(1, field(3,
            "SceneLayouts/Realms/Example/CustomLocations.json"))
        with self.assertRaises(ValueError):
            realm_grid_collection_layout(no_grids, path)
        corrupt_object = (field(1, field(2,
            field(2, "GridData/Worlds/Example-GridData.json") +
            field(5, field(1, 3) + field(2, field(1, 4))))))
        with self.assertRaisesRegex(ValueError, "disagree"):
            realm_grid_collection_layout(
                field(1, field(3,
                    "SceneLayouts/Realms/Example/CustomLocations.json")) +
                field(2, corrupt_object), path)

    def test_offgrid_embedded_gridcollection_keeps_native_context_and_anchors(self):
        path = (STREAM / "SceneLayouts/OffGridBuildings/SkullRock/"
                "SkullRock_DefaultLayout.json")
        native_grid = (
            field(2, "GridData/OffGridBuildings/SkullRock/Floor.json") +
            field(4, 1) +
            field(5, field(1, 3) +
                  field(2, field(1, 3) + field(2, 40000001) +
                        field(3, 9) + field(4, 11))))
        wrapper = (
            field(1, field(2, "SceneLayouts/OffGridBuildings/"
                              "SkullRock/CustomLocations.json") +
                  field(3, field(1, 1540000000))) +
            field(2, field(1, field(1, 7) +
                            field(2, field(1, 7) + native_grid)) +
                  field(3, 1)))
        parsed = offgrid_grid_collection_layout(wrapper, path)
        self.assertIsNotNone(parsed)
        layout, objects = parsed
        self.assertEqual(layout["layoutKind"], "nativeGridCollection")
        self.assertEqual(layout["embeddedGridCollectionWireField"], 2)
        self.assertEqual(layout["offGridCustomLocationPath"],
                         "SceneLayouts/OffGridBuildings/"
                         "SkullRock/CustomLocations.json")
        self.assertEqual(layout["source"]["nativeType"],
                         "offgrid_source_with_embedded_Meta.GridCollection")
        self.assertEqual(layout["gridReferences"][0]["wireField"], "2.1.2.2")
        self.assertEqual(layout["nativeGridEntries"][0]["gridIdNative"], 7)
        self.assertEqual(layout["defaultObjectCount"], 1)
        self.assertEqual((objects[0]["x"], objects[0]["y"]), (9, 11))
        self.assertFalse(objects[0]["worldCoordinatesVerified"])
        self.assertFalse(layout["worldCoordinatesVerified"])
        self.assertFalse(objects[0]["fixedImmovableVerified"])
        self.assertIsNone(realm_grid_collection_layout(wrapper, path))
        self.assertIsNone(offgrid_grid_collection_layout(
            wrapper, STREAM / "SceneLayouts/Realms/SkullRock/Foo.json"))

        # The root source uses context field 1.2, NOT Realm field 1.3.
        wrong_context = wrapper.replace(
            field(1, field(2, "SceneLayouts/OffGridBuildings/"
                              "SkullRock/CustomLocations.json") +
                  field(3, field(1, 1540000000))),
            field(1, field(3, "SceneLayouts/OffGridBuildings/"
                              "SkullRock/CustomLocations.json")))
        self.assertIsNone(offgrid_grid_collection_layout(wrong_context, path))
        unsafe = wrapper.replace(
            b"SkullRock/CustomLocations.json",
            b"../badxxx/CustomLocations.json")
        with self.assertRaises(ValueError):
            offgrid_grid_collection_layout(unsafe, path)
        with self.assertRaisesRegex(ValueError, "GridCollection"):
            offgrid_grid_collection_layout(
                field(1, field(2, "SceneLayouts/OffGridBuildings/"
                                  "SkullRock/CustomLocations.json")) +
                field(2, field(3, 1)), path)
        bad_id = wrapper.replace(
            field(1, 7) + field(2, field(1, 7) + native_grid),
            field(1, 6) + field(2, field(1, 7) + native_grid))
        with self.assertRaisesRegex(ValueError, "disagree"):
            offgrid_grid_collection_layout(bad_id, path)

    def test_offgrid_event_visual_direct_gridcollection_does_not_fail_wrapper_probe(self):
        # Steam 1.26.2 Halloween 2025/2026 visual layout has a direct
        # Meta.GridCollection with repeated field-1 map entries. It is not
        # a root (1=context, 2=embedded) OffGrid wrapper.
        path = (STREAM / "SceneLayouts/OffGridBuildings/EventFloatingIslands/"
                "Halloween2025/Island2026/EFI_Halloween-Visual-DefaultLayout.json")
        def grid_entry(grid_id, object_id):
            grid = (field(1, grid_id) +
                    field(2, f"GridData/OffGridBuildings/EventFloatingIslands/"
                             f"EFI_Halloween2025/Visual{grid_id}-GridData.json") +
                    field(5, field(1, object_id) +
                          field(2, field(1, object_id) +
                                field(2, 40000001) + field(3, grid_id))))
            return field(1, field(1, grid_id) + field(2, grid))
        direct = grid_entry(0, 4) + grid_entry(1, 5)
        self.assertIsNone(offgrid_grid_collection_layout(direct, path))
        parsed = grid_collection_layout(direct, path)
        self.assertIsNotNone(parsed)
        layout, objects = parsed
        self.assertEqual(layout["source"]["nativeType"], "Meta.GridCollection")
        self.assertNotIn("embeddedGridCollectionWireField", layout)
        self.assertEqual([g["gridIdNative"] for g in layout["nativeGridEntries"]], [0, 1])
        self.assertEqual(layout["defaultObjectCount"], 2)
        self.assertEqual(layout["gridReferences"][0]["wireField"], "1.2.2")
        self.assertTrue(all(o["worldCoordinatesVerified"] is False for o in objects))
        # Direct map-key/ID contradictions must not be downgraded into
        # unverified or silently skipped layouts.
        invalid = direct.replace(
            field(1, 1) + field(2, field(1, 1) +
                field(2, "GridData/OffGridBuildings/EventFloatingIslands/"
                         "EFI_Halloween2025/Visual1-GridData.json") +
                field(5, field(1, 5) + field(2, field(1, 5) +
                                           field(2, 40000001) + field(3, 1)))),
            field(1, 2) + field(2, field(1, 1) +
                field(2, "GridData/OffGridBuildings/EventFloatingIslands/"
                         "EFI_Halloween2025/Visual1-GridData.json") +
                field(5, field(1, 5) + field(2, field(1, 5) +
                                           field(2, 40000001) + field(3, 1)))))
        with self.assertRaisesRegex(ValueError, "disagree"):
            offgrid_grid_collection_layout(invalid, path)

    def test_default_village_grid_layout_map_exact_area_paths(self):
        path = STREAM / "SceneLayouts/Village04/DefaultVillageLayout01.json"
        data = (field(1, field(2, 1540000000) +
                       field(3, "Village04Layout1")) +
                field(2, field(2, "SceneLayouts/Village04/BeachGrids.json")) +
                field(2, field(1, 2) +
                      field(2, "SceneLayouts/Village04/MeadowGrids.json")))
        layout = default_village_layout(data, path)
        self.assertEqual(layout["layoutKind"], "nativeDefaultVillageData")
        self.assertEqual(layout["defaultVillageSceneId"], 1540000000)
        self.assertEqual([a["nativeAreaTypeName"] for a in
                          layout["areaLayoutReferences"]], ["Beach", "Meadow"])
        self.assertEqual(layout["areaLayoutReferences"][0]["nativeAreaTypeCode"], 0)

    def test_terrain_helpers_require_explicit_native_game_version(self):
        packed = bytes((0b10100101,))
        palette = [0, 1024, 2048]
        with self.assertRaisesRegex(TypeError, "source_game_version"):
            describe_native_packing(2, 2, palette, packed)
        with self.assertRaisesRegex(TypeError, "source_game_version"):
            count_packed_palette_indices(2, 2, palette, packed)
        with self.assertRaisesRegex(TypeError, "source_game_version"):
            floor_at(2, 2, palette, packed, 0, 0)
        with self.assertRaisesRegex(TypeError, "source_game_version"):
            decode_window(2, 2, palette, packed, 0, 0, 2, 2)

        unverified = describe_native_packing(
            2, 2, palette, packed, source_game_version="1.27.0")
        self.assertEqual(unverified["status"],
                         "native_packing_not_verified_for_game_version")
        self.assertFalse(unverified["decoded"])
        self.assertIsNone(count_packed_palette_indices(
            2, 2, palette, packed, source_game_version="1.27.0"))
        with self.assertRaisesRegex(ValueError, "unresolved"):
            floor_at(2, 2, palette, packed, 0, 0,
                     source_game_version="1.27.0")
        with self.assertRaisesRegex(ValueError, "unresolved"):
            decode_window(2, 2, palette, packed, 0, 0, 2, 2,
                          source_game_version="1.27.0")
        with self.assertRaisesRegex(ValueError, "missing source game version"):
            describe_native_packing(
                2, 2, palette, packed, source_game_version="")

    def test_correlated_native_12x16_room_is_exact_rectangular_border(self):
        # Synthetic independent encoding of the 192/192 observed Steam source
        # pattern, no copyrighted game bytes are committed to this test.
        size_x, size_y = 12, 16
        packed = bytearray((size_x * size_y * 2) // 8)
        for x in range(size_x):
            for y in range(size_y):
                palette_id = 1 if (x in (0, 11) or y in (0, 15)) else 2
                bit = (x * size_y + y) * 2
                packed[bit // 8] |= palette_id << (6 - bit % 8)
        palette = [0, 3072, 1024]
        evidence = describe_native_packing(size_x, size_y, palette, bytes(packed), source_game_version="1.26.1")
        self.assertTrue(evidence["decoded"])
        self.assertFalse(evidence["nativeCodeBodyVerified"])
        self.assertEqual(evidence["sampleBasedEncodingEvidence"], EVIDENCE)
        actual = decode_window(size_x, size_y, palette, bytes(packed),
                               0, 0, size_x, size_y, source_game_version="1.26.1")
        self.assertEqual(actual[0], [3072] * size_x)
        self.assertEqual(actual[1], [3072] + [1024] * 10 + [3072])
        self.assertEqual(actual[-1], [3072] * size_x)
        self.assertEqual(sum(1 for y in range(size_y) for x in range(size_x)
                             if actual[y][x] == (3072 if x in (0, 11) or
                                  y in (0, 15) else 1024)), 192)
        self.assertEqual(floor_at(size_x, size_y, palette, bytes(packed),
                                  5, 5, source_game_version="1.26.1"), 1024)
        with self.assertRaisesRegex(ValueError, "outside"):
            floor_at(size_x, size_y, palette, bytes(packed), 12, 0, source_game_version="1.26.1")

    def test_native_1bit_compaction_and_partial_byte_padding(self):
        palette = [0, 1024]
        packed = bytes((0b11111111, 0b10000000))  # nine cells, 7 padded bits
        evidence = describe_native_packing(3, 3, palette, packed, source_game_version="1.26.1")
        self.assertTrue(evidence["decoded"])
        self.assertEqual(evidence["cellBits"], 1)
        self.assertEqual(decode_window(3, 3, palette, packed, 0, 0, 3, 3, source_game_version="1.26.1"),
                         [[1024] * 3] * 3)
        with self.assertRaisesRegex(ValueError, "padding"):
            describe_native_packing(3, 3, palette, bytes((255, 129)), source_game_version="1.26.1")
        with self.assertRaisesRegex(ValueError, "length"):
            describe_native_packing(3, 3, palette, bytes((255,)), source_game_version="1.26.1")
        with self.assertRaisesRegex(ValueError, "palette"):
            describe_native_packing(2, 2, [0, 1024, 2048], bytes((255,)), source_game_version="1.26.1")

    def test_original_native_four_bit_palette_and_grid_axis_order(self):
        palette = [0, 8, 16, 32, 64]
        packed = bytes((0x01, 0x23, 0x41, 0x03, 0x20))
        evidence = describe_native_packing(3, 3, palette, packed, source_game_version="1.26.1")
        self.assertTrue(evidence["decoded"])
        self.assertEqual(evidence["cellBits"], 4)
        self.assertEqual(evidence["packing"], "x_major_msb_first")
        self.assertFalse(evidence["nativeCodeBodyVerified"])
        self.assertIn("original_metadata_v31",
                      evidence["sampleBasedEncodingEvidence"])
        self.assertEqual(count_packed_palette_indices(
            3, 3, palette, packed, source_game_version="1.26.1"), [2, 2, 2, 2, 1])
        self.assertEqual(floor_at(3, 3, palette, packed, 1, 1, source_game_version="1.26.1"), 64)
        self.assertEqual(decode_window(
            3, 3, palette, packed, 0, 0, 3, 3, source_game_version="1.26.1"), [
                [0, 32, 0], [8, 64, 32], [16, 8, 16],
            ])
        with self.assertRaisesRegex(ValueError, "padding"):
            describe_native_packing(
                3, 3, palette, bytes((0x01, 0x23, 0x41, 0x03, 0x2f)), source_game_version="1.26.1")
        with self.assertRaisesRegex(ValueError, "index missing"):
            describe_native_packing(
                3, 3, palette, bytes((0xf1, 0x23, 0x41, 0x03, 0x20)), source_game_version="1.26.1")

        sixteen = list(range(16))
        self.assertEqual(floor_at(
            2, 2, sixteen, bytes((0x0f, 0x89)), 0, 1, source_game_version="1.26.1"), 15)
        self.assertEqual(count_packed_palette_indices(
            2, 2, sixteen, bytes((0x0f, 0x89)), source_game_version="1.26.1")[15], 1)
        self.assertEqual(describe_native_packing(
            1, 2, [0], bytes((0,)), source_game_version="1.26.1")["cellBits"], 1)
        unsupported = describe_native_packing(
            2, 2, list(range(17)), bytes((0, 0)), source_game_version="1.26.1")
        self.assertEqual(unsupported["status"], "unresolved_palette_cardinality")
        self.assertFalse(unsupported["decoded"])
        with self.assertRaisesRegex(ValueError, "unresolved"):
            decode_window(2, 2, list(range(17)), bytes((0, 0)),
                          0, 0, 2, 2, source_game_version="1.26.1")

    def test_source_palette_index_histogram_exact_counts_and_tail(self):
        self.assertEqual(count_packed_palette_indices(
            2, 2, [0, 1024, 2048], bytes((0b10100101,)), source_game_version="1.26.1"), [0, 2, 2])
        self.assertEqual(count_packed_palette_indices(
            3, 3, [0, 1024], bytes((0xff, 0x80)), source_game_version="1.26.1"), [0, 9])
        self.assertIsNone(count_packed_palette_indices(
            5, 5, list(range(17)), bytes(25), source_game_version="1.26.1"))
        with self.assertRaisesRegex(ValueError, "index missing"):
            count_packed_palette_indices(
                2, 2, [0, 1024, 2048], bytes((0xff,)), source_game_version="1.26.1")

    def test_original_gridarea_layer_index_is_x_major_and_not_occupancy(self):
        source = [1, 2, 4, 8, 16, 32]
        self.assertEqual(
            native_gridarea_layer_at(3, 2, source, 0, 1), 2)
        self.assertEqual(
            native_gridarea_layer_at(3, 2, source, 1, 0), 4)
        self.assertEqual(
            native_gridarea_layer_at(3, 2, source, 2, 1), 32)
        self.assertEqual(native_gridarea_layer_window(
            3, 2, source, 0, 0, 3, 2),
            [[1, 4, 16], [2, 8, 32]])
        self.assertEqual(native_gridarea_layer_window(
            3, 2, source, 1, 1, 2, 1), [[8, 32]])
        with self.assertRaisesRegex(ValueError, "out of bounds"):
            native_gridarea_layer_at(3, 2, source, 3, 0)
        with self.assertRaisesRegex(ValueError, "out of bounds"):
            native_gridarea_layer_at(3, 2, source, False, 0)
        with self.assertRaisesRegex(ValueError, "viewport"):
            native_gridarea_layer_window(3, 2, source, 2, 0, 2, 1)

    def test_source_cardinal_gridarea_dimensions_are_not_transforms(self):
        source = [1, 2, 4, 8, 16, 32]
        for orientation, dims in (
                (0, (3, 2)), (4, (2, 3)),
                (8, (3, 2)), (12, (2, 3))):
            actual = native_gridarea_cardinal_dimensions(
                3, 2, source, orientation)
            self.assertEqual((actual["sizeX"], actual["sizeY"]), dims)
            self.assertTrue(actual["nativeCardinalSizeVerified"])
            self.assertFalse(actual["rotatedCellMappingVerified"])
            self.assertFalse(actual["anchorModelVerified"])
            self.assertFalse(actual["occupancyPredicateVerified"])
            self.assertFalse(actual["placementLegalityVerified"])
        for orientation in (1, 2, 3, 5, 7, 9, 10, 11, 13, 14, 15):
            actual = native_gridarea_cardinal_dimensions(
                3, 2, source, orientation)
            self.assertEqual(actual["status"],
                             "noncardinal_gridarea_dimensions_not_derived")
            self.assertNotIn("sizeX", actual)
        with self.assertRaisesRegex(ValueError, "GridOrientation"):
            native_gridarea_cardinal_dimensions(3, 2, source, 16)

    def test_cardinal_projection_geometry_is_explicitly_a_hypothesis(self):
        values = [1, 0, 4, 0, 8, 16]
        for code, expected in [
            (0, {(5, 6), (6, 6), (7, 6), (7, 7)}),
            (4, {(5, 8), (5, 7), (5, 6), (6, 6)}),
            (8, {(7, 7), (6, 7), (5, 7), (5, 6)}),
            (12, {(6, 6), (6, 7), (6, 8), (5, 8)}),
        ]:
            candidate = candidate_layer_cells(
                3, 2, values, cell_order="x_major",
                orientation_code=code, anchor_mode="top_left", x=5, y=6)
            actual = {(c["x"], c["y"]) for c in candidate["cells"]}
            self.assertEqual(actual, expected)
            self.assertFalse(candidate["rotationTransformVerified"])
            self.assertFalse(candidate["occupancyPredicateVerified"])
            self.assertFalse(candidate["placementLegalityVerified"])
            self.assertEqual(candidate["nonzeroNativeLayerCellCount"], 4)
        self.assertEqual(len(projection_hypotheses()), 4)
        different = candidate_layer_cells(
            3, 2, values, cell_order="y_major",
            orientation_code=0, anchor_mode="top_left", x=5, y=6)
        self.assertNotEqual([c["originalFlatIndex"] for c in different["cells"]],
                            [c["originalFlatIndex"] for c in candidate["cells"]])

    def test_unsupported_native_noncardinal_rotation_never_projected(self):
        native = candidate_layer_cells(
            2, 3, [64] * 6, cell_order="x_major",
            orientation_code=7, anchor_mode="center_floor", x=2, y=2)
        self.assertEqual(native["status"],
                         "unsupported_noncardinal_orientation_hypothesis")
        self.assertNotIn("cells", native)
        with self.assertRaisesRegex(ValueError, "GridOrientation"):
            candidate_layer_cells(2, 3, [64] * 6, cell_order="x_major",
                                  orientation_code=16, anchor_mode="top_left",
                                  x=0, y=0)
        with self.assertRaisesRegex(ValueError, "fixed32"):
            validate_footprint(3, 3, [1] * 8)

    def test_native_grid_fixed32_palette_and_compacted_payload(self):
        palette = struct.pack("<III", 0, 3072, 1024)
        compacted = b"\x55" * 48
        raw = (field(1, 12) + field(2, 16) +
               field(4, palette) + field(5, compacted))
        grid = parse_grid_structure(raw, source_game_version="1.26.1")
        self.assertEqual((grid["sizeX"], grid["sizeY"]), (12, 16))
        self.assertEqual(grid["nativeFloorTypePalette"], [0, 3072, 1024])
        self.assertEqual(grid["nativePaletteIndexCellCounts"], [0, 192, 0])
        self.assertEqual(base64.b64decode(grid["compactedFloorTypesBase64"]), compacted)
        self.assertEqual(grid["floorTypeEnumSymbols"]["1024"], "Floor")
        self.assertTrue(grid["terrainDecoding"]["decoded"])
        self.assertFalse(grid["terrainDecoding"]["nativeCodeBodyVerified"])
        self.assertTrue(grid["nativeFloorIndexToLocalXYCorroborated"])
        self.assertFalse(grid["compactedBitOrderVerified"])
        self.assertFalse(grid["cellIndexToXYVerified"])

    def test_native_grid_parser_and_verifier_demand_explicit_version(self):
        # Four valid 1-bit cells followed by four required zero pad bits.
        packed = (field(1, 2) + field(2, 2) +
                  field(4, struct.pack("<II", 0, 1024)) +
                  field(5, bytes((0xf0,))))
        with self.assertRaises(TypeError):
            parse_grid_structure(packed)
        with self.assertRaisesRegex(ValueError, "source game version"):
            parse_grid_structure(packed, source_game_version="")
        decoded = parse_grid_structure(
            packed, source_game_version="1.26.1")
        with self.assertRaises(TypeError):
            checked_grid(decoded)
        checked_grid(decoded, source_game_version="1.26.1")
        current = parse_grid_structure(
            packed, source_game_version="1.26.2")
        checked_grid(current, source_game_version="1.26.2")
        with self.assertRaisesRegex(ValueError, "evidence mismatches"):
            checked_grid(decoded, source_game_version="1.26.2")

    def test_native_uncompacted_grid_fixed32_values(self):
        raw = field(1, 2) + field(2, 2) + field(3, struct.pack("<IIII", 4, 4, 512, 0))
        grid = parse_grid_structure(raw, source_game_version="1.26.1")
        self.assertEqual(grid["nativeFloorTypes"], [4, 4, 512, 0])
        self.assertEqual(grid["status"], "native_uncompacted_floor_values")
        with self.assertRaises(ValueError):
            parse_grid_structure(
                field(1, 1) + field(2, 1) + field(4, b"\x01"),
                source_game_version="1.26.1")

    def test_native_building_alternate_wire_fields_are_not_scene_ids_or_footprints(self):
        from world import footprint
        # The actual game has Building.field6 wire0 and field10 wire2 variants.
        fields = wire_fields(field(6, 1) + field(10, b"opaque"))
        self.assertIsNone(footprint(fields))
        self.assertEqual([(n, w) for n, w, _ in fields], [(6, 0), (10, 2)])

    def test_verified_explicit_restrictions_only(self):
        raw = field(25, field(1, field(1, 0)) +
                    field(2, field(1, 1)) + field(8, b""))
        values = restrictions(wire_fields(raw))
        self.assertEqual(values["canMove"]["value"], False)
        self.assertEqual(values["canRotate"]["value"], True)
        self.assertNotIn("canBeRemoved", values)
        self.assertNotIn("canPlace", values)

    def test_path_refs_proven_from_native_wire_not_filename_guess(self):
        ref = "GridData/Villages/Village04-MeadowLevel-GridData.json"
        data = field(1, field(2, ref)) + field(3, b"\x00\xff")
        actual = explicit_references(data)
        self.assertIn({"path": ref, "wireField": "1.2"}, actual)
        self.assertFalse(any("..evil" in r["path"] for r in actual))

    def test_diff_excludes_provenance_but_detects_values(self):
        baseline = [{"itemId": 1, "footprint": {"sizeX": 1}, "source": {"path": "a"}}]
        same = [{"itemId": 1, "footprint": {"sizeX": 1}, "source": {"path": "b"}}]
        changed = [{"itemId": 1, "footprint": {"sizeX": 2}, "source": {"path": "b"}}]
        self.assertFalse(diff_records(baseline, same, "itemId")["changed"])
        self.assertEqual(diff_records(baseline, changed, "itemId")["changed"][0]["fields"], ["footprint"])


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.game = self.root / "game"
        self.out = self.root / "output"
        self.base = self.game / STREAM
        (self.base / "itemlist").mkdir(parents=True)
        (self.base / "GridData/Villages").mkdir(parents=True)
        (self.base / "SceneLayouts/Village04").mkdir(parents=True)
        (self.base / "Furniture").mkdir(parents=True)
        (self.game / "FullVersion.txt").write_text("1.26.2\n", encoding="utf-8")
        (self.base / "itemlist/Scene.json").write_bytes(
            indexed(1540000000, 0, "Village!Village04"))
        (self.base / "itemlist/Furniture.json").write_bytes(
            indexed(40000000, 1, "TestBench", grid(2, 1, [68, 0]),
                    field(25, field(1, field(1, 0)))))
        (self.base / "itemlist/Building.json").write_bytes(
            indexed(20000000, 1, "TestHouse", grid(3, 2, [76] * 6),
                    field(42, "SceneLayouts/Village04/TestHouse.json") +
                    field(10, 1540000000)))
        (self.base / "GridData/Villages/Village04-Test.json").write_bytes(
            field(1, 196) + field(2, 100) + field(5, b"\x00" * 10))
        (self.base / "SceneLayouts/Village04/TestHouse.json").write_bytes(
            field(1, field(2, "GridData/Villages/Village04-Test.json")))
        (self.base / "Furniture/extra.json").write_text(
            json.dumps({"ID": 40000001, "Name": "ConflictingSourceName"}),
            encoding="utf-8")

    def _write_native_pe_fixture(self):
        binary = bytearray(0x2000)
        binary[:2] = b"MZ"
        struct.pack_into("<I", binary, 0x3c, 0x80)
        binary[0x80:0x84] = bytes((80, 69, 0, 0))
        struct.pack_into("<HHIIIHH", binary, 0x84,
                         0x8664, 2, 0, 0, 0, 240, 0x2022)
        # IMAGE_DIRECTORY_ENTRY_EXCEPTION points to a real, synthetic
        # AMD64 RUNTIME_FUNCTION interval. Matching a version string alone
        # must not be sufficient to accept an IL2CPP method RVA.
        struct.pack_into("<II", binary, 0x98 + 112 + 3 * 8,
                         0x2000, 12)
        binary[0x98:0x9a] = bytes((0x0b, 0x02))
        section_offset = 0x98 + 240
        binary[section_offset:section_offset + 5] = b".text"
        struct.pack_into("<IIII", binary, section_offset + 8,
                         0x1000, 0x1000, 0x1000, 0x400)
        struct.pack_into("<I", binary, section_offset + 36, 0x60000020)
        pdata_section = section_offset + 40
        binary[pdata_section:pdata_section + 6] = b".pdata"
        struct.pack_into("<IIII", binary, pdata_section + 8,
                         0x200, 0x2000, 0x200, 0x1400)
        struct.pack_into("<I", binary, pdata_section + 36, 0x40000040)
        struct.pack_into("<III", binary, 0x1400,
                         0x1020, 0x1060, 0x2100)
        raw = bytes(range(64))
        binary[0x420:0x420 + len(raw)] = raw
        (self.game / "GameAssembly.dll").write_bytes(binary)
        dump = self.root / "private-dump.cs"
        dump.write_text(
            "// Namespace: Definitions.Grid\n"
            "public class GridData\n"
            "{\n"
            "    // RVA: 0x1010 Offset: 0x410 VA: 0x180001010\n"
            "    public GridFloorType get_Item(GridPosition position) { }\n"
            "    // RVA: 0x1020 Offset: 0x420 VA: 0x180001020\n"
            "    public GridFloorType get_Item(int x, int y) { }\n"
            "}\n"
            "// Namespace: Other\n"
            "public class GridData\n"
            "{\n"
            "    // RVA: 0x1040 Offset: 0x440 VA: 0x180001040\n"
            "    public GridFloorType get_Item(int x, int y) { }\n"
            "}\n", encoding="utf-8")
        return dump, raw

    def tearDown(self):
        self.tmp.cleanup()

    def _use_original_terrain_version(self):
        # The packed GridData getter has native code proof for 1.26.1 only.
        # Keep setUp at 1.26.2 to exercise the default fail-closed path.
        (self.game / "FullVersion.txt").write_text(
            "1.26.1\n", encoding="utf-8")

    def test_pipeline_extracts_actual_default_layout_object_data(self):
        layout = (field(1, field(2,
            field(2, "GridData/Villages/Village04-Test.json") +
            field(5, field(2, field(2, 40000001) +
                            field(3, 9) + field(4, 10) + field(5, 4))))) +
                  field(3, 1))
        target = self.base / "SceneLayouts/Village04/MeadowGrids.json"
        target.write_bytes(layout)
        report = extract(self.game, self.out)
        self.assertEqual(report["defaultLayoutObjectCount"], 1)
        self.assertEqual(report["typedGridCollectionCount"], 1)
        native_objects = json.loads((self.out / "layoutObjects.json").read_text())
        self.assertEqual(native_objects[0]["itemId"], 40000001)
        self.assertEqual((native_objects[0]["x"], native_objects[0]["y"]), (9, 10))
        self.assertEqual(native_objects[0]["gridObjectIdNative"], 0)
        self.assertEqual(native_objects[0]["orientationName"], "Right")
        self.assertIn("layoutObjects.json", json.loads(
            (self.out / "manifest.json").read_text())["outputSha256"])

    def test_extraction_retains_native_data_and_unresolved_evidence(self):
        report = extract(self.game, self.out)
        self.assertEqual(report["sceneCount"], 1)
        self.assertEqual(report["objectCount"], 2)
        self.assertEqual(report["withNativeFootprint"], 2)
        self.assertEqual(report["nativeOverrideConflictCount"], 1)
        objects = json.loads((self.out / "objects.json").read_text())
        self.assertEqual(objects[0]["itemId"], 20000001)
        self.assertEqual(objects[1]["itemId"], 40000001)
        self.assertFalse(objects[0]["placeableInWorldVerified"])
        self.assertEqual(objects[1]["gridEditRestrictions"]["canMove"]["value"], False)
        self.assertEqual(json.loads((self.out / "worlds.json").read_text()), [])
        layouts = json.loads((self.out / "layouts.json").read_text())
        self.assertEqual(layouts[0]["gridReferences"][0]["wireField"], "1.2")
        manifest = json.loads((self.out / "manifest.json").read_text())
        self.assertEqual(manifest["gameVersion"], "1.26.2")
        self.assertEqual(manifest["status"], "partial_game_native_evidence")
        self.assertIn("objects.json", manifest["outputSha256"])

    def test_diff_reuses_previous_snapshot(self):
        extract(self.game, self.out)
        original = self.base / "itemlist/Furniture.json"
        original.write_bytes(indexed(40000000, 1, "TestBench",
                                     grid(3, 1, [68, 0, 68])))
        newer = self.root / "new"
        extract(self.game, newer, self.out)
        delta = json.loads((newer / "diff.json").read_text())
        self.assertEqual(delta["status"], "compared")
        self.assertFalse(delta["sourceMembershipVerified"])
        self.assertEqual(delta["entities"]["objects"]["changed"][0]["id"], "40000001")

    def test_unverified_source_scopes_cannot_assert_true_additions(self):
        extract(self.game, self.out)
        original = self.base / "itemlist/Furniture.json"
        extra = indexed(40000000, 2, "NewItem", grid(1, 1, [68]))
        original.write_bytes(original.read_bytes() + extra)
        newer = self.root / "new"
        extract(self.game, newer, self.out)
        delta = json.loads((newer / "diff.json").read_text())
        objects = delta["entities"]["objects"]
        self.assertEqual(objects["added"], [])
        self.assertEqual(objects["candidateAdded"], ["40000002"])
        self.assertEqual(objects["membershipConfidence"],
                         "unverified_source_coverage")

    def test_private_native_footprint_hypothesis_comparison_distinguishes_anchor_models(self):
        self._use_original_terrain_version()
        grid_path = self.base / "GridData/Villages/Village04-Test.json"
        grid_path.write_bytes(field(1, 3) + field(2, 3) +
            field(4, struct.pack("<III", 0, 1024, 2048)) +
            field(5, bytes((0xaa, 0xaa, 0x80))))
        furniture_path = self.base / "itemlist/Furniture.json"
        furniture_path.write_bytes(indexed(40000000, 1, "TestBench",
                                          grid(2, 1, [68, 0], floor=2048)))
        object_zero = field(2, 40000001) + field(3, 1)
        object_one = (field(1, 1) + field(2, 40000001) +
                      field(3, 2) + field(4, 2) + field(5, 4))
        object_two = (field(1, 2) + field(2, 40000001) +
                      field(3, 1) + field(4, 1) + field(5, 7))
        native_grid = (field(2, "GridData/Villages/Village04-Test.json") +
            field(5, field(2, object_zero)) +
            field(5, field(1, 1) + field(2, object_one)) +
            field(5, field(1, 2) + field(2, object_two)))
        (self.base / "SceneLayouts/Village04/Hypothesis.json").write_bytes(
            field(1, field(2, native_grid)))
        extract(self.game, self.out)
        scores = audit_footprint_candidates(self.out, max_objects=200)
        self.assertEqual(scores["nativeLayoutObjectCount"], 3)
        self.assertEqual(scores["layoutObjectsConsidered"], 3)
        self.assertEqual(scores["excludedSourceConditions"]
                         ["nonCardinalOrientationNotModeled"], 1)
        self.assertFalse(scores["footprintLayerIndexOrderVerified"])
        self.assertFalse(scores["placementLegalityVerified"])
        top = scores["hypotheses"]["x_major+top_left"]["counts"]
        centered = scores["hypotheses"]["x_major+center_floor"]["counts"]
        self.assertEqual(top["objectsWithComparableOriginalSources"], 2)
        self.assertEqual(centered["objectsWithComparableOriginalSources"], 2)
        self.assertEqual(top["rawLayerCellsOutsideGrid"], 1)
        self.assertEqual(centered.get("rawLayerCellsOutsideGrid", 0), 0)
        self.assertEqual(scores["candidateLayerSlotsBudgeted"], 16)
        discrimination = scores["crossHypothesisDiscrimination"]
        self.assertEqual(discrimination["objectsWithComparableHypotheses"], 2)
        self.assertGreater(discrimination["objectsWithGeometricHypothesisDifferences"], 0)
        self.assertGreater(discrimination["objectsWithDifferentTerrainOutcomes"], 0)
        self.assertEqual(scores["unprocessedLayoutObjects"], 0)
        self.assertFalse(scores["truncatedByCellBudget"])
        by_cells = audit_footprint_candidates(self.out, max_cells=8)
        self.assertTrue(by_cells["truncatedByCellBudget"])
        self.assertFalse(by_cells["truncatedByMaxObjects"])
        self.assertEqual(by_cells["candidateLayerSlotsBudgeted"], 8)
        self.assertEqual(by_cells["layoutObjectsConsidered"], 2)
        self.assertEqual(by_cells["unprocessedLayoutObjects"], 1)
        self.assertEqual(by_cells["excludedSourceConditions"]["candidateCellBudgetReached"], 1)
        with self.assertRaisesRegex(ValueError, "audit limits"):
            audit_footprint_candidates(self.out, max_cells=0)
        truncated = audit_footprint_candidates(self.out, max_objects=1)
        self.assertTrue(truncated["truncatedByMaxObjects"])

    def test_uniform_single_cell_examples_cannot_discriminate_projection_models(self):
        self._use_original_terrain_version()
        native_grid = (field(2, "GridData/Villages/Village04-Test.json") +
            field(5, field(1, 1) + field(2, field(1, 1) +
                                        field(2, 40000001))))
        (self.base / "SceneLayouts/Village04/OneCellGrids.json").write_bytes(
            field(1, field(2, native_grid)))
        (self.base / "itemlist/Furniture.json").write_bytes(
            indexed(40000000, 1, "TestBench",
                    grid(1, 1, [68], floor=1024)))
        (self.base / "GridData/Villages/Village04-Test.json").write_bytes(
            field(1, 2) + field(2, 2) +
            field(4, struct.pack("<II", 0, 1024)) +
            field(5, bytes((0b11110000,))))
        extract(self.game, self.out)
        evidence = audit_footprint_candidates(self.out)
        discrimination = evidence["crossHypothesisDiscrimination"]
        self.assertEqual(discrimination["objectsWithComparableHypotheses"], 1)
        self.assertEqual(discrimination.get("objectsWithGeometricHypothesisDifferences", 0), 0)
        self.assertEqual(discrimination.get("objectsWithDifferentTerrainOutcomes", 0), 0)
        self.assertEqual(discrimination["objectsWithIdenticalGeometryAndTerrainOutcomes"], 1)
        self.assertEqual(evidence["candidateLayerSlotsBudgeted"], 4)
        self.assertFalse(evidence["placementLegalityVerified"])

    def test_native_default_layout_grid_origin_audit_is_not_placement_permission(self):
        self._use_original_terrain_version()
        grid_path = self.base / "GridData/Villages/Village04-Test.json"
        grid_path.write_bytes(
            field(1, 2) + field(2, 2) +
            field(4, struct.pack("<III", 0, 1024, 2048)) +
            field(5, bytes((0b10100101,))))
        anchor_0 = field(2, 40000001)  # native object zero, anchor (0,0)
        anchor_1 = field(1, 1) + field(2, 40000001) + field(3, 1)
        anchor_2 = field(1, 2) + field(2, 40000001) + field(3, 2)
        blob = (field(2, "GridData/Villages/Village04-Test.json") +
                field(5, field(2, anchor_0)) +
                field(5, field(1, 1) + field(2, anchor_1)) +
                field(5, field(1, 2) + field(2, anchor_2)))
        (self.base / "SceneLayouts/Village04/NativeGrids.json").write_bytes(
            field(1, field(2, blob)))
        report = extract(self.game, self.out)
        self.assertEqual(report["nativePackedGridHistogramCount"], 1)
        self.assertEqual(report["nativeGridDecodeFailures"], 0)
        data = audit_snapshot(self.out)
        self.assertEqual(data["status"], "source_origin_terrain_diagnostic_only")
        counts = data["counts"]
        self.assertEqual(counts["nativeDefaultObjectsScanned"], 3)
        self.assertEqual(counts["anchorsInsideNativeGrid"], 2)
        self.assertEqual(counts["anchorOutsideGridOrUnknownDimensions"], 1)
        self.assertEqual(counts["nativeMaskAtAnchorIntersects"], 1)
        self.assertEqual(counts["nativeMaskAtAnchorDisjoint"], 1)
        self.assertFalse(data["placementLegalityVerified"])
        self.assertFalse(data["fullFootprintOccupancyVerified"])
        self.assertEqual(len(data["diagnosticSamples"]), 2)

    def test_four_bit_native_grid_extraction_and_verified_private_snapshot(self):
        self._use_original_terrain_version()
        target = self.base / "GridData/Villages/Village04-Test.json"
        original = bytes((0x01, 0x23, 0x41, 0x03, 0x20))
        target.write_bytes(
            field(1, 3) + field(2, 3) +
            field(4, struct.pack("<IIIII", 0, 8, 16, 32, 64)) +
            field(5, original))
        report = extract(self.game, self.out)
        self.assertEqual(report["nativeGridDecodeFailures"], 0)
        self.assertEqual(report["nativePackedGridHistogramCount"], 1)
        source = json.loads((self.out / "grids.json").read_text(encoding="utf-8"))
        self.assertEqual(source[0]["terrainDecoding"]["cellBits"], 4)
        self.assertEqual(source[0]["nativePaletteIndexCellCounts"], [2, 2, 2, 2, 1])
        self.assertEqual(validate_snapshot(self.out)["counts"]["grids"], 1)
        self.assertEqual(base64.b64decode(
            source[0]["compactedFloorTypesBase64"]), original)
        packed = package_snapshot(self.out, self.root / "four-bit-private.zip")
        self.assertFalse(packed["placementLegalityVerified"])
        with zipfile.ZipFile(self.root / "four-bit-private.zip") as archive:
            self.assertIsNone(archive.testzip())

    def test_hash_matching_histogram_corruption_is_rejected(self):
        self._use_original_terrain_version()
        target = self.base / "GridData/Villages/Village04-Test.json"
        target.write_bytes(
            field(1, 2) + field(2, 2) +
            field(4, struct.pack("<III", 0, 1024, 2048)) +
            field(5, bytes((0b10100101,))))
        extract(self.game, self.out)
        self.assertEqual(validate_snapshot(self.out)["counts"]["grids"], 1)
        filename = self.out / "grids.json"
        grids = json.loads(filename.read_text(encoding="utf-8"))
        grids[0]["nativePaletteIndexCellCounts"][0] += 1
        filename.write_text(json.dumps(grids), encoding="utf-8")
        manifest_file = self.out / "manifest.json"
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        manifest["outputSha256"]["grids.json"] = hashlib.sha256(
            filename.read_bytes()).hexdigest()
        manifest_file.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "histogram mismatches"):
            validate_snapshot(self.out)

    def test_steam1262_snapshot_retains_raw_and_derives_readonly_terrain(self):
        # The version-matched native 1.26.2 read path is now corroborated.
        # The extractor retains original raw bytes alongside derived counts.
        target = self.base / "GridData/Villages/Village04-Test.json"
        original = bytes((0x01, 0x23, 0x41, 0x03, 0x20))
        target.write_bytes(
            field(1, 3) + field(2, 3) +
            field(4, struct.pack("<IIIII", 0, 8, 16, 32, 64)) +
            field(5, original))
        report = extract(self.game, self.out)
        self.assertEqual(report["nativePackedGridHistogramCount"], 1)
        data = json.loads((self.out / "grids.json").read_text(encoding="utf-8"))
        self.assertEqual(len(data), 1)
        grid_data = data[0]
        self.assertEqual(grid_data["terrainDecoding"]["status"],
                         "cross_validated_native_samples")
        self.assertTrue(grid_data["terrainDecoding"]["decoded"])
        self.assertTrue(grid_data["nativeFloorIndexToLocalXYCorroborated"])
        self.assertEqual(grid_data["nativePaletteIndexCellCounts"],
                         [2, 2, 2, 2, 1])
        self.assertFalse(grid_data["terrainDecoding"]["placementLegalityVerified"])
        self.assertEqual(base64.b64decode(
            grid_data["compactedFloorTypesBase64"]), original)
        self.assertEqual(validate_snapshot(self.out)["counts"]["grids"], 1)

    def test_grid_parse_failure_is_explicit_not_silent(self):
        extract(self.game, self.out)
        report = json.loads((self.out / "report.json").read_text())
        self.assertEqual(report["nativeGridDecodeFailures"], 1)
        grid = json.loads((self.out / "grids.json").read_text())[0]
        self.assertEqual(grid["status"], "unrecognized_binary_structure")
        self.assertTrue(grid["parseError"])
        self.assertFalse(grid["terrainDecoding"]["decoded"])

    def test_snapshot_terrain_decode_evidence_must_match_original_bytes(self):
        self._use_original_terrain_version()
        target = self.base / "GridData/Villages/Village04-Test.json"
        target.write_bytes(
            field(1, 12) + field(2, 16) +
            field(4, struct.pack("<III", 0, 3072, 1024)) +
            field(5, bytes((0b01010101,)) * 48))
        extract(self.game, self.out)
        verified = validate_snapshot(self.out)
        self.assertEqual(verified["counts"]["grids"], 1)
        grids_file = self.out / "grids.json"
        grids = json.loads(grids_file.read_text())
        self.assertEqual(grids[0]["terrainDecoding"]["cellBits"], 2)
        self.assertFalse(grids[0]["terrainDecoding"]["nativeCodeBodyVerified"])
        grids[0]["terrainDecoding"]["cellBits"] = 1
        grids_file.write_text(json.dumps(grids), encoding="utf-8")
        manifest_file = self.out / "manifest.json"
        manifest = json.loads(manifest_file.read_text())
        manifest["outputSha256"]["grids.json"] = hashlib.sha256(
            grids_file.read_bytes()).hexdigest()
        manifest_file.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "evidence mismatches"):
            validate_snapshot(self.out)

    def test_snapshot_verifier_checks_manifest_and_native_links(self):
        extract(self.game, self.out)
        verified = validate_snapshot(self.out)
        self.assertEqual(verified["status"],
                         "integrity_verified_not_placement_verified")
        self.assertEqual(verified["counts"]["objects"], 2)
        self.assertEqual(verified["counts"]["layoutObjects"], 0)
        # Byte-level corruption is a hard integrity error.
        file = self.out / "objects.json"
        file.write_bytes(file.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "SHA mismatch"):
            validate_snapshot(self.out)

    def test_snapshot_verifier_rejects_mismatched_layout_cardinality(self):
        path = self.base / "SceneLayouts/Village04/NativeGrids.json"
        path.write_bytes(field(1, field(2,
            field(2, "GridData/Villages/Village04-Test.json") +
            field(5, field(2, field(2, 40000001) + field(3, 2) + field(4, 3))))))
        extract(self.game, self.out)
        self.assertEqual(validate_snapshot(self.out)["counts"]["layoutObjects"], 1)
        # Update hash to prove this check is independent of SHA matching.
        objects_path = self.out / "layoutObjects.json"
        objects_path.write_text("[]\n", encoding="utf-8")
        manifest_path = self.out / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["outputSha256"]["layoutObjects.json"] = hashlib.sha256(
            objects_path.read_bytes()).hexdigest()
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "object count mismatch"):
            validate_snapshot(self.out)

    def test_snapshot_rejects_forged_native_gridobject_identity_and_per_grid_count(self):
        source = self.base / "SceneLayouts/Village04/NativeGrids.json"
        source.write_bytes(field(1, field(2,
            field(2, "GridData/Villages/Village04-Test.json") +
            field(5, field(1, 7) +
                  field(2, field(1, 7) + field(2, 40000001) +
                        field(3, 2) + field(4, 3))))))
        extract(self.game, self.out)
        self.assertEqual(validate_snapshot(self.out)["counts"]["layoutObjects"], 1)
        manifest_file = self.out / "manifest.json"
        original_manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        layout_file = self.out / "layoutObjects.json"
        original_layout_bytes = layout_file.read_bytes()
        original_rows = json.loads(original_layout_bytes.decode("utf-8"))

        for field_name, forged in [
            ("gridObjectIdNative", 9),
            ("gridIdNative", 2),
            ("layoutObjectId", "SceneLayouts/Village04/NativeGrids.json#grid=0#object=9"),
        ]:
            forged_rows = json.loads(original_layout_bytes.decode("utf-8"))
            forged_rows[0][field_name] = forged
            layout_file.write_text(json.dumps(forged_rows), encoding="utf-8")
            updated_manifest = json.loads(json.dumps(original_manifest))
            updated_manifest["outputSha256"]["layoutObjects.json"] = hashlib.sha256(
                layout_file.read_bytes()).hexdigest()
            manifest_file.write_text(json.dumps(updated_manifest), encoding="utf-8")
            with self.subTest(field=field_name):
                with self.assertRaisesRegex(ValueError, "GridObject identity"):
                    validate_snapshot(self.out)

        # A matching top-level count is not enough if an individual Grid.ID
        # entry claims a different number of original GridObject records.
        self.assertEqual(len(original_rows), 1)
        layout_file.write_bytes(original_layout_bytes)
        manifest_file.write_text(json.dumps(original_manifest), encoding="utf-8")
        self.assertEqual(validate_snapshot(self.out)["counts"]["layoutObjects"], 1)
        layouts_file = self.out / "layouts.json"
        layouts = json.loads(layouts_file.read_text(encoding="utf-8"))
        target = next(row for row in layouts
                      if row["layoutId"] == "SceneLayouts/Village04/NativeGrids.json")
        target["nativeGridEntries"][0]["defaultObjectCount"] = 2
        layouts_file.write_text(json.dumps(layouts), encoding="utf-8")
        modified_manifest = json.loads(json.dumps(original_manifest))
        modified_manifest["outputSha256"]["layouts.json"] = hashlib.sha256(
            layouts_file.read_bytes()).hexdigest()
        manifest_file.write_text(json.dumps(modified_manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "per-grid object count mismatch"):
            validate_snapshot(self.out)

    def test_legacy_verified_partial_snapshot_without_default_placements(self):
        extract(self.game, self.out)
        path = self.out / "layoutObjects.json"
        path.unlink()
        manifest_file = self.out / "manifest.json"
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        manifest["outputSha256"].pop("layoutObjects.json")
        manifest_file.write_text(json.dumps(manifest), encoding="utf-8")
        scores = audit_footprint_candidates(self.out)
        self.assertEqual(scores["nativeLayoutObjectCount"], 0)
        self.assertFalse(scores["placementLegalityVerified"])
        packed = package_snapshot(self.out, self.root / "legacy-private.zip")
        self.assertEqual(packed["footprintHypothesisObjectCount"], 0)

    def test_private_zip_is_reproducible_and_contains_no_game_binaries(self):
        extract(self.game, self.out)
        first = self.root / "private-a.zip"
        second = self.root / "private-b.zip"
        a = package_snapshot(self.out, first)
        b = package_snapshot(self.out, second)
        self.assertEqual(a["zipSha256"], b["zipSha256"])
        self.assertEqual(a["zipBytes"], b["zipBytes"])
        self.assertEqual(a["status"], "verified_private_partial_snapshot_package")
        self.assertFalse(a["includesOriginalGameBinaries"])
        self.assertFalse(a["includesPlayerSaves"])
        self.assertFalse(a["placementLegalityVerified"])
        with zipfile.ZipFile(first) as archive:
            names = set(archive.namelist())
            self.assertIn("manifest.json", names)
            self.assertIn("grids.json", names)
            self.assertIn("layoutObjects.json", names)
            self.assertIn("diagnostics/verification.json", names)
            self.assertIn("diagnostics/layout-terrain-audit.json", names)
            self.assertIn("diagnostics/footprint-hypotheses.json", names)
            candidate = json.loads(archive.read(
                "diagnostics/footprint-hypotheses.json"))
            self.assertFalse(candidate["placementLegalityVerified"])
            self.assertFalse(candidate["footprintLayerIndexOrderVerified"])
            self.assertTrue(all(name.endswith(".json") for name in names))
            self.assertFalse(any(name.endswith((".dll", ".bin", ".sav"))
                                 for name in names))
            self.assertIsNone(archive.testzip())

    def test_private_zip_rejects_overwrites_git_trees_and_modified_hashes(self):
        extract(self.game, self.out)
        dest = self.root / "first.zip"
        package_snapshot(self.out, dest)
        with self.assertRaisesRegex(ValueError, "overwrite"):
            package_snapshot(self.out, dest)

        git = self.root / "git"
        (git / ".git").mkdir(parents=True)
        with self.assertRaisesRegex(ValueError, "Git worktree"):
            package_snapshot(self.out, git / "private.zip")

        raw = self.out / "objects.json"
        raw.write_bytes(raw.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "SHA mismatch"):
            package_snapshot(self.out, self.root / "tampered.zip")

    def test_private_pe_capture_uses_only_matching_il2cpp_rvas(self):
        dump, raw = self._write_native_pe_fixture()
        report = capture_native_pe(self.game, dump_cs=dump,
                                   dump_game_version="1.26.2",
                                   window_bytes=64)
        self.assertEqual(report["status"],
                         "version_asserted_il2cpp_rva_byte_windows_captured")
        self.assertTrue(report["sourceRvaMappingVerified"])
        self.assertTrue(report["peUnwindStartCorroborated"])
        self.assertEqual(report["peUnwindRecordCount"], 1)
        self.assertEqual(report["methodWindows"][0]["peUnwindFunctionEndRva"],
                         0x1060)
        self.assertFalse(report["nativeCodeBodyVerified"])
        self.assertFalse(report["nativeFootprintRotationVerified"])
        self.assertEqual(len(report["methodWindows"]), 1)
        window = report["methodWindows"][0]
        self.assertEqual(window["symbol"], "Definitions.Grid.GridData.get_Item")
        self.assertEqual(window["rva"], 0x1020)
        self.assertEqual(window["fileOffset"], 0x420)
        self.assertEqual(window["sectionName"], ".text")
        self.assertEqual(window["rawWindowHex"], raw.hex())
        self.assertFalse(window["windowIsEntireMethod"])
        validate_private_report(report, game_version="1.26.2")

        plain = capture_native_pe(self.game)
        self.assertEqual(plain["status"],
                         "pe64_binary_identified_no_version_matched_dump")
        self.assertEqual(plain["methodWindows"], [])
        self.assertFalse(plain["sourceRvaMappingVerified"])
        with self.assertRaisesRegex(ValueError, "differs"):
            capture_native_pe(self.game, dump_cs=dump,
                              dump_game_version="1.26.1")
        with self.assertRaisesRegex(ValueError, "version provided"):
            capture_native_pe(self.game, dump_game_version="1.26.2")

    def test_identical_version_does_not_make_pe_interior_rva_valid(self):
        dump, _ = self._write_native_pe_fixture()
        matches = target_methods_from_dump(dump)
        audit = correlate_rvas(self.game / "GameAssembly.dll", matches)
        self.assertTrue(audit["allTargetRvasAtPeUnwindStarts"])
        self.assertEqual(audit["originalPeUnwindRecordCount"], 1)
        self.assertEqual(audit["counts"]["exact_pe_unwind_function_start"], 1)
        self.assertEqual(len(read_pe_runtime_functions(
            self.game / "GameAssembly.dll")[0]), 1)

        altered = dump.read_text(encoding="utf-8").replace(
            "RVA: 0x1020", "RVA: 0x1021")
        dump.write_text(altered, encoding="utf-8")
        audit = correlate_rvas(
            self.game / "GameAssembly.dll", target_methods_from_dump(dump))
        self.assertFalse(audit["allTargetRvasAtPeUnwindStarts"])
        self.assertEqual(audit["counts"]["inside_other_pe_unwind_function"], 1)
        self.assertEqual(audit["methods"][0]["unwindFunctionBeginRva"], 0x1020)
        self.assertEqual(audit["methods"][0]["distanceFromRuntimeFunctionStart"],
                         1)
        with self.assertRaisesRegex(ValueError, "disagrees"):
            capture_native_pe(
                self.game, dump_cs=dump, dump_game_version="1.26.2")

    def test_native_pe_report_is_private_bounded_and_packageable(self):
        dump, _ = self._write_native_pe_fixture()
        extract(self.game, self.out)
        report = capture_native_pe(self.game, dump_cs=dump,
                                   dump_game_version="1.26.2",
                                   window_bytes=64)
        file = self.out / "native-pe-evidence.json"
        write_private_report(report, file)
        with self.assertRaisesRegex(ValueError, "new JSON target"):
            write_private_report(report, file)
        summary = package_snapshot(self.out, self.root / "pe-evidence.zip")
        self.assertTrue(summary["nativePEEvidenceIncluded"])
        self.assertEqual(summary["nativePEMethodWindowCount"], 1)
        self.assertFalse(summary["nativeCodeBodyVerified"])
        with zipfile.ZipFile(self.root / "pe-evidence.zip") as archive:
            found = json.loads(archive.read("diagnostics/native-pe-evidence.json"))
            self.assertEqual(found["methodWindows"][0]["rawWindowHex"],
                             report["methodWindows"][0]["rawWindowHex"])
            self.assertFalse(found["placementLegalityVerified"])

        # The original byte window may decode only a PREFIX, which is
        # diagnostic and never a statement about an entire native function.
        disasm = disassemble_private_windows(report)
        self.assertFalse(disasm["nativeFunctionBoundaryVerified"])
        self.assertFalse(disasm["nativeControlFlowVerified"])
        write_private_disassembly(
            disasm, report, self.out / "native-disassembly.json")
        assembled = package_snapshot(self.out, self.root / "pe-and-asm.zip")
        self.assertTrue(assembled["nativeDisassemblyIncluded"])
        self.assertEqual(assembled["nativeDisassemblyInstructionCount"],
                         disasm["totalInstructions"])
        with zipfile.ZipFile(self.root / "pe-and-asm.zip") as archive:
            listing = json.loads(
                archive.read("diagnostics/native-disassembly.json"))
            self.assertEqual(listing["nativePEEvidenceSha256"],
                             disasm["nativePEEvidenceSha256"])
            self.assertFalse(listing["nativeCodeBodyVerified"])

        altered = dict(report)
        altered["gameVersion"] = "1.26.1"
        file.write_text(json.dumps(altered), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "version mismatch"):
            package_snapshot(self.out, self.root / "wrong-native-version.zip")

    def test_native_pe_invalid_rvas_or_patched_windows_are_rejected(self):
        dump, _ = self._write_native_pe_fixture()
        sections = pe64_sections(self.game / "GameAssembly.dll")
        self.assertEqual(file_offset_for_rva(sections, 0x1020, 64)[0], 0x420)
        with self.assertRaisesRegex(ValueError, "not in one"):
            file_offset_for_rva(sections, 0x2000, 64)
        methods = target_methods_from_dump(dump)
        self.assertEqual(len(methods), 1)
        report = capture_native_pe(self.game, dump_cs=dump,
                                   dump_game_version="1.26.2",
                                   window_bytes=64)
        report["methodWindows"][0]["rawWindowHex"] = "00" * 64
        with self.assertRaisesRegex(ValueError, "digest"):
            validate_private_report(report)
        source = self.game / "GameAssembly.dll"
        original = source.read_bytes()
        source.write_bytes(b"oops" + original[4:])
        with self.assertRaisesRegex(ValueError, "DOS header"):
            capture_native_pe(self.game)

    def test_private_native_pe_status_and_version_claims_fail_closed(self):
        dump, _ = self._write_native_pe_fixture()
        matched = capture_native_pe(
            self.game, dump_cs=dump,
            dump_game_version="1.26.2", window_bytes=64)
        plain = capture_native_pe(self.game)
        plain["sourceRvaMappingVerified"] = True
        with self.assertRaisesRegex(ValueError, "falsely claims"):
            validate_private_report(plain)
        plain["sourceRvaMappingVerified"] = False
        plain["dumpCsVersionAssertion"] = "1.26.2"
        with self.assertRaisesRegex(ValueError, "falsely claims"):
            validate_private_report(plain)

        report = dict(matched)
        report["dumpCsVersionAssertion"] = "1.26.1"
        with self.assertRaisesRegex(ValueError, "version-asserted"):
            validate_private_report(report)
        report = dict(matched)
        report["sourceRvaMappingVerified"] = False
        with self.assertRaisesRegex(ValueError, "version-asserted"):
            validate_private_report(report)
        report = dict(matched)
        report["status"] = "pe64_binary_identified_no_version_matched_dump"
        with self.assertRaisesRegex(ValueError, "falsely claims"):
            validate_private_report(report)

        report = dict(matched)
        report["methodWindows"] = [dict(matched["methodWindows"][0])]
        report["methodWindows"][0]["windowIsEntireMethod"] = True
        with self.assertRaisesRegex(ValueError, "digest or source claim"):
            validate_private_report(report)
        report["methodWindows"][0]["windowIsEntireMethod"] = False
        report["methodWindows"][0]["fileOffset"] = matched["dllSizeBytes"]
        with self.assertRaisesRegex(ValueError, "digest or source claim"):
            validate_private_report(report)

    def test_pe64_rva_must_be_mapped_native_code_not_file_padding(self):
        self._write_native_pe_fixture()
        sections = pe64_sections(self.game / "GameAssembly.dll")
        sections[0]["virtualSize"] = 0x80
        self.assertEqual(file_offset_for_rva(sections, 0x1020, 64)[0], 0x420)
        with self.assertRaisesRegex(ValueError, "not in one"):
            file_offset_for_rva(sections, 0x1080, 64)
        with self.assertRaisesRegex(ValueError, "fewer than 32"):
            file_offset_for_rva(sections, 0x1070, 64)
        with self.assertRaisesRegex(ValueError, "window length"):
            file_offset_for_rva(sections, 0x1020, 0)

    def test_il2cpp_rva_must_not_flow_into_unrelated_method_declaration(self):
        dump, _ = self._write_native_pe_fixture()
        dump.write_text(
            "// Namespace: Definitions.Grid\n"
            "public class GridData\n"
            "{\n"
            "    // RVA: 0x1020 Offset: 0x420 VA: 0x180001020\n"
            "    public int unrelated(int x) { }\n"
            "    public int get_Item(int x) { }\n"
            "}\n", encoding="utf-8")
        self.assertEqual(target_methods_from_dump(dump), [])
        with self.assertRaisesRegex(ValueError, "no target GridData"):
            capture_native_pe(self.game, dump_cs=dump,
                              dump_game_version="1.26.2", window_bytes=64)

    def test_refuse_game_output_overlap(self):
        with self.assertRaisesRegex(ValueError, "overlap"):
            extract(self.game, self.game / "outputs")


if __name__ == "__main__":
    unittest.main()
