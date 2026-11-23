"""Tests for SHA-pinned Steam v1.26.2 CollectionVisibility source audit."""
import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).with_name("audit_collection_visibility.py")
_spec = importlib.util.spec_from_file_location("db01_visibility_audit", MODULE)
assert _spec is not None and _spec.loader is not None
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)


def row(item_id, native, *fields):
    return (item_id, native, [
        (1, 0, item_id), (2, 2, native.encode("utf-8")), *fields,
    ])


def toy_dump():
    fields = "\n".join(
        "public sealed class " + name +
        " : IHasCollectionVisibility\n{\n"
        "  public const int CollectionVisibilityFieldNumber = " + str(field) +
        ";\n\t// Properties\n}\n"
        for name, field in audit.VISIBILITY_FIELDS.items()
    )
    seed = (
        "public sealed class SeedItemData : IHasTags\n{\n"
        "  public const int TagsFieldNumber = 31;\n\t// Properties\n}\n"
    )
    enum = (
        "public enum CollectionItemVisibility.VisibilityOneofCase // Native\n{\n"
        "public const CollectionItemVisibility.VisibilityOneofCase None = 0;\n"
        "public const CollectionItemVisibility.VisibilityOneofCase WhenUnlocked = 1;\n"
        "public const CollectionItemVisibility.VisibilityOneofCase When = 2;\n"
        "public const CollectionItemVisibility.VisibilityOneofCase WhenUnloked = 5;\n}\n"
    )
    return fields + seed + enum


class NativeVisibilityAuditTests(unittest.TestCase):
    def test_exact_current_oneof_and_ambiguous_seed_tag_field(self):
        self.assertEqual(audit.verify_il2cpp(toy_dump()),
                         audit.VISIBILITY_FIELDS)
        self.assertEqual(audit.VISIBILITY_FIELDS["CropItemData"], 31)
        self.assertEqual(audit.SEED_TAG_FIELD, 31)

    def test_reject_changed_native_field_number_and_case(self):
        self.assertRaisesRegex(
            ValueError, "VISIBILITY_FIELD_DRIFT_FurnitureItemData",
            audit.verify_il2cpp,
            toy_dump().replace("CollectionVisibilityFieldNumber = 46",
                               "CollectionVisibilityFieldNumber = 45")
        )
        self.assertRaisesRegex(
            ValueError, "NATIVE_VISIBILITY_CASE_DRIFT_WhenUnlocked",
            audit.verify_il2cpp,
            toy_dump().replace("WhenUnlocked = 1;", "WhenUnlocked = 3;")
        )
        self.assertRaisesRegex(
            ValueError, "SEED_TAG_FIELD_DRIFT",
            audit.verify_il2cpp,
            toy_dump().replace("TagsFieldNumber = 31;", "TagsFieldNumber = 30;")
        )

    def test_corrected_legacy_and_when_condition_variants(self):
        self.assertEqual(audit.decode_visibility(b"\x0a\x00"),
                         ("WhenUnlocked", None))
        self.assertEqual(audit.decode_visibility(b"\x2a\x00"),
                         ("WhenUnloked", None))
        self.assertEqual(audit.decode_visibility(b"\x12\x02\x08\x01"),
                         ("When", audit.sha(b"\x08\x01")))
        self.assertIsNone(audit.decode_visibility(b"\x0a\x01\x01"))
        self.assertIsNone(audit.decode_visibility(b"\x0a\x00\x2a\x00"))
        self.assertIsNone(audit.decode_visibility(b"\xff"))
        self.assertIsNone(audit.decode_visibility(b""))

    def test_original_seed_tags_are_not_unlocked_crop_visibility(self):
        tag = 2001200001
        encoded = audit._wire._src01.encode_varint(tag)
        crops = [
            row(30200221, "Fruit!WinterCocoa", (31, 2, b"\x0a\x00")),
            row(30400010, "Crop!Carrot_Seed", (31, 2, encoded)),
        ]
        furniture = [
            row(40000001, "Furniture!One", (46, 2, b"\x0a\x00")),
            row(40000002, "Furniture!Legacy", (46, 2, b"\x2a\x00")),
        ]
        rows, count = audit.collect_cases(furniture, crops, [], {tag})
        self.assertEqual([r["itemId"] for r in rows],
                         [30200221, 40000001, 40000002])
        self.assertEqual(count["visibilityRecords"], 3)
        self.assertEqual(count["cases"]["WhenUnlocked"], 2)
        self.assertEqual(count["cases"]["WhenUnloked"], 1)
        self.assertEqual(count["activityField31RecognizedSeedTagReferences"], 1)
        self.assertFalse(count["requiresRuntimeConditionEvaluator"])
        self.assertTrue(all(not r["runtimeVisibilityBehaviorVerified"] and
                            not r["gameCollectionAreaMembershipVerified"]
                            for r in rows))

    def test_unknown_activity_field_31_fails_closed(self):
        fake_tag = audit._wire._src01.encode_varint(2001200999)
        with self.assertRaisesRegex(ValueError,
                                    "UNKNOWN_ACTIVITY_FIELD_31"):
            audit.collect_cases(
                [], [row(30400010, "UnknownSeed", (31, 2, fake_tag))],
                [], {2001200001}
            )

    def test_conditions_are_preserved_without_runtime_evaluation(self):
        rows, count = audit.collect_cases(
            [row(40000001, "Furniture!When",
                 (46, 2, b"\x12\x02\x08\x01"))], [], [], set()
        )
        self.assertEqual(count["cases"]["When"], 1)
        self.assertTrue(count["requiresRuntimeConditionEvaluator"])
        self.assertEqual(rows[0]["conditionBlobSha256"],
                         audit.sha(b"\x08\x01"))
        self.assertFalse(rows[0]["runtimeVisibilityBehaviorVerified"])

    def test_duplicate_source_visibility_field_rejected(self):
        with self.assertRaisesRegex(ValueError,
                                    "DUPLICATE_VISIBILITY_FIELD_Furniture"):
            audit.collect_cases([
                row(40000001, "Dup", (46, 2, b"\x0a\x00"),
                    (46, 2, b"\x0a\x00"))
            ], [], [], set())

    def test_visibility_in_companion_and_meal_is_not_silently_ignored(self):
        rows, count = audit.collect_cases(
            [],
            [row(30800001, "Meal", (20, 2, b"\x0a\x00"))],
            [row(120000001, "Pet", (20, 2, b"\x2a\x00"))],
            set(),
        )
        self.assertEqual(count["sourceFamilies"]["ActivityMeal"], 1)
        self.assertEqual(count["sourceFamilies"]["Companion"], 1)
        self.assertEqual(len(rows), 2)


if __name__ == "__main__":
    unittest.main()
