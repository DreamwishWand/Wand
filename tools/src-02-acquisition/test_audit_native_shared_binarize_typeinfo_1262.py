"""Synthetic regression tests of the SHA-pinned shared TypeInfo audit."""
import struct
import unittest

from audit_native_shared_binarize_typeinfo_1262 import (
    TYPEINFO_RVA, TYPEINFO_TOKEN, TYPEINFO_USAGE_INDEX,
    RIP_REFERENCES, decode_typeinfo_usage, checked_rip_target,
    scan_rip_typeinfo_references, verify_original_metadata,
    verify_original_assembly, audit,
)


class OriginalSharedTypeInfoTests(unittest.TestCase):
    def test_original_raw_token_is_typeinfo_not_method_info(self):
        kind,index,value=decode_typeinfo_usage(
            struct.pack('<Q',TYPEINFO_TOKEN))
        self.assertEqual((kind,index,value),
                         (1,TYPEINFO_USAGE_INDEX,TYPEINFO_TOKEN))

    def test_other_type_usage_categories_fail_closed(self):
        for raw in [b'',b'012345678',b'\x00'*8,
                    struct.pack('<Q',0x4002283B),
                    struct.pack('<Q',0x2002283A)]:
            with self.assertRaisesRegex(ValueError,'DB02_SHARED_TYPEINFO_'):
                decode_typeinfo_usage(raw)

    def test_synthetic_init_and_dispatch_share_same_slot(self):
        # Both LEA and MOV with PC-relative disp32 point to same RVA.
        base=0x1000
        raw=bytearray([0x90]*160)
        for rel_pos,prefix in ((12,'488d0d'),(46,'488b15'),
                               (81,'488b15'),(115,'488d0d')):
            site=base+rel_pos
            code=bytes.fromhex(prefix)+struct.pack(
                '<i',TYPEINFO_RVA-site-7)
            raw[rel_pos:rel_pos+7]=code
            self.assertEqual(checked_rip_target(
                lambda r,n:bytes(raw[r-base:r-base+n]),
                site,prefix),TYPEINFO_RVA)
        observed=scan_rip_typeinfo_references(
            bytes(raw),base,TYPEINFO_RVA)
        self.assertEqual(observed,{
            (base+12,'488d0d'),(base+46,'488b15'),
            (base+81,'488b15'),(base+115,'488d0d')})
        self.assertEqual(len(RIP_REFERENCES),10)

    def test_wrong_rip_mode_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'WRONG_RIP_OPCODE'):
            checked_rip_target(lambda _r,_n:b'\x00'*7,
                               0x1000,'488b15')

    def test_untrusted_original_sources_are_refused(self):
        with self.assertRaisesRegex(ValueError,'DUMP_SHA'):
            verify_original_metadata(b'not the Steam original')
        with self.assertRaisesRegex(ValueError,'DLL_SIZE'):
            verify_original_assembly('/missing/GameAssembly.dll')
        with self.assertRaisesRegex(ValueError,'DUMP_SHA'):
            audit(b'not the Steam original','/missing/GameAssembly.dll')

    def test_invalid_scan_arguments_are_refused(self):
        with self.assertRaisesRegex(ValueError,'INVALID_SECTION_SCAN'):
            scan_rip_typeinfo_references(b'bytes',-1,0x2000)
        with self.assertRaisesRegex(ValueError,'INVALID_SECTION_SCAN'):
            scan_rip_typeinfo_references('bytes',0,0x2000)


if __name__=='__main__':
    unittest.main()
