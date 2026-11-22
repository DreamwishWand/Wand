"""Extract source-exact static container templates from the original Steam protoDb.

Offline, read-only:
  python tools/src-02-acquisition/extract_public_container_inventory.py protoDb.bin output.json

The original Steam 1.26.1 protoDb.bin is SHA-verified and byte-equivalent to
Steam 1.26.2. Only static template/slot ID/quantity records are exported.
No personal save, state bytes, ownership, guaranteed loot, or live spawn.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from extract_public_iap import fields, one, strings, PROTO_SHA, PROTO_BYTES, EXPECTED_RECORDS

SCHEMA = 'wand.db02.static-container-contents@1'
TYPE = 'Meta.ContainerInventory'
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,100}$')


def projection(original: bytes) -> dict:
    if len(original) != PROTO_BYTES or hashlib.sha256(original).hexdigest() != PROTO_SHA:
        raise ValueError('ORIGINAL_PROTO_SHA')
    records = fields(original)
    if len(records) != EXPECTED_RECORDS:
        raise ValueError('ORIGINAL_RECORD_CENSUS')
    containers = []
    seen = set()
    item_ids = set()
    source_slots = 0
    blank_slots = 0
    populated_templates = 0
    for field, wire, rec in records:
        if field != 1 or wire != 2 or not isinstance(rec, bytes):
            raise ValueError('ORIGINAL_RECORD_ENVELOPE')
        entry = fields(rec)
        meta = one(entry, 2)
        if not isinstance(meta, bytes):
            raise ValueError('ORIGINAL_RECORD_METADATA')
        metadata = fields(meta)
        if strings(metadata, 5) != TYPE:
            continue
        name = strings(entry, 1)
        if not isinstance(name, str) or not NAME.fullmatch(name) or name in seen:
            raise ValueError('INVALID_CONTAINER_TEMPLATE')
        seen.add(name)
        encoded = one(metadata, 6)
        if not isinstance(encoded, bytes):
            raise ValueError('MISSING_CONTAINER_PAYLOAD')
        rows = fields(encoded)
        slots = []
        source_slot_index = 0
        for number, wt, value in rows:
            if number != 3:
                continue
            if wt != 2 or not isinstance(value, bytes):
                raise ValueError('INVALID_CONTAINER_SLOT')
            source_slots += 1
            slot = fields(value)
            item_id, amount = one(slot, 1), one(slot, 2)
            if item_id is None and amount is None:
                if slot:
                    raise ValueError('MALFORMED_BLANK_SLOT')
                blank_slots += 1
            else:
                if not (isinstance(item_id, int) and not isinstance(item_id, bool)
                        and 0 < item_id <= 9_007_199_254_740_991
                        and isinstance(amount, int) and not isinstance(amount, bool)
                        and 0 < amount <= 2_147_483_647):
                    raise ValueError('INVALID_SOURCE_ITEM_AMOUNT')
                slots.append([source_slot_index, str(item_id), amount])
                item_ids.add(str(item_id))
            source_slot_index += 1
        populated_templates += bool(slots)
        containers.append([name, slots])
    if (len(containers), populated_templates, source_slots,
            source_slots-blank_slots, blank_slots, len(item_ids)) != (
            88, 84, 147, 146, 1, 115):
        raise ValueError('SOURCE_TEMPLATE_CENSUS')
    return {
        'schema': SCHEMA,
        'target': {'platform': 'Steam', 'gameVersion': '1.26.2'},
        'source': {
            'originalSourceGameVersion': '1.26.1',
            'originalFileEquivalentTo1262': True,
            'originalProtoDbSha256': PROTO_SHA,
            'originalProtoDbBytes': PROTO_BYTES,
            'originalFile': 'StreamingAssets/protoDb.bin',
            'originalRecordType': TYPE,
            'originalSlotType': 'Meta.ContainerInventory.Types.Slot',
            'slotListField': 3, 'slotItemIdField': 1, 'slotAmountField': 2,
            'checkedOn': '2026-11-23',
            'liveContentsVerified': False,
            'containerSpawnVerified': False,
            'guaranteedLootVerified': False,
            'personalSaveContentsIncluded': False,
        },
        'coverage': {
            'definitionRecords': len(containers),
            'populatedDefinitions': populated_templates,
            'totalSourceSlots': source_slots,
            'populatedSourceSlots': source_slots - blank_slots,
            'blankSourceSlots': blank_slots,
            'distinctItemIds': len(item_ids),
            'liveContentsVerified': False,
            'guaranteedLootVerified': False,
        },
        'containers': containers,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('original', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    doc = projection(args.original.read_bytes())
    raw = json.dumps(doc, ensure_ascii=False, sort_keys=True,
                     separators=(',', ':')).encode('utf-8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(raw)
    print('bytes:', len(raw), 'sha256:', hashlib.sha256(raw).hexdigest())


if __name__ == '__main__':
    main()
