#!/usr/bin/env python3
"""Read-only, SHA-pinned DB-02 Steam 1.26.2 formula-to-dynamic-cache audit.

Outputs aggregate evidence only; never publishes original formula records,
source Item IDs, equations, actual runtime prices, or player save data.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

CONTRACT = 'wand.db02.native-formula-source-audit@1'
FORMULA_SHA = 'e147b306ce4bf5a6a143e4342d4e12e1571d36688842ed732fdfa23e7ba66451'
PROTO_SHA = 'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
DYNAMIC_SHA = '2fb01bfd8bddb0efce6a58bcaba57338566bf63fdadaf52cda0989955af48858'
CACHE_SHA = '6b97ccead7d8a134d7f2e0e58c82c47416126efa3fceefaefcec09d2fa15bd2e'
SOFT = 80000000


def require(check, error):
    if not check:
        raise ValueError('DB02_FORMULA_SOURCE_' + error)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def varint(raw, pos):
    begin, result = pos, 0
    for shift in range(0, 70, 7):
        require(pos < len(raw), 'TRUNCATED_VARINT')
        byte = raw[pos]
        pos += 1
        require(shift < 63 or byte <= 1, 'VARINT_OVERFLOW')
        result |= (byte & 127) << shift
        if byte < 128:
            temp, encoded = result, bytearray()
            while temp > 127:
                encoded.append((temp & 127) | 128)
                temp >>= 7
            encoded.append(temp)
            require(raw[begin:pos] == bytes(encoded), 'NONCANONICAL_VARINT')
            return result, pos
    raise ValueError('DB02_FORMULA_SOURCE_LONG_VARINT')


def fields(raw):
    require(isinstance(raw, bytes) and len(raw) <= 2 * 1024 * 1024,
            'INVALID_MESSAGE_BYTES')
    p, out = 0, []
    while p < len(raw):
        tag, p = varint(raw, p)
        number, wire = tag >> 3, tag & 7
        require(1 <= number <= 536870911 and wire in (0, 1, 2, 5),
                'INVALID_WIRE')
        if wire == 0:
            value, p = varint(raw, p)
        elif wire == 2:
            length, p = varint(raw, p)
            require(length <= len(raw) - p, 'TRUNCATED_MESSAGE')
            value = raw[p:p+length]
            p += length
        else:
            length = 8 if wire == 1 else 4
            require(length <= len(raw) - p, 'TRUNCATED_FIXED')
            value = raw[p:p+length]
            p += length
        out.append((number, wire, value))
        require(len(out) <= 100000, 'FIELD_LIMIT')
    return out


def many(ff, number, wire):
    require(not any(n == number and w != wire for n, w, _ in ff),
            'MISMATCHED_FIELD_WIRE')
    return [value for n, w, value in ff if (n, w) == (number, wire)]


def one(ff, number, wire, required=False):
    found = many(ff, number, wire)
    require(len(found) <= 1 and (not required or len(found) == 1),
            'MISSING_OR_DUPLICATE_FIELD')
    return found[0] if found else None


def valid_id(value):
    return isinstance(value, int) and 0 < value <= 2147483647


def string(raw):
    require(isinstance(raw, bytes) and 0 < len(raw) <= 4096, 'STRING_BYTES')
    try:
        value = raw.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise ValueError('DB02_FORMULA_SOURCE_INVALID_UTF8') from exc
    require(len(value) > 0 and all(ord(c) >= 32 for c in value),
            'INVALID_STRING')
    return value


def frames(raw):
    pos, found, keys = 0, {}, set()
    while pos < len(raw):
        key, pos = varint(raw, pos)
        length, pos = varint(raw, pos)
        require(key not in keys and 0 < length <= 1024 * 1024 and
                length <= len(raw) - pos, 'INVALID_FORMULA_FRAME')
        keys.add(key)
        ff = fields(raw[pos:pos+length])
        pos += length
        item_id = one(ff, 1, 0, True)
        require(valid_id(item_id) and item_id not in found,
                'DUPLICATE_FORMULA_ID')
        found[item_id] = ff
        require(len(found) <= 256, 'TOO_MANY_FORMULAS')
    return found


def packed_ids(raw):
    pos, result = 0, []
    while pos < len(raw):
        item_id, pos = varint(raw, pos)
        require(valid_id(item_id) and item_id not in result,
                'INVALID_FORMULA_REFERENCE')
        result.append(item_id)
        require(len(result) <= 32, 'TOO_MANY_REFERENCES')
    return result


def parse_source(proto):
    entries = fields(proto)
    require(len(entries) == 2246 and
            all(f == 1 and w == 2 for f, w, _ in entries),
            'PROTODB_ENTRY_COUNT')
    entry = fields(entries[274][2])
    require(string(one(entry, 1, 2, True)) == 'FormulaDynamicPriceDatabase',
            'DYNAMIC_SOURCE_KEY')
    envelope = fields(one(entry, 2, 2, True))
    require(string(one(envelope, 5, 2, True)) ==
            'Definitions.Shops.DynamicItemPriceDatase', 'DYNAMIC_CLASS')
    source = one(envelope, 6, 2, True)
    require(digest(source) == DYNAMIC_SHA, 'DYNAMIC_SHA')
    ff = fields(source)
    purchase = packed_ids(one(ff, 1, 2, True))
    sell = packed_ids(one(ff, 2, 2, True))
    cache = one(ff, 3, 2, True)
    require(digest(cache) == CACHE_SHA, 'CACHE_SHA')
    return purchase, sell, cache


def parse_cache(cache):
    explicit, sell_rows, buy_rows, rows = {}, 0, 0, 0
    ids = set()
    for field, wire, entry in fields(cache):
        require((field, wire) == (1, 2), 'CACHE_ROW_WIRE')
        ff = fields(entry)
        item = one(ff, 1, 0, True)
        require(valid_id(item) and item not in ids, 'CACHE_ITEM_ID')
        ids.add(item)
        buys, sells = many(ff, 2, 2), many(ff, 3, 2)
        require(bool(buys) != bool(sells), 'CACHE_PURCHASE_SELL_SHAPE')
        buy_rows += bool(buys)
        sell_rows += bool(sells)
        rows += 1
        for raw_cost in sells:
            cost = fields(raw_cost)
            currency = one(cost, 1, 0, True)
            amount = one(cost, 2, 0)
            require(currency == SOFT and (amount is None or amount <= 2147483647),
                    'CACHE_SELL_COST')
            if amount is not None:
                require(item not in explicit, 'DUPLICATE_EXPLICIT_COST')
                explicit[item] = amount
    require(rows == 8549 and buy_rows == 8068 and sell_rows == 481 and
            len(explicit) == 7, 'CACHE_CENSUS')
    return explicit


def parse_sell_definition(ff):
    object_type = string(one(ff, 6, 2, True))
    currency = one(ff, 7, 0, True)
    equation = string(one(ff, 8, 2, True))
    require(valid_id(currency), 'INVALID_FORMULA_CURRENCY')
    table_values = {}
    tables = many(ff, 9, 2)
    require(len(tables) == 1, 'SELL_TABLE_COUNT')
    for table in tables:
        x = fields(table)
        variable = string(one(x, 1, 2, True))
        field = string(one(x, 2, 2, True))
        require(len(variable) > 0 and len(field) > 0,
                'SOURCE_TABLE_DESCRIPTORS')
        for raw_value in many(x, 4, 2):
            vf = fields(raw_value)
            key = string(one(vf, 1, 2, True))
            require(key.isascii() and key.isdecimal(), 'TABLE_ITEM_ID')
            item = int(key)
            value = struct.unpack('<f', one(vf, 2, 5, True))[0]
            require(valid_id(item) and item not in table_values and
                    math.isfinite(value) and value >= 0 and
                    value <= 2147483647 and value.is_integer(),
                    'INVALID_TABLE_VALUE')
            table_values[item] = int(value)
    require(equation.startswith('{') and equation.endswith('}') and
            len(equation) <= 256 and object_type != '',
            'SELL_EQUATION_SHAPE')
    return currency, object_type, table_values


def audit(formula_raw, proto_raw):
    require(len(formula_raw) == 8760 and digest(formula_raw) == FORMULA_SHA,
            'FORMULA_ORIGINAL_SHA')
    require(len(proto_raw) == 1335720 and digest(proto_raw) == PROTO_SHA,
            'PROTO_ORIGINAL_SHA')
    source_purchase, source_sell, cache = parse_source(proto_raw)
    definitions = frames(formula_raw)
    require(len(definitions) == 32 and len(source_purchase) == 4 and
            len(source_sell) == 1 and
            len(set(source_purchase + source_sell)) == 5 and
            all(ref in definitions for ref in source_purchase + source_sell),
            'FORMULA_SOURCE_JOIN')
    for item_id in source_purchase:
        ff = definitions[item_id]
        require(string(one(ff, 6, 2, True)) != '' and
                string(one(ff, 7, 2, True)) != '', 'PURCHASE_FORMULA_WIRE')
    currency, object_type, formula_values = parse_sell_definition(
        definitions[source_sell[0]])
    explicit_cache = parse_cache(cache)
    require(currency == SOFT and len(formula_values) == 7 and
            explicit_cache == formula_values, 'FORMULA_CACHE_VALUE_JOIN')
    return {
        'contract': CONTRACT, 'gameVersion': '1.26.2', 'platform': 'Steam',
        'originalFormulaSha256Verified': True,
        'originalProtoDbSha256Verified': True,
        'formulaDefinitionsInOriginalItemlist': len(definitions),
        'originalPurchaseFormulaReferencesMatched': len(source_purchase),
        'originalSellFormulaReferencesMatched': len(source_sell),
        'sellFormulaCurrencyMatchesSoft': True,
        'sellFormulaObjectTypeSourcePresent': bool(object_type),
        'sellFormulaEquationSourceVerified': True,
        'sellFormulaExplicitTableRows': len(formula_values),
        'dynamicCacheExplicitSellAmountRows': len(explicit_cache),
        'formulaAndCacheSourceValueExactMatch': True,
        'nativeObjectTypeResolvedToRuntimeType': False,
        'nativeFormulaAppliedToCookingIngredients': None,
        'runtimeRegisteredProviderSelectionVerified': False,
        'actualItemSellPrice': None,
        'actualMealSellPrice': None,
        'publishable': False, 'writable': False,
    }


def read(path, max_size):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and
            0 < path.stat().st_size <= max_size, 'INPUT_FILE')
    return path.read_bytes()


def main():
    parser = argparse.ArgumentParser(description='Private source-only DB-02 sell formula audit')
    parser.add_argument('--formula', required=True)
    parser.add_argument('--protodb', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(audit(read(args.formula, 8760),
                               read(args.protodb, 1335720)), indent=2))
    except (OSError, ValueError) as exc:
        parser.exit(1, f'DB-02 formula source audit failed: {exc}\n')


if __name__ == '__main__':
    main()
