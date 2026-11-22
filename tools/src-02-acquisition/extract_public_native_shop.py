"""Extract minimal source-native Premium Shop IDs from the owner-local Steam cache.

Run offline: python tools/src-02-acquisition/extract_public_native_shop.py stores.dat out.json
The source archive stays private. Only the 29 sanitized product IDs and 156
item/quantity/price-allocation relations are suitable for publication.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

SOURCE_SHA = '233c03e73d22503dba2f6b0961ecaa8f36ac7ef16848bb88c35e2d86f696b1ff'
SOURCE_SIZE = 72740
SCHEMA = 'wand.db02.public-native-shop-snapshot@1'


def make_projection(data: bytes) -> dict:
    if len(data) != SOURCE_SIZE or hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise ValueError('SOURCE_PIN_MISMATCH')
    outer = json.loads(data)
    if set(outer) != {'Data'} or set(outer['Data']) != {'Shop20261118'}:
        raise ValueError('UNEXPECTED_SOURCE_SHOP')
    snap = json.loads(outer['Data']['Shop20261118'])
    if (snap.get('Version') != 12604 or snap.get('MinGameVersion') != '1.26'
        or snap.get('OnlineId') != 'Shop20261118' or snap.get('Language') != 'en-US'
        or snap.get('Active') is not True
        or snap.get('StartDate', {}).get('Operator') != 'IntOperator_GreaterThanOrEqual'
        or snap.get('EndDate', {}).get('Operator') != 'IntOperator_LessThan'):
        raise ValueError('UNEXPECTED_SOURCE_VERSION')
    rows = []
    seen = set()
    distinct = set()
    item_rows = 0
    discounts = 0
    for category in snap['Categories']:
        if not isinstance(category.get('Title'), str):
            raise ValueError('INVALID_CATEGORY')
        for root in category['Data'].values():
            entries = []
            for store in root.get('Stores', []):
                sd = store['Data']
                if store['Id'] != sd['OnlineId'] or sd['Active'] is not True:
                    raise ValueError('INVALID_STORE')
                entries.extend((store['Id'], offer) for offer in sd.get('BundleContents', []))
            entries.extend((None, offer) for offer in root.get('Bundles', []))
            for store_id, offer in entries:
                payload = offer['Data']
                bid = offer['Id']
                if (bid in seen or bid != payload.get('OnlineId')
                    or payload.get('Language') != 'en-US' or payload.get('Active') is not True):
                    raise ValueError('INVALID_OFFER')
                seen.add(bid)
                title = payload.get('Title') or None
                if title is not None and not isinstance(title, str):
                    raise ValueError('INVALID_TITLE')
                discount = offer.get('SaleDiscount')
                if discount is not None:
                    if not isinstance(discount, int) or not (0 < discount < 100):
                        raise ValueError('INVALID_DISCOUNT')
                    discounts += 1
                items = []
                for row in payload['Contents']:
                    id_num, quantity, price = row['ItemId'], row['Quantity'], row['Price']
                    if (not isinstance(id_num, int) or isinstance(id_num, bool)
                        or not (0 < id_num <= 9_007_199_254_740_991)
                        or not isinstance(quantity, int) or quantity <= 0
                        or price.get('CurrencyId') != 80100000
                        or not isinstance(price.get('Amount'), int)
                        or price['Amount'] <= 0):
                        raise ValueError('INVALID_ITEM')
                    distinct.add(id_num)
                    item_rows += 1
                    items.append([str(id_num), quantity, price['Amount']])
                if not items:
                    raise ValueError('EMPTY_OFFER')
                rows.append([bid, store_id, category['Title'], title, discount, items])
    if (len(rows), item_rows, len(distinct), discounts) != (29, 156, 136, 2):
        raise ValueError('SHOP_CENSUS_MISMATCH')
    return {
        'schema': SCHEMA,
        'target': {'platform': 'Steam', 'gameVersion': '1.26.2'},
        'source': {
            'originalSha256': SOURCE_SHA,
            'originalBytes': SOURCE_SIZE,
            'cachePath': 'Cache/liveops/stores.dat',
            'snapshotKey': 'Shop20261118',
            'nativeVersion': 12604,
            'nativeMinGameVersion': '1.26',
            'captureDate': '2026-11-22',
            'currencyItemId': '80100000',
            'configuredOnly': True,
            'currentAvailabilityVerified': False,
            'accountOwnershipVerified': False,
            'historicalCoverageComplete': False,
        },
        'window': {
            'startUtc': snap['StartDate']['Date'],
            'endUtcExclusive': snap['EndDate']['Date'],
        },
        'counts': {
            'offers': len(rows), 'itemOccurrences': item_rows,
            'distinctItemIds': len(distinct), 'discountedOffers': discounts,
        },
        'offers': rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('original', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    projection = make_projection(args.original.read_bytes())
    result = json.dumps(projection, ensure_ascii=False, sort_keys=True,
                        separators=(',', ':')).encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print('bytes', len(result), 'sha256', hashlib.sha256(result).hexdigest())


if __name__ == '__main__':
    main()
