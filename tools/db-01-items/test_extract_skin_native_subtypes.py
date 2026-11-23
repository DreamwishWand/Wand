"""Synthetic contract tests for the seven original Skin protobuf layouts."""
import importlib.util
from pathlib import Path
import sys
import unittest

SOURCE=Path(__file__).with_name("extract_skin_native_subtypes.py")
_spec=importlib.util.spec_from_file_location("db01_skin_original_source",SOURCE)
assert _spec and _spec.loader
m=importlib.util.module_from_spec(_spec)
sys.modules[_spec.name]=m
_spec.loader.exec_module(m)


def vint(number:int)->bytes:
    out=bytearray()
    while number>127:
        out.append((number&127)|128)
        number>>=7
    return bytes(out)+bytes([number])


def dump():
    blocks=[]
    for band,(name,tag_field,count,_anchors) in m.ORIGINAL_BAND_LAYOUTS.items():
        line=f"public sealed class {name} : IMessage, IItemData"
        if tag_field is not None:
            line+=", IHasTags"
        body=[line,"{","\t// Fields"]
        if tag_field is not None:
            body.append(f"\tpublic const int TagsFieldNumber = {tag_field};")
        if band==1700:
            body.append("\tpublic const int CharacterItemIDFieldNumber = 10;")
        if band==1704:
            body.append("\tpublic const int MountItemIDFieldNumber = 10;")
        if band==1706:
            body.append("\tpublic const int HouseItemIDFieldNumber = 6;")
        body.extend(["\t// Properties","}"])
        blocks.append("\n".join(body))
    return "\n".join(blocks)


def original_fixture():
    tag_ids=set(range(400))|set(m.POSITIVE_TAGS.values())|{
        2000500001,2000500002,2000500003,
    }
    assert len(tag_ids)==409
    distribution={
        1700:{1:5,2:3,3:1,4:1,5:0,4097:7},
        1702:{1:0,2:0,3:2,4:0,5:2,4097:0},
    }
    with_tags={1700:49,1701:3,1702:19}
    records=[]
    for band,(_cls,field,count,anchors) in m.ORIGINAL_BAND_LAYOUTS.items():
        areas=[]
        for code,n in distribution.get(band,{}).items():
            areas.extend([m.POSITIVE_TAGS[code]]*n)
        remaining=with_tags.get(band,0)-len(areas)
        areas.extend([2000500001]*remaining)
        for j in range(count):
            item_id=band*100_000+j
            ff=[(1,0,item_id),(2,2,("Source!"+str(item_id)).encode())]
            ff.extend((f,w,1 if w==0 else b"")
                      for f,w in anchors)
            if j<len(areas):
                ff.append((field,2,vint(areas[j])))
            records.append((item_id,"Source!"+str(item_id),ff))
    assert len(records)==163
    return records,tag_ids


class NativeSkinSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows,cls.tags=original_fixture()

    def test_seven_class_native_interface_and_field_layouts(self):
        m.verify_native_layout(dump())
        for tamper,expected in [
            (("IHasTags","IHasBadTags"),"INCORRECT_IHASTAGS"),
            (("TagsFieldNumber = 11;","TagsFieldNumber = 12;"),
             "NATIVE_TAG_FIELD"),
            (("MountItemIDFieldNumber = 10;",
              "MountItemIDFieldNumber = 9;"),"MOUNT_SKIN_REFERENCE"),
        ]:
            with self.assertRaisesRegex(ValueError,expected):
                m.verify_native_layout(dump().replace(*tamper))

    def test_census_163_seven_layouts_21_positive_4_no_ihastags(self):
        rows,report=m.classify_corpus(self.rows,self.tags)
        self.assertEqual(len(rows),163)
        self.assertEqual(report["sourceItemsWithNonemptyDirectNativeTags"],71)
        self.assertEqual(report["sourcePositiveNativeAreaItems"],21)
        self.assertEqual(report["sourceIHasTagsWithoutPositiveArea"],138)
        self.assertEqual(report["sourceWithoutIHasTagsInterface"],4)
        self.assertEqual(report["sourcePositiveAreaByCode"],{
            "1":5,"2":3,"3":3,"4":1,"5":2,"4097":7,
        })
        self.assertEqual(report["byOriginalSourceProtobufClass"],{
            cls:count for cls,_,count,_ in m.ORIGINAL_BAND_LAYOUTS.values()
        })
        self.assertFalse(report["nativeRuntimeObjectTypeIndependentlyVerified"])
        self.assertFalse(report["actualCollectionUiMembershipVerified"])
        self.assertFalse(report["nativeAllAreasDefaultPredicateVerified"])

    def test_genuine_empty_tags_different_from_absent_ihastags(self):
        rows,_=m.classify_corpus(self.rows,self.tags)
        character=next(r for r in rows if r["sourceIdBand"]==1700 and
                       r["nativeTags"]==[])
        mount=next(r for r in rows if r["sourceIdBand"]==1704)
        boat=next(r for r in rows if r["sourceIdBand"]==1705)
        self.assertTrue(character["originalIHasTagsInterface"])
        self.assertEqual(character["nativeTags"],[])
        self.assertFalse(mount["originalIHasTagsInterface"])
        self.assertIsNone(mount["nativeTags"])
        self.assertFalse(boat["originalIHasTagsInterface"])
        self.assertIsNone(boat["nativeTags"])
        self.assertEqual(boat["sourceProtobufClass"],"BoatSkinItemData")

    def test_unknown_or_duplicated_tag_fails_closed(self):
        for raw in (vint(999999999),vint(2000500001)+vint(2000500001),b"\x80"):
            copies=list(self.rows)
            item,key,ff=copies[0]
            ff=[(f,w,raw if f==11 else v) for f,w,v in ff]
            copies[0]=(item,key,ff)
            with self.assertRaises(ValueError):
                m.classify_corpus(copies,self.tags)

    def test_out_of_band_native_shape_or_duplicate_item_identity_rejects(self):
        copies=list(self.rows)
        item,key,ff=copies[0]
        copies[0]=(170799999,key,ff)
        with self.assertRaisesRegex(ValueError,"UNMAPPED_ORIGINAL_SOURCE_ID_BAND"):
            m.classify_corpus(copies,self.tags,check_census=False)
        copies=list(self.rows)
        item,key,ff=copies[91]
        copies[91]=(item,key,[(f,w,v) for f,w,v in ff if f!=7])
        with self.assertRaisesRegex(ValueError,"NATIVE_SUBTYPE_WIRE_LAYOUT"):
            m.classify_corpus(copies,self.tags,check_census=False)
        copies=list(self.rows)
        item,key,ff=copies[2]
        copies[2]=(copies[1][0],key,ff)
        with self.assertRaisesRegex(ValueError,"DUPLICATE_ORIGINAL_ITEM_ID"):
            m.classify_corpus(copies,self.tags)

    def test_forbid_mount_and_boat_forged_ihastags(self):
        for band in (1704,1705):
            copies=list(self.rows)
            i=next(i for i, (id,_,_) in enumerate(copies)
                   if id//100_000==band)
            id,key,ff=copies[i]
            copies[i]=(id,key,ff+[(18,2,vint(2001200028))])
            with self.assertRaisesRegex(ValueError,
                                        "FOREIGN_TAGGED_SKIN_FIELDS"):
                m.classify_corpus(copies,self.tags,check_census=False)

    def test_fail_closed_on_ambiguous_positive_world_tag(self):
        copies=list(self.rows)
        id,key,ff=copies[0]
        extra=vint(m.POSITIVE_TAGS[1])+vint(m.POSITIVE_TAGS[2])
        copies[0]=(id,key,[
            (f,w,extra if f==11 else value) for f,w,value in ff])
        with self.assertRaisesRegex(ValueError,
                                    "AMBIGUOUS_ORIGINAL_POSITIVE_AREA_TAGS"):
            m.classify_corpus(copies,self.tags,check_census=False)

    def test_pinned_source_sha_and_source_subtype_size(self):
        self.assertEqual(m.SCHEMA,
                         "wand.db01.original-skin-subtypes-steam-1262@1")
        self.assertEqual(m.SKIN_SHA256,
                         "c557b76c8a762afb3d6cdd66e9c6ced22e7d863ff3dc7426f8f9aff3939e6371")
        self.assertEqual(sum(spec[2] for spec in m.ORIGINAL_BAND_LAYOUTS.values()),
                         163)
        self.assertEqual(m.SHARDS,256)


if __name__=="__main__":
    unittest.main()
