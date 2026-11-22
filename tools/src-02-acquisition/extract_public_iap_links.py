"""Extract six static IAP pack references from original Steam protoDb.bin.

Offline only:
  python tools/src-02-acquisition/extract_public_iap_links.py protoDb.bin out.json

This does NOT expand nested rewards, authorize grants, verify ownership, or
establish live storefront eligibility. Original game bytes remain private.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

# Reuse the original protobuf wire parser and source SHA pins, not a new decoder.
from extract_public_iap import fields, one, strings, PROTO_SHA, PROTO_BYTES, EXPECTED_RECORDS

SCHEMA = 'wand.db02.public-iap-pack-references@1'
EXPECTED = (
    ('Expansion2PackMagicalEdition', 'additional_pack', 'Expansion2PackExpansionPass', (9,), ()),
    ('Expansion3PackDeluxeEdition', 'additional_pack', 'Expansion3PackExpansionPass', (9,), ()),
    ('Expansion4PackDeluxeEdition', 'additional_pack', 'Expansion4PackExpansionPass', (9,), ()),
    ('FoundersPackDeluxe', 'nested_rewards', 'FoundersPackBaseGame', (), ()),
    ('FoundersPackUltimate', 'nested_rewards', 'FoundersPackDeluxe', (), ()),
    ('NintendoPOSAJP', 'nested_rewards', 'FoundersPackBaseGame', (), ()),
)


def packed_uint(data: bytes) -> list[int]:
    numbers = []
    pos = 0
    while pos < len(data):
        result = 0
        shift = 0
        while pos < len(data) and shift < 64:
            byte = data[pos]
            pos += 1
            result |= (byte & 127) << shift
            if byte < 128:
                numbers.append(result)
                break
            shift += 7
        else:
            raise ValueError('MALFORMED_MARKETPLACE_ENUM')
    return numbers


def marketplaces(rows: list, field: int) -> list[int]:
    result = []
    for tag, wire, value in rows:
        if tag != field:
            continue
        if wire == 0 and isinstance(value, int):
            result.append(value)
        elif wire == 2 and isinstance(value, bytes):
            result.extend(packed_uint(value))
        else:
            raise ValueError('MARKETPLACE_WIRE')
    return result


def make_projection(original: bytes) -> dict:
    if len(original) != PROTO_BYTES or hashlib.sha256(original).hexdigest() != PROTO_SHA:
        raise ValueError('ORIGINAL_PROTO_PIN')
    records = fields(original)
    if len(records) != EXPECTED_RECORDS:
        raise ValueError('ORIGINAL_ENVELOPE_COUNT')
    keys = set()
    relations = []
    for field, wire, blob in records:
        if field != 1 or wire != 2 or not isinstance(blob, bytes):
            raise ValueError('SOURCE_ENVELOPE')
        entry = fields(blob)
        metadata_blob = one(entry, 2)
        if not isinstance(metadata_blob, bytes):
            raise ValueError('SOURCE_METADATA')
        metadata = fields(metadata_blob)
        if strings(metadata, 5) != 'Definitions.IAPData':
            continue
        data = one(metadata, 6)
        if not isinstance(data, bytes):
            raise ValueError('MISSING_IAP_PAYLOAD')
        payload = fields(data)
        package_id = strings(payload, 1)
        if not package_id or package_id in keys:
            raise ValueError('DUPLICATE_IAP_KEY')
        keys.add(package_id)
        nested = strings(payload, 11)
        if nested:
            relations.append([package_id, 'nested_rewards', nested, [], []])
        for tag, wire, part in payload:
            if tag != 19:
                continue
            if wire != 2 or not isinstance(part, bytes):
                raise ValueError('ADDITIONAL_PACK_WIRE')
            additional = fields(part)
            target = strings(additional, 1)
            if not target:
                raise ValueError('ADDITIONAL_PACK_ID')
            relations.append([
                package_id, 'additional_pack', target,
                marketplaces(additional, 2), marketplaces(additional, 3)
            ])
    relations.sort(key=lambda row: (row[0], row[1], row[2]))
    identity = tuple((r[0], r[1], r[2], tuple(r[3]), tuple(r[4])) for r in relations)
    if len(keys) != 53 or identity != EXPECTED:
        raise ValueError('SOURCE_IAP_LINK_CENSUS')
    if any(row[2] not in keys or row[0] == row[2] for row in relations):
        raise ValueError('MISSING_PACK_TARGET')
    return {
        'schema': SCHEMA,
        'target': {'platform': 'Steam', 'gameVersion': '1.26.2'},
        'source': {
            'originalSourceGameVersion': '1.26.1',
            'originalFileEquivalentTo1262': True,
            'originalProtoDbSha256': PROTO_SHA,
            'originalProtoDbBytes': PROTO_BYTES,
            'sourceFile': 'StreamingAssets/protoDb.bin',
            'sourceRecordType': 'Definitions.IAPData',
            'il2cppSchemaGameVersion': '1.26.1',
            'checkedOn': '2026-11-23',
            'nestedRewardsField': 11,
            'additionalIapPacksField': 19,
            'additionalPackIdField': 1,
            'supportedMarketplaceField': 2,
            'unsupportedMarketplaceField': 3,
            'marketplaceEnum9': 'AppleAppStore',
            'accountEntitlementVerified': False,
            'nestedRewardGrantVerified': False,
            'additionalPackGrantVerified': False,
            'currentStorefrontAvailabilityVerified': False,
        },
        'coverage': {
            'recordEnvelopes': EXPECTED_RECORDS,
            'nativeIapPackages': len(keys),
            'nativeNestedReferences': 3,
            'nativeAdditionalReferences': 3,
            'appleAppStoreOnlyAdditionalReferences': 3,
            'totalPackReferences': len(relations),
            'danglingPackReferences': 0,
            'onlineRewardGrantsVerified': 0,
        },
        'relations': relations,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('original', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    doc = make_projection(args.original.read_bytes())
    raw = json.dumps(doc, ensure_ascii=False, sort_keys=True,
                     separators=(',', ':')).encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(raw)
    print('bytes', len(raw), 'sha256', hashlib.sha256(raw).hexdigest())


if __name__ == '__main__':
    main()
