import unittest

from native_diffgrid_hash_writer_audit import (
    inspect_native_writer_body,verify_leaf_getter_or_setter,
    VIRTUAL_CODE,FIRST_WRITE,SECOND_WRITE,
    LOAD_GRID,LOAD_GRID_DATA
)


class MockPE:
    image_base=0x180000000
    def va_to_file(self,va,sz,executable=False):
        if va!=self.image_base+4 or sz!=4 or not executable:
            raise ValueError("invalid synthetic source PE")
        return 4


class NativeHashWriterTests(unittest.TestCase):
    @staticmethod
    def synthetic_writer():
        return (b"\x90"*16+LOAD_GRID+b"\x90"*8+
                FIRST_WRITE+b"\x90"*8+LOAD_GRID+
                b"\x90"*8+LOAD_GRID_DATA+b"\x90"*8+
                SECOND_WRITE+b"\x90"*32)

    def test_source_grid_and_griddata_virtual_results_write_separate_fields(self):
        data=inspect_native_writer_body(self.synthetic_writer())
        self.assertLess(
            data["defaultGridVirtualResultWriteOffset"],
            data["defaultGridDataVirtualResultWriteOffset"])
        self.assertEqual(data["virtualDispatchTableByteOffset"],0x158)
        self.assertTrue(data["sourceDefaultGridLoadCorroborated"])
        self.assertTrue(data["sourceGridDataChildLoadCorroborated"])
        self.assertFalse(data["virtualMethodConcreteTargetVerified"])

    def test_missing_virtual_result_or_source_load_fails_closed(self):
        base=self.synthetic_writer()
        with self.assertRaisesRegex(ValueError,"AMBIGUOUS"):
            inspect_native_writer_body(base+FIRST_WRITE)
        with self.assertRaisesRegex(ValueError,"MISSING_ORIGINAL"):
            inspect_native_writer_body(base.replace(LOAD_GRID_DATA,b"\x90"*4))
        with self.assertRaisesRegex(ValueError,"MISSING_OR_AMBIGUOUS"):
            inspect_native_writer_body(base.replace(SECOND_WRITE,b"\x90"*len(SECOND_WRITE)))
        with self.assertRaisesRegex(ValueError,"INVALID_SOURCE_METHOD_BODY"):
            inspect_native_writer_body(b"\x90"*20)

    def test_exact_compiled_source_leaf_accessors_not_guessed(self):
        getter=bytes.fromhex("8B 41 34 C3")
        binary=b"\x90"*4+getter+b"\x90"*4
        self.assertTrue(verify_leaf_getter_or_setter(
            binary,MockPE(),0x180000004,getter))
        with self.assertRaisesRegex(ValueError,"MISMATCHED_ORIGINAL"):
            verify_leaf_getter_or_setter(
                binary,MockPE(),0x180000004,bytes.fromhex("8B 41 38 C3"))


if __name__=="__main__":
    unittest.main()
