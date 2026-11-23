"""Synthetic IL2CPP v31 virtual slot evidence; no original game binaries."""
import struct
import unittest

from native_diffgrid_hash_writer_audit import (
    inspect_declared_grid_virtual_slots,
)


def synthetic_grid_metadata():
    names=("Grid","GridData","Meta.Grids","Definitions.Grid",
           "ToString","GetHashCode","NonVirtual","Equals","Clear","Meta.dll")
    strings=bytearray()
    offsets={}
    for name in names:
        offsets[name]=len(strings)
        strings.extend(name.encode("utf-8")+b"\0")
    string_offset=256
    method_offset=string_offset+len(strings)
    method_defs=(
        ("ToString",0,0x40,0),
        ("GetHashCode",2,0x40,0),
        ("NonVirtual",0xffff,0,0),
        ("Equals",0,0x40,1),
        ("GetHashCode",2,0x40,1),
        ("Clear",0xffff,0,1),
    )
    type_offset=method_offset+36*len(method_defs)
    image_offset=type_offset+2*88
    raw=bytearray(image_offset+40)
    struct.pack_into("<II",raw,0,0xfab11baf,31)
    for pair,offset,length in (
        (6,string_offset,len(strings)),
        (12,method_offset,36*len(method_defs)),
        (40,type_offset,2*88),
        (42,image_offset,40)
    ):
        struct.pack_into("<II",raw,pair*4,offset,length)
    raw[string_offset:method_offset]=strings
    for ix,(name,slot,flags,owner) in enumerate(method_defs):
        offset=method_offset+ix*36
        struct.pack_into("<II",raw,offset,offsets[name],owner)
        struct.pack_into("<I",raw,offset+24,0x06000001+ix)
        struct.pack_into("<H",raw,offset+28,flags)
        struct.pack_into("<HH",raw,offset+32,slot,0)
    for ix,(name,namespace,first) in enumerate((
        ("Grid","Meta.Grids",0),
        ("GridData","Definitions.Grid",3)
    )):
        offset=type_offset+ix*88
        struct.pack_into("<II",raw,offset,offsets[name],offsets[namespace])
        struct.pack_into("<I",raw,offset+36,first)
        struct.pack_into("<H",raw,offset+64,3)
    struct.pack_into("<IIII",raw,image_offset,offsets["Meta.dll"],0,0,2)
    return raw,method_offset,type_offset


class GridVirtualSlotMetadataTests(unittest.TestCase):
    def test_exact_original_type_declarations_are_only_method_hints(self):
        raw,_,_=synthetic_grid_metadata()
        info=inspect_declared_grid_virtual_slots(raw)
        self.assertEqual(
            info["status"],
            "original_il2cpp_v31_virtual_slot_declarations_only")
        self.assertEqual(info["nativeCallVirtualEntryByteOffset"],0x158)
        self.assertFalse(info["sourceMethodSlotsBoundToNativeCallOffset"])
        self.assertFalse(info["runtimeVirtualTargetsVerified"])
        self.assertFalse(info["nativeHashAlgorithmVerified"])
        self.assertFalse(info["saveHashValueParityVerified"])
        grid,grid_data=info["sourceTypes"]
        self.assertEqual((grid["namespace"],grid["className"]),
                         ("Meta.Grids","Grid"))
        self.assertEqual((grid_data["namespace"],grid_data["className"]),
                         ("Definitions.Grid","GridData"))
        self.assertEqual(
            [(x["declaredMethodName"],x["declaredVirtualSlot"])
             for x in grid["declaredVirtualMethodsInFirstEightSlots"]],
            [("ToString",0),("GetHashCode",2)])
        self.assertEqual(grid_data["declaredSlotZeroStatus"],
                         "one_source_declaration_runtime_target_unresolved")
        self.assertFalse(grid["runtimeVtableSlotZeroResolved"])

    def test_inherited_or_undeclared_slot_is_not_invented(self):
        raw,start,_=synthetic_grid_metadata()
        struct.pack_into("<HH",raw,start+32,0xffff,0)
        struct.pack_into("<H",raw,start+28,0)
        info=inspect_declared_grid_virtual_slots(raw)
        grid=info["sourceTypes"][0]
        self.assertEqual(grid["declaredSlotZeroStatus"],
                         "no_source_declaration_in_type_inheritance_unresolved")
        self.assertEqual(len(grid["declaredVirtualMethodsInFirstEightSlots"]),1)

    def test_duplicate_slot_zero_does_not_become_unique_target(self):
        raw,start,_=synthetic_grid_metadata()
        struct.pack_into("<H",raw,start+36+32,0)
        info=inspect_declared_grid_virtual_slots(raw)
        self.assertEqual(info["sourceTypes"][0]["declaredSlotZeroStatus"],
                         "multiple_source_declarations_runtime_target_unresolved")
        self.assertEqual(len(info["sourceTypes"][0]
                             ["declaredVirtualMethodsInFirstEightSlots"]),2)

    def test_invalid_metadata_and_virtual_contract_fail_closed(self):
        raw,start,type_offset=synthetic_grid_metadata()
        wrong=bytearray(raw)
        struct.pack_into("<I",wrong,4,30)
        with self.assertRaisesRegex(ValueError,"unsupported"):
            inspect_declared_grid_virtual_slots(wrong)
        wrong=bytearray(raw)
        struct.pack_into("<H",wrong,start+28,0)
        with self.assertRaisesRegex(ValueError,"INVALID_GRID_VIRTUAL"):
            inspect_declared_grid_virtual_slots(wrong)
        wrong=bytearray(raw)
        struct.pack_into("<I",wrong,start+4,1)
        with self.assertRaisesRegex(ValueError,"DECLARING_TYPE_MISMATCH"):
            inspect_declared_grid_virtual_slots(wrong)
        wrong=bytearray(raw)
        struct.pack_into("<I",wrong,start+24,0x01000001)
        with self.assertRaisesRegex(ValueError,"INVALID_GRID_VIRTUAL"):
            inspect_declared_grid_virtual_slots(wrong)
        wrong=bytearray(raw)
        struct.pack_into("<I",wrong,type_offset+88+36,500)
        with self.assertRaisesRegex(ValueError,"INVALID_GRID_SOURCE_METHOD_RANGE"):
            inspect_declared_grid_virtual_slots(wrong)


if __name__=="__main__":
    unittest.main()
