import unittest

from native_reference_followups import (
    classify_rip_source_pair, follow_rel32_thunk,
)


class FakePE:
    def __init__(self, image, *, writable=True, zero_fill=False):
        self.image_base = 0
        self.runtime_ends = {200: 208}
        self.binary = image
        self.virtual_sections = [
            (0, 256, 128 if zero_fill else 256, 0,
             0x80000000 if writable else 0x40000000),
        ]

    def va_to_file(self, address, size=1, executable=False):
        if address < 0 or address + size > 256:
            raise ValueError("outside synthetic original section")
        return address


def jump_rel32(origin, destination):
    return b"\xe9" + (destination - origin - 5).to_bytes(
        4, "little", signed=True)


class NativeFollowupsTests(unittest.TestCase):
    def test_single_direct_jump_thunk_reaches_exact_unwind_start(self):
        raw = bytearray(256)
        raw[40:45] = jump_rel32(40, 200)
        pe = FakePE(raw)
        self.assertEqual(follow_rel32_thunk(pe, raw, 40), (200, 1))
        self.assertEqual(follow_rel32_thunk(pe, raw, 200), (200, 0))

    def test_two_jumps_only_if_bounded_and_ends_on_unwind(self):
        raw = bytearray(256)
        raw[40:45] = jump_rel32(40, 60)
        raw[60:65] = jump_rel32(60, 200)
        pe = FakePE(raw)
        self.assertEqual(follow_rel32_thunk(pe, raw, 40), (200, 2))
        self.assertIsNone(follow_rel32_thunk(pe, raw, 40, max_hops=1))

    def test_thunk_cycle_indirect_jump_and_noncode_are_rejected(self):
        raw = bytearray(256)
        raw[40:45] = jump_rel32(40, 60)
        raw[60:65] = jump_rel32(60, 40)
        pe = FakePE(raw)
        self.assertIsNone(follow_rel32_thunk(pe, raw, 40))
        raw[60:65] = b"\xff\x25\x00\x00\x00"
        self.assertIsNone(follow_rel32_thunk(pe, raw, 40))
        raw[40:45] = b"\x90" * 5
        self.assertIsNone(follow_rel32_thunk(pe, raw, 40))

    def test_mutable_original_bytes_are_not_runtime_equivalence(self):
        a, b = bytearray(256), bytearray(256)
        a[100] = b[100] = 5
        pe_a = FakePE(a)
        pe_b = FakePE(b)
        args = (pe_a, a, 100, "BYTE PTR [rip+0x1]",
                pe_b, b, 100, "BYTE PTR [rip+0x1]", "mov", "mov")
        self.assertEqual(classify_rip_source_pair(*args),
                         "writable_file_backed")
        b[100] = 99
        self.assertEqual(classify_rip_source_pair(*args),
                         "writable_file_backed")

    def test_zero_filled_original_virtual_data_not_unmapped(self):
        raw = bytearray(256)
        old = FakePE(raw, zero_fill=True)
        new = FakePE(raw, zero_fill=True)
        self.assertEqual(classify_rip_source_pair(
            old, raw, 180, "DWORD PTR [rip+0x1]",
            new, raw, 180, "DWORD PTR [rip+0x1]", "cmp", "cmp"),
            "writable_zero_fill")
        self.assertEqual(classify_rip_source_pair(
            old, raw, 180, "rcx,[rip+0x1]",
            new, raw, 180, "rcx,[rip+0x1]", "lea", "lea"),
            "address_only_writable_zero_fill")

    def test_unknown_operand_width_is_not_mislabeled_as_address_only(self):
        raw = bytearray(256)
        pe = FakePE(raw)
        self.assertEqual(classify_rip_source_pair(
            pe, raw, 100, "rcx,[rip+0x1]",
            pe, raw, 100, "rcx,[rip+0x1]", "mov", "mov"),
            "unknown_rip_access")

    def test_read_only_file_backed_data_compares_initial_bytes_only(self):
        a, b = bytearray(256), bytearray(256)
        a[100] = b[100] = 9
        old = FakePE(a, writable=False)
        new = FakePE(b, writable=False)
        args = (old, a, 100, "BYTE PTR [rip+0x1]",
                new, b, 100, "BYTE PTR [rip+0x1]", "mov", "mov")
        self.assertEqual(classify_rip_source_pair(*args),
                         "read_only_initial_bytes_identical")
        b[100] = 3
        self.assertEqual(classify_rip_source_pair(*args),
                         "read_only_initial_bytes_different")


if __name__ == "__main__":
    unittest.main()
