"""Source-pinned offline extraction of native IAP package -> Item ID rewards.

Usage:
  python tools/src-02-acquisition/extract_public_iap.py protoDb.bin iap-rewards-1.26.2.json

The original Steam 1.26.1 protoDb is verified byte-identical to Steam 1.26.2
by the existing DB-03 offline source audit. No native game assets, storefront
account data, receipts, save bytes or platform SKU data enter the projection.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

PROTO_SHA = 'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
PROTO_BYTES = 1335720
EXPECTED_RECORDS = 2246
SCHEMA = 'wand.db02.public-static-iap@1'


def varint(data: bytes, pos: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while pos < len(data) and shift <= 63:
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
        shift += 7
    raise ValueError('MALFORMED_VARINT')


def fields(data: bytes) -> list[tuple[int, int, int | bytes]]:
    result = []
    pos = 0
    while pos < len(data):
        tag, pos = varint(data, pos)
        field_id, wire = tag >> 3, tag & 7
        if field_id <= 0:
            raise ValueError('INVALID_FIELD_ID')
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            size, pos = varint(data, pos)
            if size < 0 or pos + size > len(data):
                raise ValueError('INVALID_SUBMESSAGE_LENGTH')
            value = data[pos:pos + size]
            pos += size
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            if pos + size > len(data):
                raise ValueError('INVALID_FIXED_FIELD')
            value = data[pos:pos + size]
            pos += size
        else:
            raise ValueError('UNSUPPORTED_WIRE_TYPE')
        result.append((field_id, wire, value))
    return result


def one(rows: list, field: int) -> int | bytes | None:
    matches = [value for key, _, value in rows if key == field]
    if len(matches) > 1:
        raise ValueError('DUPLICATED_SCALAR_FIELD')
    return matches[0] if matches else None


def strings(rows: list, field: int) -> str | None:
    raw = one(rows, field)
    if raw is None:
        return None
    if not isinstance(raw, bytes):
        raise ValueError('STRING_WIRE')
    return raw.decode('ascii')


def item_rewards(rows: list, field: int) -> list[list[str | int]]:
    output = []
    for key, wire, payload in rows:
        if key != field:
            continue
        if wire != 2 or not isinstance(payload, bytes):
            raise ValueError('REWARD_WIRE')
        part = fields(payload)
        item = one(part, 1)
        amount = one(part, 2)
        if not (isinstance(item, int) and isinstance(amount, int)
                and 0 < item <= 9_007_199_254_740_991 and
                0 < amount <= 2_147_483_647):
            raise ValueError('REWARD_ITEM_AMOUNT')
        output.append([str(item), amount])
    return output


def make_projection(original: bytes) -> dict:
    if len(original) != PROTO_BYTES or hashlib.sha256(original).hexdigest() != PROTO_SHA:
        raise ValueError('ORIGINAL_SOURCE_SHA_MISMATCH')
    records = fields(original)
    if len(records) != EXPECTED_RECORDS:
        raise ValueError('ORIGINAL_RECORD_CENSUS')
    packages = []
    counters = Counter()
    keys = set()
    all_item_ids = set()
    for field, wire, raw in records:
        if field != 1 or wire != 2 or not isinstance(raw, bytes):
            raise ValueError('RECORD_ENVELOPE')
        entry = fields(raw)
        metadata = fields(one(entry, 2))
        data_type = strings(metadata, 5)
        if data_type == 'Definitions.OnlinePromoCodeData':
            counters['promo'] += 1
        if data_type == 'Definitions.OnlineMessageData':
            counters['messages'] += 1
        if data_type != 'Definitions.IAPData':
            continue
        name = strings(entry, 1)
        payload = fields(one(metadata, 6))
        package_key = strings(payload, 1)
        if not (name and package_key and package_key not in keys):
            raise ValueError('DUPLICATE_OR_MISSING_IAP_ID')
        keys.add(package_key)
        extended = one(payload, 10)
        direct = item_rewards(payload, 9)
        additional = item_rewards(fields(extended), 3) if extended is not None else []
        nested = strings(payload, 11)
        flags = [bool(one(payload, field)) for field in (15, 16, 21)]
        iap_type = one(payload, 5) or 0
        if not isinstance(iap_type, int) or not 0 <= iap_type <= 4:
            raise ValueError('IAP_TYPE')
        packages.append([
            name, package_key, iap_type, strings(payload, 6),
            strings(payload, 8), nested, *flags, direct, additional
        ])
        counters['direct'] += len(direct)
        counters['extended'] += len(additional)
        counters['nested'] += nested is not None
        all_item_ids.update(x[0] for x in direct + additional)
    if (len(packages), counters['direct'], counters['extended'],
        len(all_item_ids), counters['nested'], counters['promo'], counters['messages']
        ) != (53, 150, 141, 158, 3, 0, 0):
        raise ValueError('IAP_SOURCE_CENSUS')
    return {
        'schema': SCHEMA,
        'target': {'platform': 'Steam', 'gameVersion': '1.26.2'},
        'source': {
            'originalSourceGameVersion': '1.26.1',
            'originalFileEquivalentTo1262': True,
            'originalProtoDbSha256': PROTO_SHA,
            'originalProtoDbBytes': PROTO_BYTES,
            'originalIl2CppGameVersion': '1.26.1',
            'sourceFile': 'StreamingAssets/protoDb.bin',
            'sourceSchema': 'Definitions.IAPData',
            'checkedOn': '2026-11-23',
            'staticallyConfiguredOnly': True,
            'currentStorefrontAvailabilityVerified': False,
            'accountEntitlementVerified': False,
            'onlineMessageDefinitionsIncluded': False,
            'onlinePromoCodeDefinitionsIncluded': False,
            'nestedRewardExpansionVerified': False
        },
        'coverage': {
            'recordEnvelopes': EXPECTED_RECORDS, 'iapPackages': 53,
            'directRewards': counters['direct'],
            'extendedRewards': counters['extended'],
            'totalRewardRelations': counters['direct'] + counters['extended'],
            'distinctRewardItemIds': len(all_item_ids),
            'nestedPackageReferences': counters['nested'],
            'embeddedPromoCodeRecords': counters['promo'],
            'embeddedOnlineMessageRecords': counters['messages']
        },
        'packages': packages
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('original', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = make_projection(args.original.read_bytes())
    encoded = json.dumps(result, ensure_ascii=False, sort_keys=True,
                         separators=(',', ':')).encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encoded)
    print('projection bytes:', len(encoded))
    print('projection sha256:', hashlib.sha256(encoded).hexdigest())


if __name__ == '__main__':
    main()
