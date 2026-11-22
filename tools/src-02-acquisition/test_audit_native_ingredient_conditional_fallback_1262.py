"""Synthetic source-independent native ingredient fallback verifier tests."""
import struct
import unittest

from audit_native_ingredient_conditional_fallback_1262 import (
    audit, verify_original_native_fallback, verify_relative_transfer,
)


class NativeIngredientConditionalFallbackTests(unittest.TestCase):
    def test_native_tail_jump_is_relative_signed_displacement(self):
        site = 0x3E1FFD0
        target = 0x383B420
        blob = b'\xe9' + struct.pack('<i', target - site - 5)
        reader = lambda rva, count: blob if (rva, count) == (site, 5) else b''
        self.assertTrue(verify_relative_transfer(reader, site, target, 0xE9))

    def test_wrong_transfer_destination_and_opcode_rejected(self):
        site = 0x3E1FFD0
        target = 0x383B420
        blob = b'\xe9' + struct.pack('<i', target - site - 5)
        with self.assertRaisesRegex(ValueError, 'DIRECT_TRANSFER_TARGET'):
            verify_relative_transfer(lambda _r, _n: blob,
                                     site, target + 1, 0xE9)
        with self.assertRaisesRegex(ValueError, 'DIRECT_TRANSFER_OPCODE'):
            verify_relative_transfer(lambda _r, _n: blob,
                                     site, target, 0xE8)

    def test_refuse_missing_original_gameassembly(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_DLL_SIZE'):
            verify_original_native_fallback('/missing/Steam-v1.26.2.dll')

    def test_refuse_fake_source_before_native(self):
        with self.assertRaisesRegex(ValueError, 'R5_MANIFEST_SHA'):
            audit(b'{}', b'fake-recipes', b'fake-db',
                  '/missing/Steam-v1.26.2.dll')


if __name__ == '__main__':
    unittest.main()
