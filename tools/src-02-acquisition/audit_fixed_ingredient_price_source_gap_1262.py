#!/usr/bin/env python3
"""DB-02 exact-source cooking ingredient price gap census.

Matches the SHA-authenticated Steam 1.26.2 SRC-02 r5 cooking recipe
definitions against all 11 SHA-authenticated native protoDb.bin price
providers. Read-only: emits aggregate counts, never original IDs or prices.
A source row is NOT a verified effective runtime sale price.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from audit_native_price_provider_registry_1262 import (
    DYNAMIC, ORIGINAL_PROTO_BYTES, ORIGINAL_PROTO_SHA256,
    PROVIDERS, STATIC, original_price_provider_census,
)
from audit_native_sell_formula_source import (
    fields, many, one, string, valid_id,
)

CONTRACT = 'wand.db02.fixed-ingredient-source-price-gap@1'
R5_MANIFEST_SHA = 'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c'
R5_RECIPES_SHA = 'bd6237fb42629fb268a0fc6e5819670ac58ee417262bd93c0b120f0bbc8da818'
R5_RECIPES_BYTES = 1043968
FAMILIES = (302, 310, 311)
SOFT_CURRENCY = 80000000

# (distinct fixed ingredients, explicit source soft-sell, absent rows)
ORIGINAL_CENSUS = {
    302: (140, 127, 13),
    310: (72, 64, 8),
    311: (159, 20, 139),
}


def require(ok, code):
    if not ok:
        raise ValueError('DB02_INGREDIENT_SOURCE_GAP_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def fixed_ingredient_ids(manifest_raw, recipes_raw):
    """Independently authenticate SRC-02 r5 release and all cooking recipes."""
    require(isinstance(manifest_raw, bytes) and
            sha(manifest_raw) == R5_MANIFEST_SHA, 'R5_MANIFEST_SHA')
    require(isinstance(recipes_raw, bytes) and
            len(recipes_raw) == R5_RECIPES_BYTES and
            sha(recipes_raw) == R5_RECIPES_SHA, 'R5_RECIPES_SHA')
    manifest = json.loads(manifest_raw)
    require(isinstance(manifest, dict) and
            manifest.get('schema') == 'wand.src02@1' and
            manifest.get('platform') == 'Steam' and
            manifest.get('gameVersion') == '1.26.2' and
            manifest.get('status') == 'partial_native_extraction' and
            manifest.get('counts', {}).get('recipes') == 1943 and
            manifest.get('counts', {}).get('cooking') == 625 and
            manifest.get('counts', {}).get('crafting') == 1318 and
            manifest.get('files', {}).get('recipes.jsonl') == R5_RECIPES_SHA,
            'R5_RELEASE_MANIFEST')
    require(recipes_raw.endswith(b'\n'), 'R5_JSONL_TERMINATION')
    try:
        recipes = [json.loads(line) for line in recipes_raw.splitlines()]
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError('DB02_INGREDIENT_SOURCE_GAP_INVALID_RECIPE_JSONL') from exc
    require(len(recipes) == 1943, 'RECIPE_ROW_COUNT')
    ids, recipe_ids = set(), set()
    types = Counter()
    for recipe in recipes:
        require(isinstance(recipe, dict) and
                valid_id(recipe.get('recipeId')) and
                recipe['recipeId'] not in recipe_ids and
                recipe.get('type') in ('cooking', 'crafting') and
                isinstance(recipe.get('ingredients'), list),
                'INVALID_RECIPE_ROW')
        recipe_ids.add(recipe['recipeId'])
        types[recipe['type']] += 1
        if recipe['type'] != 'cooking':
            continue
        require(valid_id(recipe.get('resultItemId')) and
                recipe['resultItemId'] // 100000 == 303,
                'INVALID_MEAL_RESULT')
        for ingredient in recipe['ingredients']:
            require(isinstance(ingredient, dict) and
                    isinstance(ingredient.get('kind'), str),
                    'INVALID_INGREDIENT')
            if ingredient['kind'] != 'item':
                continue
            item_id = ingredient.get('itemId')
            require(valid_id(item_id) and item_id // 100000 in FAMILIES,
                    'FIXED_INGREDIENT_FAMILY')
            ids.add(item_id)
    require(types == {'cooking': 625, 'crafting': 1318} and
            len(ids) == 371 and
            Counter(i // 100000 for i in ids) ==
            {302: 140, 310: 72, 311: 159}, 'FIXED_INGREDIENT_CENSUS')
    return ids


def native_provider_row_by_id(proto_raw):
    """Return PRIVATE row evidence only; never export it to public reports."""
    require(isinstance(proto_raw, bytes) and
            len(proto_raw) == ORIGINAL_PROTO_BYTES and
            sha(proto_raw) == ORIGINAL_PROTO_SHA256, 'PROTO_SHA')
    # Revalidates full source, 11 provider identities, 9,537 globally
    # unique Item IDs, and all original provider/currency aggregates.
    census = original_price_provider_census(proto_raw)
    require(census['sourceItemIdCrossProviderCollisions'] == 0 and
            census['sourceItemPricesRowCount'] == 9537,
            'PRICE_PROVIDER_CENSUS')
    original = fields(proto_raw)
    provider_spec = {index: (key, kind) for index, key, kind, _ in PROVIDERS}
    rows = {}
    for index, (_, _, blob) in enumerate(original):
        if index not in provider_spec:
            continue
        expected_key, expected_kind = provider_spec[index]
        item = fields(blob)
        require(string(one(item, 1, 2, True)) == expected_key,
                'PRICE_PROVIDER_NAME')
        envelope = fields(one(item, 2, 2, True))
        require(string(one(envelope, 5, 2, True)) == expected_kind,
                'PRICE_PROVIDER_KIND')
        data = fields(one(envelope, 6, 2, True))
        if expected_kind == DYNAMIC:
            data = fields(one(data, 3, 2, True))
        for number, wire, blob_price in data:
            require((number, wire) == (1, 2), 'PRICE_ROW_WIRE')
            ff = fields(blob_price)
            item_id = one(ff, 1, 0, True)
            require(valid_id(item_id) and item_id not in rows,
                    'DUPLICATE_PRICE_ROW')
            costs = []
            for cost_blob in many(ff, 3, 2):
                cf = fields(cost_blob)
                currency = one(cf, 1, 0, True)
                require(valid_id(currency), 'INVALID_PRICE_CURRENCY')
                costs.append((currency, one(cf, 2, 0) is not None))
            rows[item_id] = costs
    require(len(rows) == 9537, 'ALL_SOURCE_ROWS')
    return rows


def classify_fixed_ingredient_price_rows(fixed_ids, source_rows):
    """Pure classifier: row ABSENCE differs from missing Amount field."""
    require(isinstance(fixed_ids, set) and
            isinstance(source_rows, dict) and
            len(fixed_ids) <= 5000, 'INVALID_INPUT')
    by_family = {group: Counter() for group in FAMILIES}
    for item_id in fixed_ids:
        require(valid_id(item_id) and item_id // 100000 in FAMILIES,
                'UNSUPPORTED_ITEM_FAMILY')
        if item_id not in source_rows:
            category = 'no_source_price_row'
        else:
            costs = source_rows[item_id]
            require(isinstance(costs, list) and
                    all(isinstance(cost, tuple) and len(cost) == 2 and
                        valid_id(cost[0]) and isinstance(cost[1], bool)
                        for cost in costs) and
                    len({cost[0] for cost in costs}) == len(costs),
                    'INVALID_SOURCE_PRICE_ROW')
            matching = [has_amount for currency, has_amount in costs
                        if currency == SOFT_CURRENCY]
            category = ('row_without_soft_sell_currency' if not matching
                        else 'soft_sell_amount_explicit' if matching[0]
                        else 'soft_sell_amount_field_omitted')
        by_family[item_id // 100000][category] += 1
    return by_family


def audit(manifest_raw, recipes_raw, proto_raw):
    fixed = fixed_ingredient_ids(manifest_raw, recipes_raw)
    rows = native_provider_row_by_id(proto_raw)
    classified = classify_fixed_ingredient_price_rows(fixed, rows)
    result = {}
    for family, (expected_all, expected_explicit, expected_absent) in ORIGINAL_CENSUS.items():
        c = classified[family]
        require(sum(c.values()) == expected_all and
                c['soft_sell_amount_explicit'] == expected_explicit and
                c['no_source_price_row'] == expected_absent and
                c['row_without_soft_sell_currency'] == 0 and
                c['soft_sell_amount_field_omitted'] == 0,
                'ORIGINAL_FIXED_INGREDIENT_BREAKDOWN')
        result[str(family)] = {
            'fixedRecipeIngredientIds': expected_all,
            'explicitSourceSoftSellPriceRows': expected_explicit,
            'entireSourcePriceRowAbsent': expected_absent,
            'softSellAmountFieldOmittedInExistingRow': 0,
            'existingRowWithoutSoftSellCurrency': 0,
        }
    return {
        'contract': CONTRACT, 'gameVersion': '1.26.2', 'platform': 'Steam',
        'authenticatedSrc02R5ManifestAndRecipes': True,
        'authenticatedOriginalProtoDbAndAllElevenPriceProviders': True,
        'cookingRecipesInspected': 625,
        'distinctFixedCookingIngredientIds': len(fixed),
        'fixedIngredientsWithExplicitSerializedSoftSellAmount': 211,
        'fixedIngredientsWithNoSerializedPriceRowInAnyProvider': 160,
        'fixedIngredientsWithMissingSoftSellAmountFieldInExistingRow': 0,
        'breakdownByNativeActivityItemFamily': result,
        'originalProviderCount': 11,
        'originalSerializedPriceRowCount': len(rows),
        'dynamicCacheDoesNotCoverMissingFixedIngredients': True,
        'missingRowDoesNotProveFailedRuntimeLookup': True,
        'missingRowDoesNotProveUnsellable': True,
        'effectiveIngredientOrMealSellPrices': None,
        'nativeRuntimeRegisteredProvidersVerified': False,
        'liveCacheUnmodifiedVerified': False,
        'publishable': False, 'writable': False, 'playerSaveRead': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--recipes', required=True, type=Path)
    parser.add_argument('--protodb', required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(audit(
            args.manifest.read_bytes(),
            args.recipes.read_bytes(),
            args.protodb.read_bytes(),
        ), indent=2, ensure_ascii=False))
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        parser.exit(1, f'DB-02 ingredient source gap audit failed: {exc}\n')


if __name__ == '__main__':
    main()
