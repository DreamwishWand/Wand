"""Synthetic native HasTag / IHasSet / SetItemData regression cases."""
import importlib.util
from pathlib import Path
import struct
import unittest

SOURCE=Path(__file__).with_name("audit_native_has_tag_sets.py")
spec=importlib.util.spec_from_file_location("wand_db01_hastag_audit",SOURCE)
assert spec is not None and spec.loader is not None
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def varint(value:int)->bytes:
    result=bytearray()
    while value>=128:
        result.append((value&127)|128)
        value>>=7
    return bytes(result)+bytes([value])


def fake_dump()->str:
    lines=[
        "public interface IHasSet // TypeDefIndex: 1",
        "public abstract Item get_SetItem();",
        "public interface IHasTags // TypeDefIndex: 2",
        "public abstract RepeatedField<int> get_Tags();",
        "// RVA: 0x41088E0 Offset: 0x41070E0 VA: 0x1841088E0",
        "\t"+audit.METHOD,
    ]
    for cls,(set_field,tags_field) in audit.NATIVE_CLASSES.items():
        lines.extend([
            "public sealed class "+cls+
            " : IMessage, IHasTags, IHasSet, ICollectionItem // TypeDefIndex: 1",
            "{",
            "\t// Fields",
            f"\tpublic const int SetItemIDFieldNumber = {set_field};",
            f"\tpublic const int TagsFieldNumber = {tags_field};",
            "\t// Properties",
            "}",
        ])
    lines.extend([
        "public sealed class SetItemData : IMessage, IHasTags // TypeDefIndex: 1",
        "{",
        "\t// Fields",
        "\tpublic const int TagsFieldNumber = 6;",
        "\tprivate readonly RepeatedField<int> tags_; // 0x40",
        "\t// Properties",
        "}",
    ])
    return "\n".join(lines)


def fixtures():
    # Six original area tags + one original universe tag + synthetic extras.
    named=["IsDreamlightValley","IsEternityIsle","IsStorybookVale",
           "IsWishBlossomMountains","isSeaOfSecrets","isHoneywood"]
    ids=[2001200028,2001200029,2001200030,2001200040,
         2001200066,2001200067]
    tag_rows=[(i,n,[]) for i,n in zip(ids,named)]
    tag_rows += [(2000500001,"Mickey",[])]
    tag_rows += [(2000900000+i,f"FakeTag_{i}",[])
                 for i in range(402)]
    assert len(tag_rows)==409
    # The original itemlist mixes seven typed records. Reuse the single
    # synthetic subtype corpus fixture rather than incorrectly assuming all
    # source Furniture records are FurnitureItemData.
    from test_extract_furniture_subtypes import synthetic_corpus
    furniture=synthetic_corpus()
    set_rows=[
        (2040000009 if i==0 else 2100000000+i,f"TestSet_{i}",
         [(6,2,varint(2000500001))] if i<725 else [])
        for i in range(727)
    ]
    clothing=[
        (50000000+i,f"Clothing_{i}",[
            (9,2,varint(2001200029)),(8,0,2100000000)])
        for i in range(2041)
    ]
    trimming=[
        (60000000+i,f"Trimming_{i}",[
            (10,2,varint(2001200067)),(9,0,2100000000)])
        for i in range(365)
    ]
    return tag_rows,set_rows,{
        "Furniture":furniture,"Clothing":clothing,"Trimming":trimming,
    }


