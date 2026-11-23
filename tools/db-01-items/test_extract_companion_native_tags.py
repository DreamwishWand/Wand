"""Synthetic exact-class regression for original Companion 394 source records."""
import importlib.util
from pathlib import Path
import sys
import unittest

SOURCE=Path(__file__).with_name("extract_companion_native_tags.py")
_spec=importlib.util.spec_from_file_location(
    "db01_companion_native_original_test_source",SOURCE)
assert _spec and _spec.loader
src=importlib.util.module_from_spec(_spec)
sys.modules[_spec.name]=src
_spec.loader.exec_module(src)


def varint(n:int)->bytes:
    b=bytearray()
    while n>127:
        b.append((n&127)|128);n>>=7
    return bytes(b)+bytes([n])


def corpus():
    known=set(range(400))|set(src.POSITIVE_TAGS.values())|{
        2000500001,2000500002,2000500003,
    }
    assert len(known)==409
    rows=[]
    identity=120000000
    for code,count in {
        1:170,2:20,3:16,4:14,5:17,4097:4,
    }.items():
        for _ in range(count):
            identity+=1
            rows.append((identity,"Pet!"+str(identity),[
                (1,0,identity),(2,2,b"Pet!"),
                (7,2,varint(src.POSITIVE_TAGS[code])),
            ]))
    for index in range(28):
        identity+=1
        ff=[(1,0,identity),(2,2,b"Mount!"),(7,0,1)]
        if index<5:
            ff.append((10,2,varint(src.POSITIVE_TAGS[4])))
        rows.append((identity,"Mount!"+str(identity),ff))
    for index in range(125):
        identity+=1
        ff=[(1,0,identity),(2,2,b"Critter!")]
        if index<105:
            ff.append((6,0,123))
        else:
            ff += [(7,0,123),(15,0,1),(16,2,b"xx"),(17,2,b"yy")]
        rows.append((identity,"Critter!"+str(identity),ff))
    assert len(rows)==394
    return rows,known


def il2cpp():
    chunks=[]
    for cls,tagfield in [
        ("PetItemData",7),("MountItemData",10),("CritterItemData",None),
    ]:
        head="public sealed class "+cls+" : IMessage, IItemData"
        if tagfield is not None:head+=", IHasTags"
        chunks += [head+"\n{\n\t// Fields"]
        if tagfield is not None:
            chunks.append(f"\tpublic const int TagsFieldNumber = {tagfield};")
        else:
            chunks += [
                "\tpublic const int LocationFieldNumber = 6;",
                "\tpublic const int SceneFieldNumber = 7;",
            ]
        chunks.append("\t// Properties\n}")
    return "\n".join(chunks)


class OriginalCompanionNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.orig,cls.tags=corpus()

    def test_source_il2cpp_class_and_interfaces_are_distinct(self):
        src.native_classes(il2cpp())
        with self.assertRaisesRegex(ValueError,
                                    "ORIGINAL_NATIVE_INTERFACE_"):
            src.native_classes(il2cpp().replace(
                "IItemData, IHasTags","IItemData"))
        with self.assertRaisesRegex(ValueError,
                                    "ORIGINAL_CRITTER_NON_TAG_ONEOF"):
            src.native_classes(il2cpp().replace(
                "SceneFieldNumber = 7;","SceneFieldNumber = 8;"))

    def test_classifies_complete_original_394_source_without_false_critter_tags(self):
        rows,census=src.classify_original(self.orig,self.tags)
        self.assertEqual(census["sourceDefinitions"],394)
        self.assertEqual(census["originalNativeClasses"],{
            "CritterItemData":125,"MountItemData":28,"PetItemData":241,
        })
        self.assertEqual(census["nativePositiveAreaTagItems"],246)
        self.assertEqual(census["nativeHasTagsWithoutPositiveArea"],23)
        self.assertEqual(census["nativeTaggedItems"],246)
        self.assertEqual(census["nativePositiveAreaByCode"],{
            "1":170,"2":20,"3":16,"4":19,"5":17,"4097":4,
        })
        self.assertEqual(census["critterSourceLocationOneof"],{
            "6":105,"7":20,
        })
        pet=next(r for r in rows if r["nativeKind"]=="pet")
        mount=next(r for r in rows if r["nativeKind"]=="mount")
        critter=next(r for r in rows if r["nativeKind"]=="critter")
        self.assertEqual(pet["tagsFieldNumber"],7)
        self.assertEqual(mount["tagsFieldNumber"],10)
        self.assertIsNone(critter["tagsFieldNumber"])
        self.assertIsNone(critter["nativeTags"])
        self.assertFalse(critter["originalIHasTagsInterface"])
        self.assertEqual(critter["critterLocationOneofFieldNumber"],6)
        self.assertFalse(census["actualGameCollectionUiMembershipVerified"])
        self.assertFalse(census["nativeAllAreasDefaultMatchVerified"])

    def test_original_mount_without_tags_not_misinterpreted_as_critter(self):
        rows,_=src.classify_original(self.orig,self.tags)
        untagged=[r for r in rows if r["nativeKind"]=="mount" and
                  r["nativeTags"]==[]]
        self.assertEqual(len(untagged),23)
        self.assertTrue(all(r["critterLocationOneofFieldNumber"] is None
                            for r in untagged))

    def test_duplicate_item_id_or_wrong_census_fail_closed(self):
        rows=list(self.orig)
        rows[0]=(rows[1][0],rows[0][1],rows[0][2])
        with self.assertRaisesRegex(ValueError,"DUPLICATE_ORIGINAL_ITEM_ID"):
            src.classify_original(rows,self.tags)
        with self.assertRaisesRegex(ValueError,
                                    "ORIGINAL_SOURCE_CORPUS_COUNT"):
            src.classify_original(rows[:-1],self.tags)

    def test_critter_oneof_absent_or_both_fails_native_identity(self):
        rows=list(self.orig)
        critter_index=next(i for i,(_,_,ff) in enumerate(rows)
                           if any(f==6 and w==0 for f,w,_ in ff))
        id,key,fields=rows[critter_index]
        for altered in [
            [(f,w,v) for f,w,v in fields if f!=6],
            fields+[(7,0,999)],
        ]:
            copy=list(rows)
            copy[critter_index]=(id,key,altered)
            with self.assertRaisesRegex(ValueError,
                                        "CRITTER_LOCATION_OR_SCENE_ONEOF|"
                                        "UNCLASSIFIED_OR_AMBIGUOUS"):
                src.classify_original(copy,self.tags,check_census=False)

    def test_nonexisting_tag_rejects_pet_and_mount_source(self):
        rows=list(self.orig)
        id,key,fields=rows[0]
        rows[0]=(id,key,[(f,w,varint(999999999) if f==7 else v)
                          for f,w,v in fields])
        with self.assertRaises(ValueError):
            src.classify_original(rows,self.tags,check_census=False)
        rows=list(self.orig)
        index=next(i for i,(_,_,ff) in enumerate(rows)
                   if any(f==10 and w==2 for f,w,v in ff))
        id,key,fields=rows[index]
        rows[index]=(id,key,[(f,w,varint(999999999) if f==10 else v)
                             for f,w,v in fields])
        with self.assertRaises(ValueError):
            src.classify_original(rows,self.tags,check_census=False)

    def test_source_counts_and_hash_pin(self):
        self.assertEqual(src.COMPANION_SHA256,
                         "62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219")
        self.assertEqual(sum(src.EXPECTED_CLASSES.values()),394)
        self.assertEqual(sum(src.EXPECTED_POSITIVE.values()),246)
        self.assertEqual(sum(src.EXPECTED_CRITTER_ONEOF.values()),125)
        self.assertEqual(src.SHARDS,256)


if __name__=="__main__":
    unittest.main()
