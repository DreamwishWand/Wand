"""Synthetic regression tests for the original native dynamic cache rebuild audit."""
import struct
import unittest

from audit_native_dynamic_cache_rebuild_1262 import (
    audit, verify_method_metadata, verify_original_assembly, verify_rel32,
)


def rel32(site, target, opcode=0xE8):
    return bytes([opcode]) + struct.pack('<i', target - site - 5)


class NativeDynamicCacheRebuildAuditTests(unittest.TestCase):
    def test_original_on_binarize_tail_transfer_shape(self):
        site, target = 0x383A392, 0x38398F0
        buf = rel32(site, target, opcode=0xE9)
        self.assertTrue(verify_rel32(lambda _r, _n: buf,
                                     site, target, 0xE9))

    def test_constructor_and_formula_calls_have_checked_targets(self):
        for site, target in [
            (0x3839ABC, 0x3835F40),
            (0x383A0CE, 0x4021150),
            (0x383A1FE, 0x4020120),
        ]:
            raw = rel32(site, target)
            self.assertTrue(verify_rel32(lambda _r, _n: raw,
                                         site, target, 0xE8))
            with self.assertRaisesRegex(ValueError,
                                        'NATIVE_RELATIVE_TRANSFER_TARGET'):
                verify_rel32(lambda _r, _n: raw,
                             site, target + 1, 0xE8)

    def test_wrong_opcode_fails_closed(self):
        src, dst = 0x383A392, 0x38398F0
        raw = rel32(src, dst, opcode=0xE9)
        with self.assertRaisesRegex(ValueError,
                                    'NATIVE_RELATIVE_TRANSFER_OPCODE'):
            verify_rel32(lambda _r, _n: raw, src, dst, 0xE8)

    def test_untrusted_dump_rejected(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_DUMP_SHA'):
            verify_method_metadata(b'not the original dump')

    def test_untrusted_assembly_rejected(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_DLL_SIZE'):
            verify_original_assembly('/no-such-original-binary.dll')

    def test_entire_original_source_is_required(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_PROTODB_SHA'):
            audit(b'untrusted proto source', b'untrusted dump',
                  '/missing/gameassembly.dll')


if __name__ == '__main__':
    unittest.main()
