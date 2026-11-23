"""Synthetic unit tests for all seven original Furniture protobuf contracts."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).with_name("extract_furniture_subtypes.py")
_spec = importlib.util.spec_from_file_location("db01_original_furniture_subtypes", SOURCE)
assert _spec and _spec.loader
extractor = importlib.util.module_from_spec(_spec)
import sys
sys.modules[_spec.name] = extractor
_spec.loader.exec_module(extractor)

TAGS = {
    2001200028, 2001200029, 2001200030,
    2001200040, 2001200066, 2001200067, 2000500001,
}


def varint(v: int) -> bytes:
    out = bytearray()
    while v >= 128:
        out.append((v & 127) | 128)
        v >>= 7
    return bytes(out) + bytes([v])


def proto_fields(kind: str, *, set_ref: int = 0, tags=None) -> list:
    selected = (2001200028,) if tags is None else tags
    packed = b"".join(varint(v) for v in selected)
    common = [(1, 0, 40000001), (2, 2, b"Synthetic"),
              (3, 2, b"Source.displayName"),
              (4, 2, b"guid:00000000000000000000000000000000"),
              (5, 2, b"guid:00000000000000000000000000000000"),
              (6, 2, b"\x08\x01")]
    special = {
        "FurnitureItemData": [
            (7, 0, 2), *([(8, 0, set_ref)] if set_ref else []),
            (9, 2, packed), (20, 2, b""), (21, 2, b""),
            (999, 0, 1),
        ],
        "LandscapingItemData": [
            (8, 2, b"\x08\x01"), (9, 2, packed), (11, 2, b""),
            (999, 0, 1),
        ],
        "FenceAndRoadItemData": [
            (9, 2, b"\x98\x01\x00"),
            *([(10, 2, packed)] if selected else []),
            (13, 2, b""), (999, 0, 1),
        ],
        "FurnitureRequestItemData": [
            (7, 2, packed), (999, 0, 1),
        ],
        "FurnitureBlockerItemData": [
            (7, 2, b"\x08\x01"), (13, 2, b""),
            *([(14, 2, packed)] if selected else []),
            (999, 0, 1),
        ],
        "FurnitureSnippetTrapItemData": [
            (7, 2, packed), (8, 2, b""),
            (11, 0, 1),
        ],
        "FurnitureAncientMachineItemData": [
            *([(8, 0, set_ref)] if set_ref else []),
            (9, 2, packed), (11, 0, 1), (13, 0, 1),
            (15, 0, 1), (19, 2, b"guid:something"), (999, 0, 1),
        ],
    }
    return common + special[kind]


def fake_il2cpp():
    data = []
    for cls, (tag_field, set_field, has_set) in (
            extractor.SOURCE_CLASS_FIELDS.items()):
        interfaces = "IMessage, IHasTags, IHasSet, ICollectionItem" if has_set \
            else "IMessage, IHasTags, ICollectionItem"
        data += [
            f"public sealed class {cls} : {interfaces} // TypeDefIndex: 123",
            "{", "\t// Fields",
            f"\tpublic const int TagsFieldNumber = {tag_field};",
        ]
        if set_field is not None:
            data += [f"\tpublic const int SetItemIDFieldNumber = {set_field};"]
        data += ["\t// Properties", "}"]
    return "\n".join(data)


def synthetic_corpus():
    rows = []
    idx = 0
    for kind, count in extractor.EXPECTED_SOURCE_COUNTS.items():
        for k in range(count):
            idx += 1
            # Exactly 4,223 valid original Set refs for FurnitureItemData,
            # plus an AncientMachine with a similarly named *non-IHasSet* ID.
            set_ref = 2040000009 if (
                kind == "FurnitureItemData" and k < 4223 or
                kind == "FurnitureAncientMachineItemData" and k == 0) else 0
            tags = (2001200028,)
            if kind == "FurnitureBlockerItemData" and k < 403:
                tags = ()
            if kind == "FenceAndRoadItemData" and k < 21:
                tags = ()
            rows.append((40000000 + idx, f"Synthetic!{kind}!{k}",
                         proto_fields(kind, set_ref=set_ref, tags=tags)))
    return rows


class FurnitureSourceSubtypeTests(unittest.TestCase):
    def test_exact_il2cpp_seven_classes_and_ihasset_contract(self):
        extractor.verify_il2cpp_contract(fake_il2cpp())
        self.assertFalse(extractor.SOURCE_CLASS_FIELDS[
            "FurnitureAncientMachineItemData"][2])
        for old, wrong in [
            ("public const int TagsFieldNumber = 14;",
             "public const int TagsFieldNumber = 7;"),
            ("IMessage, IHasTags, ICollectionItem",
             "IMessage, ICollectionItem"),
            ("SetItemIDFieldNumber = 8;",
             "SetItemIDFieldNumber = 70;"),
        ]:
            with self.assertRaisesRegex(ValueError,
                                        "DB01_FURNITURE_SUBTYPE_IL2CPP"):
                extractor.verify_il2cpp_contract(
                    fake_il2cpp().replace(old, wrong))

    def test_all_seven_classes_exact_field_layouts(self):
        for kind, (tag_field, _, has_set) in (
                extractor.SOURCE_CLASS_FIELDS.items()):
            with self.subTest(kind=kind):
                ff = proto_fields(kind, set_ref=2040000009)
                source = extractor.classify_furniture(
                    40000001, "Synthetic", ff, TAGS)
                self.assertEqual(source.data_class, kind)
                self.assertEqual(source.tags_field, tag_field)
                self.assertEqual(source.native_tags, (2001200028,))
                self.assertEqual(source.implements_has_set, has_set)
                self.assertEqual(source.set_item_id,
                                 2040000009 if has_set else None)

    def test_empty_original_tag_fields_are_not_missing_class(self):
        for kind in ("FurnitureBlockerItemData",
                     "FenceAndRoadItemData"):
            item = extractor.classify_furniture(
                40000001, "Synthetic",
                proto_fields(kind, tags=()), TAGS)
            self.assertEqual(item.native_tags, ())
        row = extractor.classify_furniture(
            40000001, "Synthetic",
            proto_fields("FurnitureAncientMachineItemData",
                         set_ref=2040000009), TAGS)
        self.assertFalse(row.implements_has_set)
        self.assertIsNone(row.set_item_id)

    def test_furniture_fields_reused_for_other_classes_are_not_tags(self):
        road = proto_fields("FenceAndRoadItemData")
        self.assertEqual(extractor.single_value(road, 9, 2),
                         b"\x98\x01\x00")
        result = extractor.classify_furniture(
            40000001, "Road_Brick", road, TAGS)
        self.assertEqual(result.tags_field, 10)
        blocker = proto_fields("FurnitureBlockerItemData")
        self.assertEqual(extractor.classify_furniture(
            40000001, "WateringCan!Mushrooms_Small", blocker,
            TAGS).tags_field, 14)

    def test_fails_closed_on_tag_field_drift_collisions_and_unknown_tags(self):
        source = proto_fields("FurnitureItemData")
        for broken in [
            [(f, w, varint(99999999) if f == 9 else val)
             for f, w, val in source],
            [(f, w, val) for f, w, val in source if f != 20],
            source + [(9, 2, varint(2001200029))],
            [(f, w, val) for f, w, val in source if f != 21],
        ]:
            with self.assertRaisesRegex(
                    ValueError, "DB01_FURNITURE_SUBTYPE_"):
                extractor.classify_furniture(
                    40000001, "Synthetic", broken, TAGS)

    def test_exact_6746_census_and_actual_ihasset_join(self):
        rows = synthetic_corpus()
        classified = extractor.classify_corpus(rows, TAGS)
        self.assertEqual(len(classified), 6746)
        self.assertEqual(
            sum(x.implements_has_set for x in classified),5288)
        result, census = extractor.original_rows(
            rows, TAGS, {2040000009:(2000500001,)})
        self.assertEqual(len(result), 6746)
        self.assertEqual(census["counts"]["sourceResolvedSetItem"],4223)
        self.assertEqual(census["counts"]["noSetItemReference"],1065)
        self.assertEqual(census["counts"]["actualIHasSetItems"],5288)
        self.assertEqual(
            census["byOriginalNativeClass"]["FurnitureBlockerItemData"],422)
        ancient = next(x for x in result if
                       x["originalNativeClass"] ==
                       "FurnitureAncientMachineItemData")
        self.assertEqual(ancient["setLookup"]["kind"],"not_ihas_set")
        self.assertGreater(census["counts"]["setInheritedTagItems"],0)

    def test_zero_or_unresolved_set_ref_never_claims_inherited_tags(self):
        rows = synthetic_corpus()
        first = rows[0]
        fields = [(f, w, 2040999999 if f == 8 else v)
                  for f,w,v in first[2]]
        rows[0] = (first[0],first[1],fields)
        with self.assertRaisesRegex(ValueError,
                                    "ORIGINAL_SET_REFERENCE_MISSING"):
            extractor.original_rows(rows, TAGS,
                                    {2040000009:(2000500001,)})

    def test_private_output_rejects_worktree_and_overwriting(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            out = folder / "private"
            extractor.private_target(out,(folder/"source",))
            out.mkdir()
            with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
                extractor.private_target(out,(folder/"source",))
            repo = folder / "repo"
            repo.mkdir()
            (repo/".git").mkdir()
            with self.assertRaisesRegex(ValueError,"OUTSIDE_GIT"):
                extractor.private_target(repo/"data",(folder/"source",))


if __name__ == "__main__":
    unittest.main()
