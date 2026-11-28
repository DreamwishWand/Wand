"""Invented wire fixtures only; no game originals or Save values."""
import struct
import unittest

from world import (STREAM, encode_varint, wire_fields, grid_collection_layout,
                   attach_native_diffgrid_hashes, native_grid_data_hash,
                   native_stateless_grid_hash, native_string_hash,
                   native_grid_state_hash)


def field(n, value):
    if isinstance(value, int):
        return encode_varint(n << 3) + encode_varint(value)
    if isinstance(value, str):
        value = value.encode("utf-8")
    return encode_varint((n << 3) | 2) + encode_varint(len(value)) + value


PATH = "GridData/Test.json"
LAYOUT = STREAM / "SceneLayouts/Test.json"


def obj(key=7, state=None, source=None):
    raw = field(1, key) + field(2, 123) + field(3, (1 << 64) - 2)
    raw += field(4, 3) + field(5, 4)
    if state is not None:
        raw += field(6, state)
    if source is not None:
        raw += field(7, source)
    return field(5, field(1, key) + field(2, raw))


def grid(*objects):
    return field(1, 5) + field(2, PATH) + field(4, 2) + b"".join(objects) + field(6, 8)


def collection(raw):
    return field(1, field(1, 5) + field(2, raw))


class DiffGridNativeHashTests(unittest.TestCase):
    def test_reference_vectors(self):
        self.assertEqual(native_string_hash(PATH), 0x71408043)
        self.assertEqual(native_stateless_grid_hash(wire_fields(grid(obj()))),
                         1900052496)
        direct = field(1, 2) + field(2, 2) + field(3, struct.pack("<4I", 1, 2, 3, 4))
        self.assertEqual(native_grid_data_hash(direct), 31811)
        packed = field(1, 2) + field(2, 2) + field(4, struct.pack("<2I", 5, 7)) + field(5, b"\x12")
        self.assertEqual(native_grid_data_hash(packed), 632)

    def test_order_and_unknown_fields(self):
        self.assertEqual(native_stateless_grid_hash(wire_fields(grid(obj(7), obj(3)))),
                         native_stateless_grid_hash(wire_fields(grid(obj(3), obj(7)))))
        with self.assertRaises(ValueError):
            native_stateless_grid_hash(wire_fields(grid(obj(7), obj(7))))
        with self.assertRaises(ValueError):
            native_stateless_grid_hash(wire_fields(grid(obj(state=field(99, b"")))))
        with self.assertRaises(ValueError):
            native_grid_data_hash(field(1, 2) + field(2, 2) + field(99, 1))

    def test_nested_native_state_hashes(self):
        cases = [
            (b"", 1, 1900052502),
            (field(1, field(1, 22)), 23, 1900052512),
            (field(2, field(1, field(1, 5)) +
                   field(2, field(4, field(1, field(1, 10) + field(2, 2)))) +
                   field(3, field(1, 3))), 9, 1900052526),
            (field(8, field(2, field(1, 42) + field(2, field(2, 3)))),
             33, 1900052534),
            (field(11, field(1, 9) + field(2, "test") + field(3, 12) +
                   field(4, "lock") + field(5, field(1, 4))),
             4117133635, 2077820884),
            (field(14, field(1, field(1, 1))), 15, 1900052520),
            (field(15, field(1, 6)), 9, None),
            (field(22, b""), 22, None),
            (field(23, field(1, 1)), 22, None),
        ]
        for state, expected, grid_expected in cases:
            with self.subTest(state=state):
                self.assertEqual(native_grid_state_hash(state) & 0xffffffff, expected)
                if grid_expected is not None:
                    self.assertEqual(native_stateless_grid_hash(
                        wire_fields(grid(obj(state=state, source=0)))), grid_expected)
        with self.assertRaises(ValueError):
            native_grid_state_hash(field(1, b"") + field(2, b""))
        with self.assertRaises(ValueError):
            native_grid_state_hash(field(2, field(2, field(99, b""))))

    def test_pair_only_when_both_sources_resolved(self):
        raw = collection(grid(obj()))
        layout, _ = grid_collection_layout(raw, LAYOUT)
        row = layout["nativeGridEntries"][0]
        attach_native_diffgrid_hashes(layout, raw, None)
        self.assertNotIn("defaultHashEvidence", row)
        attach_native_diffgrid_hashes(layout, raw, {})
        self.assertNotIn("defaultHashEvidence", row)
        attach_native_diffgrid_hashes(layout, raw, {PATH: 31811})
        self.assertEqual(row["defaultHashEvidence"], "source_native_method_correlated")
        self.assertEqual(row["defaultGridHashCode"], 1900052496)
        self.assertEqual(row["defaultGridDataHashCode"], 31811)
        # Wrapped collections use exactly the same native Grid identity.
        wrapped, _ = grid_collection_layout(raw, LAYOUT)
        wrapped["embeddedGridCollectionWireField"] = 2
        attach_native_diffgrid_hashes(wrapped, field(1, b"") + field(2, raw),
                                      {PATH: 31811})
        self.assertEqual(wrapped["nativeGridEntries"][0], row)

    def test_stateful_grid_keeps_existing_read_path_without_hash_pair(self):
        raw = collection(grid(obj(state=b"unknown")))
        layout, objects = grid_collection_layout(raw, LAYOUT)
        attach_native_diffgrid_hashes(layout, raw, {PATH: 31811})
        self.assertEqual(len(objects), 1)
        self.assertNotIn("defaultGridHashCode", layout["nativeGridEntries"][0])


if __name__ == "__main__":
    unittest.main()
