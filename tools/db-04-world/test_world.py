import base64
import json
import struct
import tempfile
import unittest
from pathlib import Path

from world import (STREAM, diff_records, encode_varint, explicit_references,
                   extract, footprint, parse_grid_structure, parse_itemlist,
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

    def test_native_grid_fixed32_palette_and_compacted_payload(self):
        palette = struct.pack("<III", 0, 3072, 1024)
        compacted = b"\x55" * 48
        raw = (field(1, 12) + field(2, 16) +
               field(4, palette) + field(5, compacted))
        grid = parse_grid_structure(raw)
        self.assertEqual((grid["sizeX"], grid["sizeY"]), (12, 16))
        self.assertEqual(grid["nativeFloorTypePalette"], [0, 3072, 1024])
        self.assertEqual(base64.b64decode(grid["compactedFloorTypesBase64"]), compacted)
        self.assertEqual(grid["floorTypeEnumSymbols"]["1024"], "Floor")
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
        self.assertEqual(delta["entities"]["objects"]["changed"][0]["id"], "40000001")

    def test_refuse_game_output_overlap(self):
        with self.assertRaisesRegex(ValueError, "overlap"):
            extract(self.game, self.game / "outputs")


if __name__ == "__main__":
    unittest.main()
