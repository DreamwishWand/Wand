#!/usr/bin/env python3
"""Private Item ID projection of the authenticated Steam 1.26.2 prices.
Never writes into the repository. Reuses DB-02 source provider census.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-02-acquisition'))
from audit_native_sell_formula_source import fields, many, one, string, valid_id
from audit_native_price_provider_registry_1262 import (
    ORIGINAL_PROTO_SHA256, PROVIDERS, DYNAMIC, original_price_provider_census,
)

MANIFEST_SHA = '641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975'

def require(ok, reason):
    if not ok:
        raise ValueError('DB01_PRICE_CANDIDATE_' + reason)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def costs(record, field):
    result = []
    seen = set()
    for raw in many(record, field, 2):
        cost = fields(raw)
        currency = one(cost, 1, 0, True)
        amount = one(cost, 2, 0)
        require(valid_id(currency) and currency not in seen, 'CURRENCY')
        require(amount is None or 0 <= amount <= 2147483647, 'AMOUNT')
        seen.add(currency)
        result.append([currency, amount])
    return result

def build(proto, archive):
    census = original_price_provider_census(proto)
    with zipfile.ZipFile(archive) as z:
        require(len(z.namelist()) == len(set(z.namelist())) == 5, 'ZIP_MEMBERS')
        manifest_bytes = z.read('manifest.json')
        require(sha(manifest_bytes) == MANIFEST_SHA, 'MANIFEST_SHA')
        manifest = json.loads(manifest_bytes)
        require(manifest['privateOnly'] is True and manifest['publicationAuthorized'] is False, 'PRIVATE_BOUNDARY')
        require(set(z.namelist()) == {'manifest.json', *manifest['files']}, 'ZIP_LEDGER')
        for name, digest in manifest['files'].items():
            require(sha(z.read(name)) == digest, 'MEMBER_SHA')
        legacy = {}
        for line in z.read('static-item-prices.jsonl').splitlines():
            row = json.loads(line)
            require(row['itemId'] not in legacy, 'LEGACY_DUPLICATE')
            legacy[row['itemId']] = row
    entries = fields(proto)
    rows = []
    counts = Counter()
    for index, key, impl, expected in PROVIDERS:
        record = fields(entries[index][2])
        envelope = fields(one(record, 2, 2, True))
        require(string(one(record, 1, 2, True)) == key and string(one(envelope, 5, 2, True)) == impl, 'PROVIDER')
        payload = fields(one(envelope, 6, 2, True))
        if impl == DYNAMIC:
            payload = fields(one(payload, 3, 2, True))
        require(len(payload) == expected, 'ROW_COUNT')
        for position, (_, _, raw) in enumerate(payload):
            f = fields(raw)
            item = one(f, 1, 0, True)
            buy, sell = costs(f, 2), costs(f, 3)
            if impl != DYNAMIC:
                old = legacy.pop(item)
                require(old['databaseKey'] == key and old['indexWithinDatabase'] == position and old['nativeWireSha256'] == sha(raw), 'LEGACY_IDENTITY')
                for actual, name in [(buy, 'purchaseCostDefinitions'), (sell, 'sellValueDefinitions')]:
                    require(actual == [[v['currencyId'], v['amount']] for v in old[name]], 'LEGACY_COSTS')
            kind = 'dynamic_cache' if impl == DYNAMIC else 'static'
            rows.append([item, kind, index, position, buy, sell])
            counts[kind + '_items'] += 1
            for direction, values in [('purchase', buy), ('sell', sell)]:
                counts[kind + '_' + direction + '_entries'] += len(values)
                counts[kind + '_' + direction + '_missing_amount'] += sum(v[1] is None for v in values)
    require(not legacy and len(rows) == len({r[0] for r in rows}) == 9537, 'ITEM_CENSUS')
    require(sum(len(r[5]) for r in rows) == 1192, 'SELL_CENSUS')
    require(sum(v[1] is not None for r in rows for v in r[5]) == 718, 'SELL_EXPLICIT_CENSUS')
    return {'schema':'wand.db01.private-item-price-candidate@1', 'target':{'platform':'Steam','gameVersion':'1.26.2'},
            'sourceProtoDbSha256':ORIGINAL_PROTO_SHA256,'staticSourceManifestSha256':MANIFEST_SHA,
            'privateOnly':True,'publicationAuthorized':False,'runtimePriceVerified':False,
            'rowLayout':['itemId','providerKind','sourceRecordIndex','sourcePosition','purchaseCosts','sellCosts'],
            'costLayout':['currencyItemId','serializedAmountOrNull'],
            'coverage':dict(sorted(counts.items())), 'sourceCensus':census,
            'items':sorted(rows)}

def verify_catalog(doc, archive):
    """Verify every price owner and currency against the original DB-01 catalog."""
    with zipfile.ZipFile(archive) as z:
        manifest_raw = z.read('manifest.json')
        require(sha(manifest_raw) == '05ed08d9f699df71976bc0927aa0c1882004a74ae6ff16f17603008b62ae2ca2', 'CATALOG_MANIFEST')
        manifest = json.loads(manifest_raw)
        require(manifest['sourceItemsSha256'] == 'de579d94fa10258249c9c477075110d0bcf001a0d865a15ded039efb3616c8f0' and manifest['gameVersion'] == '1.26.2', 'CATALOG_SOURCE')
        categories = {}
        for path, pin in manifest['files'].items():
            if not path.startswith('category/'):
                continue
            raw = z.read(path)
            require(len(raw) == pin['bytes'] and sha(raw) == pin['sha256'], 'CATALOG_MEMBER')
            rows = json.loads(raw)
            require(len(rows) == pin['count'], 'CATALOG_COUNT')
            for row in rows:
                require(valid_id(row['itemId']) and row['itemId'] not in categories, 'CATALOG_ID')
                categories[row['itemId']] = row['nativeCategory']
        require(len(categories) == 39067, 'CATALOG_CENSUS')
    require(all(r[0] in categories for r in doc['items']), 'UNRESOLVED_PRICE_OWNER')
    currencies = {v[0] for r in doc['items'] for v in r[4] + r[5]}
    require(all(categories.get(c) == 'Currency' for c in currencies), 'UNRESOLVED_CURRENCY')
    return {'matchedItemIds':len(doc['items']), 'currencyIds':len(currencies),
            'priceCategories':dict(Counter(categories[r[0]] for r in doc['items'])),
            'sellCategories':dict(Counter(categories[r[0]] for r in doc['items'] if r[5]))}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--protodb', type=Path, required=True)
    p.add_argument('--static-zip', type=Path, required=True)
    p.add_argument('--private-out', type=Path, required=True)
    p.add_argument('--catalog-zip', type=Path, required=True)
    a = p.parse_args()
    require(not a.private_out.exists(), 'NO_OVERWRITE')
    require(not a.private_out.resolve().is_relative_to(Path(__file__).resolve().parents[2]), 'PRIVATE_OUTPUT_PATH')
    doc = build(a.protodb.read_bytes(), a.static_zip)
    join = verify_catalog(doc, a.catalog_zip)
    raw = (json.dumps(doc, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n').encode()
    with a.private_out.open('xb') as out:
        out.write(raw)
    print(json.dumps({'items':len(doc['items']),'coverage':doc['coverage'],'sha256':sha(raw),'bytes':len(raw),'catalogJoin':join,'publicationAuthorized':False}, sort_keys=True))

if __name__ == '__main__':
    main()
