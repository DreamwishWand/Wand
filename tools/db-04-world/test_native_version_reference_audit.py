import unittest

from native_version_reference_audit import (
    PINS, compare_methods, decode_window, parse_instructions, relocation_only,
)


def rel32(target, instruction_end):
    return (target - instruction_end).to_bytes(4, "little", signed=True)


class NativeReferenceAuditTests(unittest.TestCase):
    def test_original_source_pins_are_explicitly_versioned(self):
        self.assertEqual(set(PINS), {"1.26.1", "1.26.2"})
        for members in PINS.values():
            self.assertEqual(set(members), {
                "GameAssembly.dll", "global-metadata.dat"})
            for digest in members.values():
                self.assertEqual(len(digest), 64)
                self.assertTrue(all(char in "0123456789abcdef" for char in digest))

    def test_parse_requires_full_contiguous_x64_byte_coverage(self):
        synthetic = """
0000000000001000 <.data>:
1000: 8b 05 fa 0f 00 00      mov eax,DWORD PTR [rip+0xffa] # 0x2000
1006: e8 f5 1f 00 00         call 0x3000
100b: c3                     ret
"""
        rows = parse_instructions(synthetic, 0x1000, 12)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0][3:], ("ripdata", 0x2000))
        self.assertEqual(rows[1][3:], ("branch", 0x3000))
        with self.assertRaisesRegex(ValueError, "cover"):
            parse_instructions(synthetic, 0x1000, 13)

    def test_same_code_with_relocated_references_is_not_compatibility_proof(self):
        def source(start):
            raw = (b"\x8b\x05" + rel32(0x2000, start + 6) +
                   b"\xe8" + rel32(0x3000, start + 11) + b"\xc3")
            return decode_window(raw, start)
        old, new = source(0x1000), source(0x1100)
        summary = compare_methods(old, new, 0x1000, 0x1100)
        self.assertEqual(summary["instructionCount"], 3)
        self.assertEqual(summary["relocationChangedInstructionCount"], 2)
        self.assertEqual(summary["uniqueRipRelativeDataReferences"], 1)
        self.assertEqual(summary["externalDirectTargets"], [(0x3000, 0x3000)])
        self.assertTrue(relocation_only(old[0], new[0], 0x1000, 0x1100))

    def test_nonrelative_immediate_change_fails_closed(self):
        def source(value):
            return decode_window(
                b"\xb8" + value.to_bytes(4, "little") + b"\xc3", 0x1000)
        with self.assertRaisesRegex(ValueError, "non-relative"):
            compare_methods(source(5), source(6), 0x1000, 0x1000)

    def test_changed_opcode_structure_fails_closed(self):
        left = decode_window(b"\x90\xc3", 0x1000)
        right = decode_window(b"\xcc\xc3", 0x1000)
        with self.assertRaisesRegex(ValueError, "structure"):
            compare_methods(left, right, 0x1000, 0x1000)


if __name__ == "__main__":
    unittest.main()
