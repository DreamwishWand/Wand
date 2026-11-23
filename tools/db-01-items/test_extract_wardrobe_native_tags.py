"""Synthetic tests for SHA-pinned non-Furniture native IHasTags sources."""
import importlib.util
from pathlib import Path
import sys
import unittest

MODULE = Path(__file__).with_name("extract_wardrobe_native_tags.py")
_spec = importlib.util.spec_from_file_location("db01_wardrobe_native_tags", MODULE)
assert _spec and _spec.loader
e = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = e
_spec.loader.exec_module(e)


def varint(number: int) -> bytes:
    out = bytearray()
    while number > 127:
        out.append((number & 127) | 128)
        number >>= 7
    return bytes(out) + bytes([number])


def il2cpp_contracts() -> str:
    parts = []
    for _, (_, native_class, tags, set_number, _, _) in (
            e.SOURCE_FAMILIES.items()):
        parts += [
            "public sealed class " + native_class +
            " : IMessage, IHasTags, IHasSet // TypeDefIndex: 11",
            "{", "\t// Fields",
            f"\tpublic const int TagsFieldNumber = {tags};",
            f"\tpublic const int SetItemIDFieldNumber = {set_number};",
            "\t// Properties", "}",
        ]
    return "\n".join(parts)


def fake_sources():
    synthetic = {}
    next_id = 100_000_000
    for family, (_, _, tag_no, set_no, count, _) in (
            e.SOURCE_FAMILIES.items()):
        rows = []
        counts = e.SOURCE_AREA_COUNTS[family]
        area_tags = []
        for code, n in counts.items():
            area_tags += [e.POSITIVE_AREA_TAGS[code]] * n
        while len(area_tags) < count:
            area_tags.append(2000500001)
        assert len(area_tags) == count
        for idx in range(count):
            next_id += 1
            setid = 2040000009 if (
                family == "Trimming" or
                family == "Clothing" and idx < 2040) else 0
            tags = (area_tags[idx], 2000500002)
            ff = [(1, 0, next_id), (2, 2, b"Synthetic"),
                  (tag_no, 2, b"".join(varint(t) for t in tags))]
            if setid:
                ff.append((set_no, 0, setid))
            rows.append((next_id, "Synthetic!" + family + str(idx), ff))
        synthetic[family] = rows
    tags = set(e.POSITIVE_AREA_TAGS.values()) | {
        2000500001, 2000500002, 2000500003,
    } | set(range(400))
    assert len(tags) == 409
    sets = {2040000009:(2000500003,)}
    sets.update({2040100000+n:(2000500003,) for n in range(726)})
    assert len(sets) == 727
    return synthetic, tags, sets


class WardrobeNativeHasTagsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources, cls.tags, cls.sets = fake_sources()

    def test_exact_three_original_ihasset_class_fields(self):
        e.verify_class_contracts(il2cpp_contracts())
        for old, new in (
            ("IHasTags, IHasSet", "IHasTags"),
            ("TagsFieldNumber = 15;", "TagsFieldNumber = 14;"),
            ("SetItemIDFieldNumber = 9;", "SetItemIDFieldNumber = 8;"),
        ):
            with self.assertRaisesRegex(ValueError,
                                        "DB01_OTHER_NATIVE_TAG_NATIVE_"):
                e.verify_class_contracts(il2cpp_contracts().replace(old,new))

    def test_2475_original_rows_and_positive_area_census(self):
        rows, report = e.extract_rows(
            self.sources, self.tags, self.sets)
        self.assertEqual(len(rows), 2475)
        self.assertEqual(len({r["itemId"] for r in rows}), 2475)
        self.assertEqual(report["byNativeCategory"], {
            "Clothing": 2041, "Makeup": 69, "Trimming": 365,
        })
        self.assertEqual(report["sourcePositiveAreaItems"], 2406)
        self.assertEqual(report["sourceResolvedSetReferences"], {
            "Clothing": 2040, "Trimming": 365,
        })
        self.assertEqual(report["sourceNewInheritedSetTagItems"], {
            "Clothing": 2040, "Trimming": 365,
        })
        self.assertEqual(report["sourcePositiveAreaByCategory"]["Clothing"][
            "4097"],31)
        self.assertEqual(report["sourcePositiveAreaByCategory"]["Trimming"][
            "2"],0)
        self.assertEqual(report["sourcePositiveAreaByCategory"]["Makeup"][
            "1"],0)
        self.assertFalse(report["sourceAllAreasDefaultTagVerified"])
        self.assertFalse(report["actualGameCollectionUiMembershipVerified"])
        makeup = next(r for r in rows if r["nativeCategory"] == "Makeup")
        self.assertEqual(makeup["tagsFieldNumber"], 15)
        self.assertEqual(makeup["setLookup"]["setItemId"],0)
        self.assertEqual(makeup["setLookup"]["definition"]["kind"],
                         "missing_original_set_definition")
        shirt = next(r for r in rows if r["nativeCategory"] == "Clothing")
        self.assertEqual(shirt["setLookup"]["kind"],"has_set")
        self.assertEqual(shirt["setLookup"]["definition"]["nativeTags"],
                         [2000500003])

    def test_refusing_unknown_original_set_reference(self):
        sources = {k:list(v) for k,v in self.sources.items()}
        first = sources["Clothing"][0]
        tampered = [(f,w,2040999999 if f==8 else val)
                    for f,w,val in first[2]]
        sources["Clothing"][0] = (first[0],first[1],tampered)
        with self.assertRaisesRegex(ValueError,
                                    "UNRESOLVED_SET_REFERENCE_Clothing"):
            e.extract_rows(sources,self.tags,self.sets)

    def test_refusing_unknown_and_duplicated_source_tag(self):
        for packed in (
            varint(999999999),
            varint(2001200028) + varint(2001200028),
            b"\x80",
        ):
            sources = {k:list(v) for k,v in self.sources.items()}
            first=sources["Clothing"][0]
            ff=[(f,w,packed if f==9 else val) for f,w,val in first[2]]
            sources["Clothing"][0]=(first[0],first[1],ff)
            with self.assertRaises(ValueError):
                e.extract_rows(sources,self.tags,self.sets)

    def test_set_inherited_world_tag_never_silently_changes_a_source_census(self):
        sets = dict(self.sets)
        sets[2040000009] = (
            2000500003, 2001200029,
        )
        with self.assertRaisesRegex(ValueError,
                                    "SET_AREA_INHERITANCE_DRIFT"):
            e.extract_rows(self.sources,self.tags,sets)

    def test_id_collision_and_unknown_category_fail_closed(self):
        sources={k:list(v) for k,v in self.sources.items()}
        first=sources["Trimming"][0]
        sources["Trimming"][0]=(self.sources["Clothing"][0][0],first[1],first[2])
        with self.assertRaisesRegex(ValueError,"DUPLICATE_ITEM_ID"):
            e.extract_rows(sources,self.tags,self.sets)
        del sources["Makeup"]
        with self.assertRaisesRegex(ValueError,"INCOMPLETE_ORIGINAL"):
            e.extract_rows(sources,self.tags,self.sets)

    def test_private_original_source_manifest_version_pin_and_refuse_inside_repo(self):
        self.assertEqual(e.SCHEMA,
                         "wand.db01.original-wardrobe-ihastags-steam-1262@1")
        self.assertEqual(sum(spec[4] for spec in e.SOURCE_FAMILIES.values()),
                         2475)
        self.assertEqual(sum(e.SOURCE_AREA_COUNTS["Clothing"].values()),2041)
        self.assertEqual(sum(e.SOURCE_AREA_COUNTS["Trimming"].values()),365)
        self.assertEqual(e.SHARDS,256)


if __name__ == "__main__":
    unittest.main()
