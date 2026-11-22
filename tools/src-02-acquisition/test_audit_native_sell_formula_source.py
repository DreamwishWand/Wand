"""Synthetic and original-independent regression tests for the DB-02 audit."""
import unittest
import struct
from audit_native_sell_formula_source import (
    audit, fields, frames, packed_ids, parse_sell_definition, varint,
)


def vint(value):
    buf = bytearray()
    while True:
        byte = value & 127
        value >>= 7
        buf.append(byte | (128 if value else 0))
        if not value:
            return bytes(buf)


def field(n, wire, data):
    return vint(n * 8 + wire) + (vint(len(data)) + data if wire == 2 else data)


def scalar(n, val):
    return field(n, 0, vint(val))


def text(n, val):
    return field(n, 2, val.encode())


class NativeSellFormulaAuditTests(unittest.TestCase):
    def test_frame_decodes_native_outer_keys(self):
        payload = scalar(1, 777) + text(6, 'synthetic')
        frame = vint(7) + vint(len(payload)) + payload
        self.assertEqual(len(frames(frame)), 1)
        self.assertEqual(frames(frame)[777][0], (1, 0, 777))
        with self.assertRaisesRegex(ValueError, 'INVALID_FORMULA_FRAME'):
            frames(frame + frame)

    def test_bad_varint_and_wire_fail_closed(self):
        for x in [b'\x80', b'\x80\x00', b'\xff' * 11]:
            with self.subTest(x=x), self.assertRaises(ValueError):
                varint(x, 0)
        with self.assertRaisesRegex(ValueError, 'TRUNCATED_MESSAGE'):
            fields(field(1, 2, b'xx')[:-1])
        with self.assertRaisesRegex(ValueError, 'INVALID_WIRE'):
            fields(b'\x0b')

    def test_packed_references_reject_duplicate(self):
        self.assertEqual(packed_ids(vint(1)+vint(100)), [1, 100])
        with self.assertRaisesRegex(ValueError, 'INVALID_FORMULA_REFERENCE'):
            packed_ids(vint(1)+vint(1))

    def test_generic_sell_formula_table_is_source_only(self):
        row = text(1, '123') + field(2, 5, struct.pack('<f', 12.0))
        table = text(1, 'sample') + text(2, 'object') + field(4, 2, row)
        source = (text(6, 'SyntheticItemType') + scalar(7, 80000000) +
                  text(8, '{sample}') + field(9, 2, table))
        currency, typ, values = parse_sell_definition(fields(source))
        self.assertEqual(currency, 80000000)
        self.assertEqual(typ, 'SyntheticItemType')
        self.assertEqual(values, {123: 12})
        with self.assertRaisesRegex(ValueError, 'INVALID_TABLE_VALUE'):
            parse_sell_definition(fields(source.replace(struct.pack('<f', 12.0),
                                                        struct.pack('<f', -2.0))))

    def test_untrusted_synthetic_original_must_fail_sha(self):
        with self.assertRaisesRegex(ValueError, 'FORMULA_ORIGINAL_SHA'):
            audit(b'x'*8760, b'y'*1335720)


if __name__ == '__main__':
    unittest.main()
