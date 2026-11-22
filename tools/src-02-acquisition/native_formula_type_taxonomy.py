"""SHA-pinned, read-only IL2CPP source type-taxonomy correspondence.

A mapping between serialized ObjectType syntax and original *metadata*
is not evidence that the native runtime resolver selected a Type or
that a particular item was assigned an effective selling price.
"""
import hashlib
import re

CONTRACT = 'wand.db02.native-formula-type-taxonomy@1'
STEAM_1262_DUMP_SHA256 = '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
STEAM_1262_DUMP_SIZE = 89453137
FIXED_RECIPE_SUBTYPES = ('Crop', 'Fish', 'Ingredient')
MEAL_RESULT_SUBTYPE = 'Meal'


def require(ok, code):
    if not ok:
        raise ValueError('DB02_FORMULA_TYPE_' + code)


def enum_values(metadata_text, enum_name):
    """Extract a single C# enum declaration; independent synthetic fixtures allowed."""
    require(isinstance(metadata_text, str) and
            isinstance(enum_name, str) and enum_name.isidentifier(),
            'INVALID_ENUM_INPUT')
    pattern = (r'(?ms)^public enum ' + re.escape(enum_name) +
               r' // TypeDefIndex: [0-9]+\n\{(.*?)^\}')
    matches = list(re.finditer(pattern, metadata_text))
    require(len(matches) == 1, 'ENUM_NOT_UNIQUE')
    entries = re.findall(r'(?m)^\s*public const ' +
                         re.escape(enum_name) +
                         r' ([A-Za-z_]\w*) = ([0-9]+);$', matches[0].group(1))
    require(len(entries) > 0, 'ENUM_EMPTY')
    mapping = {name: int(value) for name, value in entries}
    require(len(mapping) == len(entries), 'ENUM_DUPLICATE')
    return mapping


def verify_taxonomy_metadata_text(text, serialized_object_type):
    """Check declared names/enums only, without claiming native execution."""
    require(isinstance(serialized_object_type, str) and
            serialized_object_type.count('/') == 1,
            'INVALID_SOURCE_OBJECT_TYPE')
    top, subtype = serialized_object_type.split('/')
    require((top, subtype) == ('ActivityItem', 'Consummable'),
            'UNEXPECTED_STEAM_1262_SOURCE_TYPE')

    item_type = enum_values(text, 'ItemType')
    activity = enum_values(text, 'ActivityItemType')
    require(item_type.get(top) == 3 and activity.get(subtype) == 15 and
            activity.get(MEAL_RESULT_SUBTYPE) == 3 and
            all(activity.get(t) is not None for t in FIXED_RECIPE_SUBTYPES) and
            {activity[t] for t in FIXED_RECIPE_SUBTYPES} == {2, 10, 11},
            'NATIVE_ENUM_CORRESPONDENCE')
    require(len({activity[subtype], activity[MEAL_RESULT_SUBTYPE]} |
                {activity[t] for t in FIXED_RECIPE_SUBTYPES}) == 5,
            'SUBTYPE_COLLISION')
    for cls in ('ConsummableItemData', 'MealItemData', 'CropItemData',
                'FishItemData', 'IngredientItemData'):
        require(len(re.findall(r'(?m)^public sealed class ' +
                               re.escape(cls) + r' : ', text)) == 1,
                'NATIVE_CLASS_DECLARATION')

    require('GetItemTypeMetaInfo(ItemType itemType, Enum subType)' in text and
            'private ItemDatabase.ItemTypeMetaInfo GetObjectTypeMetaInfo()' in text and
            'public bool IsFormulaValidForItem(IItemData itemData)' in text,
            'NATIVE_TYPE_API_DECLARATIONS')
    return {
        'nativeMetadataSourceAuthenticated': False,
        'nativeSourceObjectTypeClassAndEnumCrossReferenced': True,
        'sourceObjectTypeItemTypeEnumId': item_type[top],
        'sourceObjectTypeActivitySubtypeEnumId': activity[subtype],
        'fixedRecipeIngredientSourceSubtypesAreDifferent': True,
        'cookingMealResultSourceSubtypeIsDifferent': True,
        'nativeTypeResolverMethodDeclared': True,
        'nativeTypeResolverExecutedOrDisassembledHere': False,
        'nativeRuntimeTypeIdentityResolved': False,
        'sourceSellFormulaEffectivePrice': None,
    }


def verify_original_native_type_taxonomy(original_dump_bytes, serialized_object_type):
    """Fail closed unless exact Steam v1.26.2 original IL2CPP dump is provided."""
    require(isinstance(original_dump_bytes, bytes) and
            len(original_dump_bytes) == STEAM_1262_DUMP_SIZE,
            'ORIGINAL_DUMP_REQUIRED')
    require(hashlib.sha256(original_dump_bytes).hexdigest() ==
            STEAM_1262_DUMP_SHA256, 'ORIGINAL_DUMP_SHA')
    try:
        metadata = original_dump_bytes.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise ValueError('DB02_FORMULA_TYPE_DUMP_UTF8') from exc
    result = verify_taxonomy_metadata_text(metadata, serialized_object_type)
    return {
        'contract': CONTRACT,
        **result,
        'nativeMetadataSourceAuthenticated': True,
        'nativeMetadataOriginalSHA256Verified': True,
        'nativeOriginalBuild': 'Steam 1.26.2',
        'runtimeProviderRegistryVerified': False,
        'actualSellPrice': None,
        'publishable': False,
    }