class OriginalNativeHasTagAuditTests(unittest.TestCase):
    def test_six_original_has_set_class_contracts_and_set_field(self):
        audit.verify_native_dump(fake_dump())
        for original,revised,match in [
            ("SetItemIDFieldNumber = 8",
             "SetItemIDFieldNumber = 77",
             "NATIVE_SOURCE_FIELD_DRIFT"),
            ("TagsFieldNumber = 6",
             "TagsFieldNumber = 60",
             "NATIVE_SET_TAG_FIELD_DRIFT"),
            ("public abstract Item get_SetItem();",
             "public abstract int get_SetItem();",
             "NATIVE_HAS_TAG_SIGNATURE_DRIFT"),
        ]:
            with self.subTest(original=original):
                with self.assertRaisesRegex(ValueError,match):
                    audit.verify_native_dump(fake_dump().replace(
                        original,revised))

    def test_set_tag_wire_ids_are_packed_and_source_exact(self):
        known={2000500001,2001200028}
        self.assertEqual(
            audit.exactly_one_packed(
                [(6,2,varint(2000500001)+varint(2001200028))],6,known),
            (2000500001,2001200028))
        self.assertEqual(audit.exactly_one_packed([],6,known),())
        for bad in [
            [(6,2,varint(2000500002))],
            [(6,2,b"\x80")],
            [(6,2,varint(2000500001)),(6,2,varint(2001200028))],
        ]:
            with self.assertRaises(ValueError):
                audit.exactly_one_packed(bad,6,known)

    def test_set_lookup_must_be_unambiguous(self):
        self.assertEqual(audit.one_set_reference([(8,0,21000001)],8),
                         21000001)
        self.assertEqual(audit.one_set_reference([],8),None)
        with self.assertRaisesRegex(ValueError,"INVALID_SET_REFERENCE"):
            audit.one_set_reference([(8,0,3),(8,0,4)],8)

    def test_exact_source_world_tags_have_no_set_inheritance(self):
        tag_rows,set_rows,families=fixtures()
        result=audit.join_source(tag_rows,set_rows,families)
        self.assertEqual(result["originalSetDefinitions"],727)
        self.assertEqual(result["originalSetsWithTags"],725)
        self.assertEqual(result["originalSetsWithCollectionAreaTags"],0)
        furniture=result["sourceFamilyCounts"]["Furniture"]
        self.assertEqual(furniture["items"],6746)
        self.assertEqual(furniture["sourceSubtypeNotProven"],0)
        self.assertEqual(furniture["hasTagSourceRowsVerified"],6746)
        self.assertEqual(furniture["nativeHasSetItemsVerified"],5288)
        self.assertEqual(furniture["notNativeHasSetItemsVerified"],1458)
        self.assertEqual(result["originalFurnitureNativeClassCounts"],
                         audit._furniture.EXPECTED_SOURCE_COUNTS)
        self.assertGreater(furniture["setInheritedAnyTag"],0)
        self.assertEqual(furniture["setInheritedCollectionAreaTag"],0)
        self.assertEqual(
            result["sourceFamilyCounts"]["Clothing"]["hasTagSourceRowsVerified"],
            2041)
        self.assertEqual(
            result["sourceFamilyCounts"]["Trimming"]["hasTagSourceRowsVerified"],
            365)

    def test_world_tag_appearing_in_set_is_a_detected_source_drift(self):
        tags,sets,families=fixtures()
        set_id,name,_=sets[0]
        sets[0]=(set_id,name,[(6,2,varint(2001200028))])
        with self.assertRaisesRegex(ValueError,
                                    "UNEXPECTED_WORLD_SET_TAG_INHERITANCE"):
            audit.join_source(tags,sets,families)

    def test_road_field_9_is_not_tag_and_ancient_machine_is_not_ihasset(self):
        tags,sets,families=fixtures()
        road=next(rec for rec in families["Furniture"] if
                  "FenceAndRoadItemData" in rec[1])
        source=audit._furniture.classify_furniture(
            road[0],road[1],road[2],{item_id for item_id,_,_ in tags})
        self.assertEqual(source.data_class,"FenceAndRoadItemData")
        self.assertEqual(source.tags_field,10)
        ancient=next(rec for rec in families["Furniture"] if
                     "FurnitureAncientMachineItemData" in rec[1])
        original=audit._furniture.classify_furniture(
            ancient[0],ancient[1],ancient[2],
            {item_id for item_id,_,_ in tags})
        self.assertFalse(original.implements_has_set)
        self.assertIsNone(original.set_item_id)
        result=audit.join_source(tags,sets,families)
        self.assertEqual(
            result["sourceFamilyCounts"]["Furniture"]["nativeHasSetItemsVerified"],
            5288)

    def test_rva_reader_refuses_non_pe_or_missing_segments(self):
        for raw in (b"",b"MZ"+bytes(600)):
            with self.assertRaises(ValueError):
                audit.pe_rva(raw,0x4108972,6)


if __name__=="__main__":
    unittest.main()
