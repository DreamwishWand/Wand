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
    candidate_layer_cells, projection_hypotheses, validate_footprint)
from audit_layout_terrain import audit_snapshot
from package_snapshot import package_snapshot
from verify_bundle import validate_snapshot
from terrain_codec import (describe_native_packing, floor_at, decode_window,
                           count_packed_palette_indices, EVIDENCE)

from world import (STREAM, diff_records, encode_varint, explicit_references,
                   extract, footprint, parse_grid_structure, parse_itemlist,
                   parse_world_registry, grid_collection_layout,
                   default_village_layout, restrictions, wire_fields)


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
        evidence = describe_native_packing(size_x, size_y, palette, bytes(packed))
        self.assertTrue(evidence["decoded"])
        self.assertFalse(evidence["nativeCodeBodyVerified"])
        self.assertEqual(evidence["sampleBasedEncodingEvidence"], EVIDENCE)
        actual = decode_window(size_x, size_y, palette, bytes(packed),
                               0, 0, size_x, size_y)
        self.assertEqual(actual[0], [3072] * size_x)
        self.assertEqual(actual[1], [3072] + [1024] * 10 + [3072])
        self.assertEqual(actual[-1], [3072] * size_x)
        self.assertEqual(sum(1 for y in range(size_y) for x in range(size_x)
                             if actual[y][x] == (3072 if x in (0, 11) or
                                  y in (0, 15) else 1024)), 192)
        self.assertEqual(floor_at(size_x, size_y, palette, bytes(packed),
                                  5, 5), 1024)
        with self.assertRaisesRegex(ValueError, "outside"):
            floor_at(size_x, size_y, palette, bytes(packed), 12, 0)

    def test_native_1bit_compaction_and_partial_byte_padding(self):
        palette = [0, 1024]
        packed = bytes((0b11111111, 0b10000000))  # nine cells, 7 padded bits
        evidence = describe_native_packing(3, 3, palette, packed)
        self.assertTrue(evidence["decoded"])
        self.assertEqual(evidence["cellBits"], 1)
        self.assertEqual(decode_window(3, 3, palette, packed, 0, 0, 3, 3),
                         [[1024] * 3] * 3)
        with self.assertRaisesRegex(ValueError, "padding"):
            describe_native_packing(3, 3, palette, bytes((255, 129)))
        with self.assertRaisesRegex(ValueError, "length"):
            describe_native_packing(3, 3, palette, bytes((255,)))
        with self.assertRaisesRegex(ValueError, "palette"):
            describe_native_packing(2, 2, [0, 1024, 2048], bytes((255,)))

    def test_native_palette_3bit_or_higher_remains_explicitly_unresolved(self):
        p = describe_native_packing(5, 5, [0, 1, 2, 3, 4], bytes(25))
        self.assertEqual(p["status"], "unresolved_palette_cardinality")
        self.assertFalse(p["decoded"])
        with self.assertRaisesRegex(ValueError, "unresolved"):
            decode_window(5, 5, [0, 1, 2, 3, 4],
                          bytes(25), 0, 0, 2, 2)

    def test_source_palette_index_histogram_exact_counts_and_tail(self):
        self.assertEqual(count_packed_palette_indices(
            2, 2, [0, 1024, 2048], bytes((0b10100101,))), [0, 2, 2])
        self.assertEqual(count_packed_palette_indices(
            3, 3, [0, 1024], bytes((0xff, 0x80))), [0, 9])
        self.assertIsNone(count_packed_palette_indices(
            5, 5, [0, 1, 2, 3, 4], bytes(25)))
        with self.assertRaisesRegex(ValueError, "index missing"):
            count_packed_palette_indices(
                2, 2, [0, 1024, 2048], bytes((0xff,)))

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
        grid = parse_grid_structure(raw)
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

    def test_native_uncompacted_grid_fixed32_values(self):
        raw = field(1, 2) + field(2, 2) + field(3, struct.pack("<IIII", 4, 4, 512, 0))
        grid = parse_grid_structure(raw)
        self.assertEqual(grid["nativeFloorTypes"], [4, 4, 512, 0])
        self.assertEqual(grid["status"], "native_uncompacted_floor_values")
        with self.assertRaises(ValueError):
            parse_grid_structure(field(1, 1) + field(2, 1) + field(4, b"\x01"))

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

    def tearDown(self):
        self.tmp.cleanup()

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
        truncated = audit_footprint_candidates(self.out, max_objects=1)
        self.assertTrue(truncated["truncatedByMaxObjects"])

    def test_native_default_layout_grid_origin_audit_is_not_placement_permission(self):
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

    def test_hash_matching_histogram_corruption_is_rejected(self):
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

    def test_grid_parse_failure_is_explicit_not_silent(self):
        extract(self.game, self.out)
        report = json.loads((self.out / "report.json").read_text())
        self.assertEqual(report["nativeGridDecodeFailures"], 1)
        grid = json.loads((self.out / "grids.json").read_text())[0]
        self.assertEqual(grid["status"], "unrecognized_binary_structure")
        self.assertTrue(grid["parseError"])
        self.assertFalse(grid["terrainDecoding"]["decoded"])

    def test_snapshot_terrain_decode_evidence_must_match_original_bytes(self):
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

    def test_refuse_game_output_overlap(self):
        with self.assertRaisesRegex(ValueError, "overlap"):
            extract(self.game, self.game / "outputs")


if __name__ == "__main__":
    unittest.main()
