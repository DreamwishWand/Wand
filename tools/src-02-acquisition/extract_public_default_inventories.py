"""Offline source-exact static default-inventory Item ID projection (Steam 1.26.2).

  python tools/src-02-acquisition/extract_public_default_inventories.py \
    protoDb.bin static/acquisition/public/default-inventories-1.26.2.json

The source is original Steam 1.26.1 bytes independently confirmed identical
to 1.26.2. Only source-configured default Item IDs / amounts are published,
never personal saves or player state. Not a guaranteed starting reward list.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from extract_public_iap import fields, one, strings, PROTO_SHA, PROTO_BYTES, EXPECTED_RECORDS

SCHEMA = 'wand.db02.static-default-inventories@1'
SECTIONS = (
    'Backpack', 'HomeStorage', 'Catalog', 'Wardrobe', 'Pantry',
    'Makeup', 'Trimming', 'Buildings', 'Decals', 'Skins',
    'AvatarFeatures', 'Figurines', 'PhotoMode', 'MountGear', 'EnvironmentalFX',
)
EXPECTED_COUNTS = (0, 3, 4, 74, 0, 42, 8, 6, 90, 14, 25, 0, 12, 11, 0)


def positive_id(value: object) -> str:
    if not (isinstance(value, int) and not isinstance(value, bool)
            and 0 < value <= 9_007_199_254_740_991):
        raise ValueError('INVALID_OR_UNKNOWN_ITEM_ID')
    return str(value)


def make_projection(original: bytes) -> dict:
    if len(original) != PROTO_BYTES or hashlib.sha256(original).hexdigest() != PROTO_SHA:
        raise ValueError('SOURCE_SHA_MISMATCH')
    entries = fields(original)
    if len(entries) != EXPECTED_RECORDS:
        raise ValueError('SOURCE_ENVELOPE_CENSUS')
    matches = []
    for field, wire, payload in entries:
        if field != 1 or wire != 2 or not isinstance(payload, bytes):
            raise ValueError('SOURCE_ENVELOPE')
        record = fields(payload)
        meta_bytes = one(record, 2)
        if not isinstance(meta_bytes, bytes):
            raise ValueError('SOURCE_RECORD_METADATA')
        metadata = fields(meta_bytes)
        if strings(metadata, 5) != 'Meta.DefaultInventories':
            continue
        if strings(record, 1) != 'DefaultInventories':
            raise ValueError('DEFAULT_RECORD_NAME')
        raw = one(metadata, 6)
        if not isinstance(raw, bytes):
            raise ValueError('DEFAULT_RECORD_PAYLOAD')
        matches.append(fields(raw))
    if len(matches) != 1:
        raise ValueError('DEFAULT_RECORD_UNIQUENESS')
    raw_fields = matches[0]
    if len(raw_fields) != len(SECTIONS) or {f for f, _, _ in raw_fields} != set(range(1,16)):
        raise ValueError('DEFAULT_INVENTORY_SECTIONS')
    groups = []
    unique_ids = set()
    total = 0
    for field_no, section in enumerate(SECTIONS, 1):
        payload = one(raw_fields, field_no)
        if not isinstance(payload, bytes):
            raise ValueError('DEFAULT_INVENTORY_FIELD')
        data = fields(payload)
        subfield = 3 if field_no in (1,2) else 2
        kind = 'container' if field_no in (1,2) else 'list'
        observations = []
        seen_keys = set()
        for index, (key, wire, item_bytes) in enumerate(
                (f,w,v) for f,w,v in data if f == subfield):
            if wire != 2 or not isinstance(item_bytes,bytes):
                raise ValueError('DEFAULT_INVENTORY_ITEM_WIRE')
            item = fields(item_bytes)
            if kind == 'container':
                item_id = one(item,1)
                amount = one(item,2)
                if item_id is None and amount is None and not item:
                    continue
            else:
                item_id = one(item,1)
                value = one(item,2)
                if not isinstance(value, bytes):
                    raise ValueError('DEFAULT_LIST_VALUE')
                details = fields(value)
                amount = one(details,1)
                if one(details,2) is not None:
                    raise ValueError('UNEXPECTED_DEFAULT_ITEM_MARKER')
            id_str = positive_id(item_id)
            if not (isinstance(amount,int) and 0<amount<=2147483647):
                raise ValueError('DEFAULT_ITEM_AMOUNT')
            if kind == 'list':
                if id_str in seen_keys:
                    raise ValueError('DUPLICATE_MAP_ITEM_ID')
                seen_keys.add(id_str)
            observations.append([index,id_str,amount])
            unique_ids.add(id_str)
        if len(observations) != EXPECTED_COUNTS[field_no-1]:
            raise ValueError('DEFAULT_GROUP_CENSUS')
        groups.append([section,field_no,kind,observations])
        total += len(observations)
    if total != 289 or len(unique_ids) != 288:
        raise ValueError('DEFAULT_SOURCE_CENSUS')
    return {
        'schema': SCHEMA,
        'target': {'platform':'Steam','gameVersion':'1.26.2'},
        'source': {
            'originalProtoDbSha256':PROTO_SHA,
            'originalProtoDbBytes':PROTO_BYTES,
            'originalFile':'StreamingAssets/protoDb.bin',
            'sourceGameVersion':'1.26.1',
            'byteEquivalentToTargetVersion':True,
            'recordType':'Meta.DefaultInventories',
            'containerInventoryField':3,
            'listInventoryField':2,
            'listItemIdMapKeyField':1,
            'listValueField':2,
            'listAmountField':1,
            'checkedOn':'2026-11-23',
            'configuredDefaultsOnly':True,
            'playerInventoryVerified':False,
            'newPlayerGrantVerified':False,
            'onlineOwnershipVerified':False,
            'privateSaveIncluded':False
        },
        'coverage': {
            'groups':15,'configuredEntries':289,'distinctItemIds':288,
            'containerEntries':3,'listEntries':286,
            'playerInventoryVerified':False,
            'newPlayerGrantVerified':False,
            'sourceCoverageComplete':False
        },
        'groups':groups
    }


def main() -> None:
    cli = argparse.ArgumentParser()
    cli.add_argument('original',type=Path)
    cli.add_argument('output',type=Path)
    args=cli.parse_args()
    output=make_projection(args.original.read_bytes())
    encoded=json.dumps(output,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf8')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(encoded)
    print('bytes',len(encoded),'sha256',hashlib.sha256(encoded).hexdigest())


if __name__=='__main__':
    main()
