#!/usr/bin/env python3
"""Verify original Steam v1.26.2 price-provider source disjointness.

All game originals stay private. The output has aggregate counts and
native call-edge checks only, never individual IDs or prices.
No runtime provider registration/order or live price is asserted.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from audit_native_sell_formula_source import (
    fields, many, one, string, valid_id,
)
from audit_native_sell_formula_type_dispatch_1262 import (
    DLL_SHA256, DLL_SIZE, pe_il2cpp_section, verified_relative_call,
)

CONTRACT = 'wand.db02.price-provider-source-uniqueness@1'
ORIGINAL_PROTO_SHA256 = (
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
)
ORIGINAL_PROTO_BYTES = 1335720
ORIGINAL_PROTO_ENTRIES = 2246

STATIC = 'Definitions.Shops.ItemPriceDatabase'
DYNAMIC = 'Definitions.Shops.DynamicItemPriceDatase'

# (original message ordinal, key, implementation, number of ItemPrices rows).
# This is serialized source order, NOT authenticated runtime registration order.
PROVIDERS = (
    (274, 'FormulaDynamicPriceDatabase', DYNAMIC, 8549),
    (1966, 'Cooking_Ingredient_PriceDatabase', STATIC, 52),
    (1967, 'Cooking_Meal_PriceDatabase', STATIC, 312),
    (1968, 'Crafting_Material_PriceDatabase', STATIC, 185),
    (1969, 'Crafting_Recipe_PriceDatabase', STATIC, 14),
    (1971, 'Fishing_PriceDatabase', STATIC, 53),
    (1972, 'Gardening_Decorations_PriceDatabase', STATIC, 107),
    (1973, 'Gardening_Ingredients_PriceDatabase', STATIC, 108),
    (1974, 'Gardening_Ingredients_Seeds_PriceDatabase', STATIC, 90),
    (1975, 'ItemPrices', STATIC, 8),
    (1976, 'Mining_PriceDatabase', STATIC, 59),
)

CALL_EDGES = (
    ('sell_provider_enumeration', 0x383B912, 0x17F8160),
    ('enumerator_materializes_source', 0x17F8497, 0x17F8F70),
    ('database_binary_source_type', 0x380AC92, 0x380A260),
)
WINDOWS = (
    ('sell_provider_enumerate_call', 0x383B908, 22,
     '622510718407d15cbf09008f655897fffffe4fc53d6b090b1b7416cae17433c8'),
    ('provider_source_enumerator_loop', 0x17F847F, 40,
     'd4d57837f476285b058bbb69356720e5ed3e3bacfc1d01e37ee3e2f8e1fc35c2'),
    ('database_binary_record_materialization', 0x380AC88, 38,
     '06cf7fc9eaf442fb361aae22db347414a565a129d488cf4ab6fa3a98e07d3c7d'),
)


def require(condition, reason):
    if not condition:
        raise ValueError('DB02_PRICE_PROVIDER_' + reason)


def scan_item_prices(price_fields, all_item_ids, all_sell_keys):
    """Add a provider's item rows to global sets. Strict, fixture-testable."""
    require(isinstance(price_fields, list), 'ITEM_PRICES_NOT_FIELDS')
    stats = Counter()
    for number, wire, blob in price_fields:
        require((number, wire) == (1, 2), 'PRICE_ROW_WIRE')
        record = fields(blob)
        item_id = one(record, 1, 0, True)
        require(valid_id(item_id), 'INVALID_ITEM_ID')
        require(item_id not in all_item_ids, 'PRICE_PROVIDER_ITEM_ID_COLLISION')
        all_item_ids.add(item_id)
        buys, sells = many(record, 2, 2), many(record, 3, 2)
        require(bool(buys) or bool(sells), 'EMPTY_ITEM_PRICES')
        stats['rows'] += 1
        stats['buyRows'] += bool(buys)
        stats['sellRows'] += bool(sells)
        currencies = set()
        for raw_cost in sells:
            cost = fields(raw_cost)
            currency_id = one(cost, 1, 0, True)
            require(valid_id(currency_id) and
                    currency_id not in currencies,
                    'DUPLICATE_OR_INVALID_SELL_CURRENCY')
            currencies.add(currency_id)
            key = (item_id, currency_id)
            require(key not in all_sell_keys, 'PRICE_PROVIDER_SELL_COLLISION')
            all_sell_keys.add(key)
            amount = one(cost, 2, 0, False)
            stats['sellCurrencyRecords'] += 1
            stats['explicitSellAmountFields'] += amount is not None
            stats['omittedSellAmountFields'] += amount is None
    return stats


