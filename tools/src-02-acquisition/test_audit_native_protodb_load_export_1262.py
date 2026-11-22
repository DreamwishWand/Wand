"""Synthetic tests of original Steam ProtoDatabase lifecycle call-graph audit."""
import struct
import unittest

from audit_native_protodb_load_export_1262 import (
    audit, scan_direct_rel32_targets, verify_assembly,
    verify_method_metadata, verify_rel32,
)


def rel(site, target, opcode):
    return bytes((opcode,)) + struct.pack('<i', target - site - 5)


class NativeProtoDbLoadExportTests(unittest.TestCase):
    def test_byte_scan_accounts_for_both_direct_calls_and_jumps(self):
        base = 0x1000
        raw = bytearray(b'\\x90' * 80)
        raw[10:15] = rel(base + 10, 0x2000, 0xE8)
        raw[30:35] = rel(base + 30, 0x2100, 0xE9)
        actual = scan_direct_rel32_targets(bytes(raw), base,
                                           [0x2000, 0x2100, 0x2200])
        self.assertEqual(actual[0x2000], ((base+10, 0xE8),))
        self.assertEqual(actual[0x2100], ((base+30, 0xE9),))
        self.assertEqual(actual[0x2200], ())

    def test_exact_transfer_is_checked_not_guessed(self):
        site, target = 0x380B475, 0x380A910
        good = rel(site, target, 0xE8)
        self.assertTrue(verify_rel32(
            lambda a, n: good if a == site and n == 5 else b'',
            site, target, 0xE8))
        with self.assertRaisesRegex(ValueError, 'REL32_TARGET'):
            verify_rel32(lambda _a, _n: good,
                         site, target+1, 0xE8)
        with self.assertRaisesRegex(ValueError, 'REL32_OPCODE'):
            verify_rel32(lambda _a, _n: good,
                         site, target, 0xE9)

    def test_bad_scan_inputs_rejected(self):
        for raw, base, targets in [
            (b'', -1, [0x20]), ('bytes', 0, [0x20]),
            (b'raw', 0, ['target']), (b'raw', 0, None),
        ]:
            with self.assertRaisesRegex(ValueError, 'INVALID_REL32_SCAN_INPUT'):
                scan_direct_rel32_targets(raw, base, targets)

    def test_fake_original_metadata_and_executable_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_DUMP_SHA'):
            verify_method_metadata(b'not-original')
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_DLL_SIZE'):
            verify_assembly('/no-such-original-steam.dll')
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_PROTO_SHA'):
            audit(b'not-original', b'not-original',
                  '/no-such-original-steam.dll')


if __name__ == '__main__':
    unittest.main()
