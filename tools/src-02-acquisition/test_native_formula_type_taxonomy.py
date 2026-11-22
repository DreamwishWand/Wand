"""Synthetic tests: no original game code or proprietary formula records."""
import unittest

from native_formula_type_taxonomy import (
    enum_values, verify_original_native_type_taxonomy,
    verify_taxonomy_metadata_text,
)

SYNTHETIC_METADATA = """\
public enum ItemType // TypeDefIndex: 10
{
    public const ItemType None = 0;
    public const ItemType ActivityItem = 3;
}

public enum ActivityItemType // TypeDefIndex: 11
{
    public const ActivityItemType Meal = 3;
    public const ActivityItemType Crop = 2;
    public const ActivityItemType Fish = 10;
    public const ActivityItemType Ingredient = 11;
    public const ActivityItemType Consummable = 15;
}

public sealed class ConsummableItemData : IItemData {}
public sealed class MealItemData : IItemData {}
public sealed class CropItemData : IItemData {}
public sealed class FishItemData : IItemData {}
public sealed class IngredientItemData : IItemData {}
GetItemTypeMetaInfo(ItemType itemType, Enum subType)
private ItemDatabase.ItemTypeMetaInfo GetObjectTypeMetaInfo()
public bool IsFormulaValidForItem(IItemData itemData)
"""


class SourceTypeTaxonomyTests(unittest.TestCase):
    def test_original_independent_source_taxonomy(self):
        evidence = verify_taxonomy_metadata_text(
            SYNTHETIC_METADATA, 'ActivityItem/Consummable')
        self.assertTrue(evidence['nativeSourceObjectTypeClassAndEnumCrossReferenced'])
        self.assertTrue(evidence['fixedRecipeIngredientSourceSubtypesAreDifferent'])
        self.assertTrue(evidence['cookingMealResultSourceSubtypeIsDifferent'])
        self.assertEqual(evidence['sourceObjectTypeActivitySubtypeEnumId'], 15)
        self.assertFalse(evidence['nativeRuntimeTypeIdentityResolved'])
        self.assertIsNone(evidence['sourceSellFormulaEffectivePrice'])

    def test_enum_parser_is_scoped_not_unbounded_text_search(self):
        self.assertEqual(enum_values(SYNTHETIC_METADATA, 'ItemType')['ActivityItem'], 3)
        with self.assertRaisesRegex(ValueError, 'ENUM_NOT_UNIQUE'):
            enum_values(SYNTHETIC_METADATA + SYNTHETIC_METADATA, 'ItemType')

    def test_invalid_original_type_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'UNEXPECTED_STEAM_1262_SOURCE_TYPE'):
            verify_taxonomy_metadata_text(SYNTHETIC_METADATA,
                                          'ActivityItem/Ingredient')
        with self.assertRaisesRegex(ValueError, 'INVALID_SOURCE_OBJECT_TYPE'):
            verify_taxonomy_metadata_text(SYNTHETIC_METADATA, 'Consummable')

    def test_metadata_enum_changed_fail_closed(self):
        mutated = SYNTHETIC_METADATA.replace('Consummable = 15',
                                              'Consummable = 11')
        with self.assertRaisesRegex(ValueError, 'NATIVE_ENUM_CORRESPONDENCE'):
            verify_taxonomy_metadata_text(mutated, 'ActivityItem/Consummable')

    def test_class_and_type_resolver_must_be_present(self):
        missing = SYNTHETIC_METADATA.replace(
            'public sealed class ConsummableItemData :', 'public class X :')
        with self.assertRaisesRegex(ValueError, 'NATIVE_CLASS_DECLARATION'):
            verify_taxonomy_metadata_text(missing, 'ActivityItem/Consummable')
        missing = SYNTHETIC_METADATA.replace(
            'GetItemTypeMetaInfo(ItemType itemType, Enum subType)', '')
        with self.assertRaisesRegex(ValueError, 'NATIVE_TYPE_API_DECLARATIONS'):
            verify_taxonomy_metadata_text(missing, 'ActivityItem/Consummable')

    def test_untrusted_dump_is_rejected_before_parse(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_DUMP_REQUIRED'):
            verify_original_native_type_taxonomy(
                b'not an original dump', 'ActivityItem/Consummable')


if __name__ == '__main__':
    unittest.main()