def original_price_provider_census(proto_raw):
    """Authenticate the exact complete source and ensure no priority conflict."""
    require(isinstance(proto_raw, bytes) and
            len(proto_raw) == ORIGINAL_PROTO_BYTES and
            hashlib.sha256(proto_raw).hexdigest() ==
            ORIGINAL_PROTO_SHA256, 'ORIGINAL_PROTO_SHA')
    original = fields(proto_raw)
    require(len(original) == ORIGINAL_PROTO_ENTRIES and
            all((n, w) == (1, 2) for n, w, _ in original),
            'ORIGINAL_ENTRY_LAYOUT')
    specs = {index: (key, typ, row_count)
             for index, key, typ, row_count in PROVIDERS}
    observed, all_ids, all_sell_keys, aggregate = [], set(), set(), Counter()
    for index, (_, _, blob) in enumerate(original):
        record = fields(blob)
        envelope = fields(one(record, 2, 2, True))
        impl = string(one(envelope, 5, 2, True))
        if impl not in (STATIC, DYNAMIC):
            continue
        require(index in specs, 'UNEXPECTED_PRICE_PROVIDER')
        expected_key, expected_type, expected_rows = specs[index]
        require(string(one(record, 1, 2, True)) == expected_key and
                impl == expected_type, 'PROVIDER_IDENTITY')
        payload = fields(one(envelope, 6, 2, True))
        if impl == DYNAMIC:
            # The serialized dynamic provider has a nested ItemPriceDatabase.
            payload = fields(one(payload, 3, 2, True))
        stats = scan_item_prices(payload, all_ids, all_sell_keys)
        require(stats['rows'] == expected_rows, 'PROVIDER_ROW_COUNT')
        aggregate.update(stats)
        observed.append((index, expected_key, impl))

    require(len(observed) == len(specs) and
            set(index for index, _, _ in observed) == set(specs),
            'PRICE_PROVIDER_CENSUS')
    require(len(all_ids) == 9537 and
            aggregate['rows'] == 9537 and
            aggregate['buyRows'] == 9056 and
            aggregate['sellRows'] == 1149 and
            len(all_sell_keys) == 1192 and
            aggregate['sellCurrencyRecords'] == 1192 and
            aggregate['explicitSellAmountFields'] == 718 and
            aggregate['omittedSellAmountFields'] == 474,
            'ORIGINAL_SOURCE_AGGREGATES')
    return {
        'serializedPriceProviderCount': len(observed),
        'serializedStaticPriceProviderCount': sum(
            impl == STATIC for _, _, impl in observed),
        'serializedDynamicPriceProviderCount': sum(
            impl == DYNAMIC for _, _, impl in observed),
        'sourceItemPricesRowCount': aggregate['rows'],
        'sourceDistinctItemPriceIds': len(all_ids),
        'sourceBuyRowCount': aggregate['buyRows'],
        'sourceSellItemCount': aggregate['sellRows'],
        'sourceSellCurrencyKeyCount': len(all_sell_keys),
        'sourceSellAmountFieldPresentCount':
            aggregate['explicitSellAmountFields'],
        'sourceSellAmountFieldOmittedCount':
            aggregate['omittedSellAmountFields'],
        'sourceItemIdCrossProviderCollisions': 0,
        'sourceSellItemCurrencyCrossProviderCollisions': 0,
        'dynamicSourceProviderOrdinalBeforeStaticProviders': True,
        'originalSourceSHA256Verified': True,
    }


def verify_native_enumeration(assembly_path):
    """Verify the SHA-pinned native traversal calls, not runtime order."""
    path = Path(assembly_path)
    require(path.is_file() and path.stat().st_size == DLL_SIZE,
            'ORIGINAL_DLL_SIZE')
    with path.open('rb') as handle:
        require(hashlib.file_digest(handle, 'sha256').hexdigest() ==
                DLL_SHA256, 'ORIGINAL_DLL_SHA')
        rva, length, offset = pe_il2cpp_section(handle, DLL_SIZE)

        def read_native(address, count):
            require(rva <= address and 0 < count <= 1024 and
                    address + count <= rva + length, 'NATIVE_SECTION_RANGE')
            handle.seek(offset + address - rva)
            raw = handle.read(count)
            require(len(raw) == count, 'NATIVE_SECTION_EOF')
            return raw

        for _, address, count, expected in WINDOWS:
            require(hashlib.sha256(read_native(address, count)).hexdigest() ==
                    expected, 'NATIVE_WINDOW_SHA')
        for _, address, target in CALL_EDGES:
            verified_relative_call(read_native, address, target)
    return True


def audit(proto_raw, assembly_path=None):
    result = original_price_provider_census(proto_raw)
    native = (verify_native_enumeration(assembly_path)
              if assembly_path is not None else False)
    return {
        'contract': CONTRACT, 'gameVersion': '1.26.2', 'platform': 'Steam',
        **result,
        'sourceProviderPrecedenceCannotChangeSourceItemRowSelection': True,
        'originalNativeEnumerationCallEdgesVerified': len(CALL_EDGES)
            if native else 0,
        'originalNativeEnumerationInstructionWindowsVerified': len(WINDOWS)
            if native else 0,
        'nativeSourceProviderEnumerationPathVerified': native,
        'runtimeRegistrationOrderVerified': False,
        'runtimeRegisteredProviderSetEqualsSourceSnapshotVerified': False,
        'runtimeDynamicCacheUnmodifiedVerified': False,
        'actualItemOrMealSellPrice': None,
        'publishable': False, 'writable': False, 'playerSaveRead': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--protodb', required=True, type=Path)
    parser.add_argument('--assembly', type=Path,
                        help='Optional original Steam 1.26.2 GameAssembly.dll')
    args = parser.parse_args()
    try:
        print(json.dumps(audit(args.protodb.read_bytes(), args.assembly),
                         indent=2))
    except (OSError, ValueError) as exc:
        parser.exit(1, f'DB-02 price provider audit failed: {exc}\n')


if __name__ == '__main__':
    main()
