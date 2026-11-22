"""Extract minimal source-native Premium Shop IDs from the owner-local Steam cache.

Run offline: python tools/src-02-acquisition/extract_public_native_shop.py stores.dat out.json
For historical cache: add --historical. Only sanitized offer IDs, Item IDs,
quantities and price allocations are emitted. Source backups stay private.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

SOURCE_SHA = '233c03e73d22503dba2f6b0961ecaa8f36ac7ef16848bb88c35e2d86f696b1ff'
SOURCE_SIZE = 72740
HISTORICAL_SHA = '01a561793ecaa253457e89797da03e929ca8bb8e3dac7d257d786215584468a5'
HISTORICAL_CORROBORATING_SHA = '9553c37b141123b70550b64ef4bd683c7c08b84f52fc4a63e737b0e8e0a95138'
SCHEMA = 'wand.db02.public-native-shop-snapshot@1'


def make_projection(data: bytes, historical: bool = False) -> dict:
    source_sha = HISTORICAL_SHA if historical else SOURCE_SHA
    source_size = 70749 if historical else SOURCE_SIZE
    snapshot_key = 'Shop20260715' if historical else 'Shop20261118'
    native_version = 12401 if historical else 12604
    min_game_version = '1.24' if historical else '1.26'
    expected_counts = (27, 128, 120, 2) if historical else (29, 156, 136, 2)
    if len(data) != source_size or hashlib.sha256(data).hexdigest() != source_sha:
        raise ValueError('SOURCE_PIN_MISMATCH')
    outer = json.loads(data)
    if set(outer) != {'Data'} or set(outer['Data']) != {snapshot_key}:
        raise ValueError('UNEXPECTED_SOURCE_SHOP')
    snap = json.loads(outer['Data'][snapshot_key])
    if (snap.get('Version') != native_version or
        snap.get('MinGameVersion') != min_game_version
        or snap.get('OnlineId') != snapshot_key or snap.get('Language') != 'en-US'
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
    if (len(rows), item_rows, len(distinct), discounts) != expected_counts:
        raise ValueError('SHOP_CENSUS_MISMATCH')
    return {
        'schema': SCHEMA,
        'target': {'platform': 'Steam',
                   'gameVersion': None if historical else '1.26.2'},
        'source': {
            'originalSha256': source_sha,
            'originalBytes': source_size,
            'cachePath': ('Cache/liveops/stores.dat.backup-20260716'
                          if historical else 'Cache/liveops/stores.dat'),
            'snapshotKey': snapshot_key,
            'nativeVersion': native_version,
            'nativeMinGameVersion': min_game_version,
            'captureDate': '2026-07-16' if historical else '2026-11-22',
            **({
                'fullGameVersionVerified': False,
                'sourceIsArchivedBackup': True,
                'corroboratingBackupSha256': HISTORICAL_CORROBORATING_SHA,
                'backupDifferencesLimitedToUpdateTimestamps': True,
            } if historical else {}),
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
    parser.add_argument('--historical', action='store_true',
                        help='Use the SHA-pinned July 2026 archived source cache')
    args = parser.parse_args()
    projection = make_projection(args.original.read_bytes(),args.historical)
    result = json.dumps(projection, ensure_ascii=False, sort_keys=True,
                        separators=(',', ':')).encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print('bytes', len(result), 'sha256', hashlib.sha256(result).hexdigest())


if __name__ == '__main__':
    main()
