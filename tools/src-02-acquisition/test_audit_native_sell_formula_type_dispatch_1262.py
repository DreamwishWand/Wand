"""DB-02 source-independent tests for the native sell formula Type dispatch audit."""
import io
import struct
import unittest

from audit_native_sell_formula_type_dispatch_1262 import (
    pe_il2cpp_section, source_method_rva, verified_relative_call,
    verify_original_native_dispatch,
)


class NativeFormulaTypeDispatchTests(unittest.TestCase):
    def test_scoped_method_rva_from_synthetic_dump(self):
        source = """\
public sealed class Example : IMessage // TypeDefIndex: 42
{
    // RVA: 0x4021150 Offset: 0x401F950 VA: 0x184021150
    public bool IsValid() { }
}
"""
        self.assertEqual(source_method_rva(
            source, 'Example', 'public bool IsValid() { }'), 0x4021150)

    def test_duplicate_class_fails_closed(self):
        block = """\
public sealed class Example : IMessage // TypeDefIndex: 42
{
    // RVA: 0x4021150 Offset: 0x401F950 VA: 0x184021150
    public bool IsValid() { }
}
"""
        with self.assertRaisesRegex(ValueError, 'DUMP_CLASS_NOT_UNIQUE'):
            source_method_rva(block + block, 'Example',
                              'public bool IsValid() { }')

    def test_call_relative_displacement_forward_and_backward(self):
        site = 0x402115B
        for target in (site - 200, site + 800):
            data = b'\xe8' + struct.pack('<i', target - (site + 5))
            self.assertTrue(verified_relative_call(
                lambda r, n: data if (r, n) == (site, 5) else None,
                site, target))

    def test_call_wrong_target_fails_closed(self):
        site = 0x402115B
        data = b'\xe8' + struct.pack('<i', -8)
        with self.assertRaisesRegex(ValueError, 'UNEXPECTED_CALL_TARGET'):
            verified_relative_call(lambda r, n: data, site, site + 1)
        with self.assertRaisesRegex(ValueError, 'MISSING_DIRECT_CALL'):
            verified_relative_call(lambda r, n: b'\x90' * 5,
                                   site, site - 3)

    def test_pe_executable_il2cpp_section_synthetic(self):
        raw = bytearray(0x700)
        raw[:2] = b'MZ'
        struct.pack_into('<I', raw, 0x3C, 0x80)
        raw[0x80:0x84] = b'PE\x00\x00'
        struct.pack_into('<HH', raw, 0x84, 0x8664, 1)
        struct.pack_into('<H', raw, 0x94, 0xF0)
        struct.pack_into('<H', raw, 0x98, 0x20B)
        struct.pack_into('<Q', raw, 0x98 + 24, 0x180000000)
        section_at = 0x98 + 0xF0
        raw[section_at:section_at + 8] = b'il2cpp\x00\x00'
        struct.pack_into('<IIII', raw, section_at + 8,
                         0x200, 0x670000, 0x200, 0x400)
        struct.pack_into('<I', raw, section_at + 36, 0x60000020)
        self.assertEqual(pe_il2cpp_section(
            io.BytesIO(raw), len(raw)), (0x670000, 0x200, 0x400))
        raw[section_at + 36:section_at + 40] = b'\x00' * 4
        with self.assertRaisesRegex(ValueError, 'PE_EXECUTABLE_SECTION'):
            pe_il2cpp_section(io.BytesIO(raw), len(raw))

    def test_rejects_untrusted_original_dump_before_any_io(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_DUMP_SHA'):
            verify_original_native_dispatch('/nonexistent',
                                            b'synthetic', b'', b'')


if __name__ == '__main__':
    unittest.main()
