#!/usr/bin/env python3
"""Exact-source private Steam v1.26.2 ProtoDB static shops and price evidence.

Never claims live offers, player eligibility, sale prices or stock. No originals or
licensed source-derived catalogs may be committed to the public repository.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

SCHEMA = 'wand.db02.protodb-shops@1'
PROTO_SHA = 'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
R5_ZIP_SHA = '7914b88b4d7c546ee362a907d9a66691debcafc54caefb0815254edc10fa7fb8'
R5_MANIFEST_SHA = 'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c'
R5_STALL_SHA = '153d524f607e14c3395af525d974ed60f0320d4991738b37ed020378123c2b66'
SOURCE = 'ddv_Data/StreamingAssets/protoDb.bin'
PRICE = 'Definitions.Shops.ItemPriceDatabase'
SHOP = 'Definitions.Shops.Shop'
DYNAMIC = 'Definitions.Shops.DynamicItemPriceDatase'


def fail(code):
    raise ValueError('DB02_PROTO_SHOPS_' + code)


def require(test, code):
    if not test:
        fail(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(path, limit):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and 0 < path.stat().st_size <= limit, 'INPUT_FILE')
    data = path.read_bytes()
    require(len(data) == path.stat().st_size, 'SOURCE_SIZE_RACE')
    return data


def uint(raw, offset):
    start = offset
    result = 0
    for shift in range(0, 70, 7):
        require(offset < len(raw), 'TRUNCATED_VARINT')
        value = raw[offset]
        offset += 1
        require(shift < 63 or value <= 1, 'VARINT_OVERFLOW')
        result |= (value & 127) << shift
        if value < 128:
            canonical = []
            n = result
            while n > 127:
                canonical.append((n & 127) | 128)
                n >>= 7
            canonical.append(n)
            require(raw[start:offset] == bytes(canonical), 'NONCANONICAL_VARINT')
            return result, offset
    fail('LONG_VARINT')


def fields(raw):
    require(isinstance(raw, bytes) and len(raw) <= 4 * 1024 * 1024, 'MESSAGE_SIZE')
    result = []
    p = 0
    while p < len(raw):
        tag, p = uint(raw, p)
        field, wire = tag >> 3, tag & 7
        require(1 <= field <= 536870911 and wire in (0, 1, 2, 5), 'INVALID_WIRE')
        if wire == 0:
            value, p = uint(raw, p)
        elif wire == 2:
            count, p = uint(raw, p)
            require(count <= len(raw) - p, 'TRUNCATED_LENGTH')
            value = raw[p:p+count]
            p += count
        else:
            count = 8 if wire == 1 else 4
            require(count <= len(raw) - p, 'TRUNCATED_FIXED')
            value = raw[p:p+count]
            p += count
        result.append((field, wire, value))
        require(len(result) <= 100000, 'FIELD_LIMIT')
    return result


def all_of(ff, no, wire):
    require(not any(f == no and w != wire for f, w, _ in ff), 'TYPED_FIELD_WIRE')
    return [x for f, w, x in ff if (f, w) == (no, wire)]


def one(ff, no, wire):
    xs = all_of(ff, no, wire)
    require(len(xs) <= 1, 'DUPLICATE_SCALAR')
    return xs[0] if xs else None


def required(ff, no, wire):
    x = one(ff, no, wire)
    require(x is not None, 'MISSING_REQUIRED_FIELD')
    return x


def string(raw):
    try:
        value = raw.decode('utf-8')
    except UnicodeDecodeError:
        fail('INVALID_UTF8')
    require(bool(value) and len(value) <= 256 and all(ord(c) >= 32 for c in value), 'INVALID_NAME')
    return value


def cost(raw):
    ff = fields(raw)
    currency = required(ff, 1, 0)
    amount = one(ff, 2, 0)
    require(0 < currency <= 2147483647 and (amount is None or amount <= 2147483647), 'INVALID_COST')
    return {'currencyId': currency, 'amount': amount,
            'amountFieldPresent': amount is not None, 'nativeWireSha256': digest(raw)}


def parse_proto(raw):
    require(len(raw) == 1335720 and digest(raw) == PROTO_SHA, 'PROTODB_SOURCE_SHA')
    entries = []
    seen = set()
    for idx, (field, kind, body) in enumerate(fields(raw)):
        require((field, kind) == (1, 2), 'PROTODB_CONTAINER_WIRE')
        ff = fields(body)
        name = string(required(ff, 1, 2))
        require(name not in seen, 'DUPLICATE_ENTRY')
        seen.add(name)
        envelope = fields(required(ff, 2, 2))
        cls = string(required(envelope, 5, 2))
        blobs = all_of(envelope, 6, 2)
        if cls in (SHOP, PRICE, DYNAMIC):
            require(len(blobs) == 1, 'SHOP_MISSING_DEFINITION')
            entries.append((idx, name, cls, blobs[0]))
    require(len(seen) == 2246, 'PROTODB_ENTRY_CENSUS')
    return entries


def parse_shop(name, source_index, body):
    ff = fields(body)
    slots = []
    for index, blob in enumerate(all_of(ff, 1, 2)):
        slot = fields(blob)
        currency = one(slot, 4, 0)
        require(currency is None or 0 < currency <= 2147483647, 'SHOP_SLOT_CURRENCY')
        fatigue = one(slot, 2, 2)
        slots.append({'index': index, 'currencyId': currency, 'fatigueSourceSha256':
                      digest(fatigue) if fatigue is not None else None,
                      'nativeWireSha256': digest(blob)})
    refresh = one(ff, 3, 2)
    return {'shopKey': name, 'slots': slots,
            'slotCount': len(slots),
            'refreshCost': cost(refresh) if refresh is not None else None,
            'refreshBaseIncrease': one(ff, 4, 0),
            'refreshIncreasePercent': one(ff, 5, 0),
            'refreshIncreaseCap': one(ff, 6, 0),
            'supportsDailySellCap': one(ff, 7, 0),
            'isDispenser': one(ff, 8, 0),
            'restrictItemsToCurrentScene': one(ff, 9, 0),
            'currentOffersVerified': False, 'stockVerified': False,
            'nativeWireSha256': digest(body), 'sourceEntryIndex': source_index}


def parse_prices(name, source_index, body):
    rows = []
    seen = set()
    for index, blob in enumerate(all_of(fields(body), 1, 2)):
        ff = fields(blob)
        item = required(ff, 1, 0)
        require(0 < item <= 2147483647 and item not in seen, 'PRICE_ITEM_ID')
        seen.add(item)
        buys = [cost(x) for x in all_of(ff, 2, 2)]
        sells = [cost(x) for x in all_of(ff, 3, 2)]
        require(len({x['currencyId'] for x in buys}) == len(buys) and
                len({x['currencyId'] for x in sells}) == len(sells), 'PRICE_DUPLICATE_CURRENCY')
        rows.append({'databaseKey': name, 'itemId': item,
                     'purchaseCostDefinitions': buys, 'sellValueDefinitions': sells,
                     'indexWithinDatabase': index, 'nativeWireSha256': digest(blob),
                     'currentShopPriceVerified': False,
                     'currentPurchaseEligibilityVerified': False})
    return rows


def private_stalls(raw):
    require(digest(raw) == R5_ZIP_SHA, 'R5_ZIP_SHA')
    import io
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and 'manifest.json' in names and
                'stall-sources.jsonl' in names, 'R5_ZIP_ENTRIES')
        for entry in archive.infolist():
            require(not entry.filename.startswith('/') and '..' not in entry.filename.split('/') and
                    entry.file_size <= 4 * 1024 * 1024 and not ((entry.external_attr >> 16) & 0o170000 == 0o120000),
                    'R5_UNSAFE_ENTRY')
        manifest_bytes = archive.read('manifest.json')
        require(digest(manifest_bytes) == R5_MANIFEST_SHA, 'R5_MANIFEST_SHA')
        manifest = json.loads(manifest_bytes)
        require(manifest.get('schema') == 'wand.src02@1' and
                manifest.get('platform') == 'Steam' and manifest.get('gameVersion') == '1.26.2' and
                manifest.get('files', {}).get('stall-sources.jsonl') == R5_STALL_SHA,
                'R5_INVALID_MANIFEST')
        blob = archive.read('stall-sources.jsonl')
        require(digest(blob) == R5_STALL_SHA, 'R5_STALL_SHA')
        rows = [json.loads(s) for s in blob.splitlines() if s.strip()]
        require(len(rows) == 65 and all(isinstance(x.get('stallId'), int) and
                isinstance(x.get('shopDataKey'), str) and
                isinstance(x.get('slotLootTableIds'), list) for x in rows), 'R5_STALL_CENSUS')
        return rows


def extract(proto, verified_zip):
    entries = parse_proto(proto)
    stalls = private_stalls(verified_zip)
    shops = []
    prices = []
    dynamics = []
    for index, name, cls, body in entries:
        if cls == SHOP:
            shops.append(parse_shop(name, index, body))
        elif cls == PRICE:
            prices.extend(parse_prices(name, index, body))
        else:
            ff = fields(body)
            dynamics.append({'databaseKey': name, 'nativeWireSha256': digest(body),
                             'formulaReferenceFieldsPresent': (bool(all_of(ff, 1, 2)),bool(all_of(ff, 2, 2))),
                             'cachedDataSha256': digest(one(ff, 3, 2)) if one(ff, 3, 2) else None,
                             'runtimeFormulaEvaluation': 'not_evaluated', 'sourceEntryIndex': index})
    keys = {x['shopKey']:x for x in shops}
    stall_links = []
    for row in stalls:
        shop = keys.get(row['shopDataKey'])
        require(shop is not None and shop['slotCount'] == len(row['slotLootTableIds']), 'R5_STALL_SHOP_SLOT_MISMATCH')
        stall_links.append({'stallId': row['stallId'], 'shopKey': row['shopDataKey'],
                            'nativeShopSlotCount': shop['slotCount'],
                            'nativeSlotCountMatchesStallLoot': True,
                            'offerItemMappingVerified': False})
    require(len(shops) == 44 and len(prices) == 988 and len(dynamics) == 1 and
            sum(x['slotCount'] for x in shops) == 218 and len(stall_links) == 65 and
            len({x['shopKey'] for x in stall_links}) == 41, 'EXTRACT_CENSUS')
    purchase = sum(len(x['purchaseCostDefinitions']) for x in prices)
    sell = sum(len(x['sellValueDefinitions']) for x in prices)
    missing = sum(not c['amountFieldPresent'] for x in prices for field in
                  ('purchaseCostDefinitions','sellValueDefinitions') for c in x[field])
    require((purchase, sell, missing) == (1348, 711, 3), 'PRICE_CENSUS')
    return ({'shops': sorted(shops,key=lambda x:x['shopKey']),
             'prices': sorted(prices,key=lambda x:(x['databaseKey'],x['itemId'])),
             'stallLinks': sorted(stall_links,key=lambda x:x['stallId']),
             'dynamic': dynamics},
            {'protoDbEntries':2246,'shopDefinitions':44,'shopSlots':218,
             'staticPriceDatabases':10,'staticPriceItemRows':988,
             'purchaseCostDefinitions':purchase,'sellValueDefinitions':sell,
             'absentSerializedAmounts':missing,'dynamicPriceDatabaseDefinitions':1,
             'matchedStallReferences':65,'matchedDistinctShopKeys':41,
             'verifiedCurrentShopOffers':0})


def write_release(out, extracted, counts):
    out = Path(out)
    checkout = Path(__file__).resolve().parents[2]
    if (checkout/'package.json').is_file():
        require(not out.resolve().is_relative_to(checkout), 'PUBLIC_CHECKOUT_OUTPUT_FORBIDDEN')
    require(not out.is_symlink(), 'OUTPUT_SYMLINK')
    out.mkdir(parents=True,exist_ok=True)
    filenames = {'shops':'shop-definitions.jsonl','prices':'static-item-prices.jsonl',
                 'stallLinks':'stall-shop-joins.jsonl','dynamic':'dynamic-price-source.jsonl'}
    file_hashes = {}
    for key, name in filenames.items():
        body = b''.join((json.dumps(record,sort_keys=True,ensure_ascii=False,separators=(',',':'))+'\n').encode()
                        for record in extracted[key])
        path = out/name
        require(not path.is_symlink(), 'OUTPUT_FILE_SYMLINK')
        path.write_bytes(body)
        file_hashes[name] = digest(body)
    manifest = {'schema':SCHEMA,'gameVersion':'1.26.2','platform':'Steam',
                'privateOnly':True,'publicationAuthorized':False,
                'source':{'file':SOURCE,'sha256':PROTO_SHA,
                          'verifiedAcross':'Steam v1.26.1 -> 1.26.2 identical original ProtoDB'},
                'src02R5ManifestSha256':R5_MANIFEST_SHA,'counts':counts,'files':file_hashes,
                'limits':['Source-configured static base purchase/sell price definitions, not actual shop offers',
                          'Live stock/eligibility, dynamic formula evaluation and discounts unverified',
                          'Source field absent amount is unknown, never zero/free',
                          'Shops may share static price databases; shop-to-price database selection unverified']}
    (out/'manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n',encoding='utf-8')
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--protodb',type=Path,required=True)
    parser.add_argument('--r5-private-zip',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    require(args.out.resolve() not in {args.protodb.resolve(),args.r5_private_zip.resolve()}, 'OUTPUT_COLLISION')
    records,counts=extract(read(args.protodb,4*1024*1024),read(args.r5_private_zip,4*1024*1024))
    output=write_release(args.out,records,counts)
    print(json.dumps({'status':'PRIVATE_STATIC_SOURCE_VERIFIED','counts':counts,
                      'manifestSha256':digest((Path(args.out)/'manifest.json').read_bytes())},sort_keys=True))


if __name__=='__main__':
    main()
