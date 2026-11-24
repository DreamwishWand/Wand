#!/usr/bin/env python3
"""Reproduce the source-backed stall relation projection, without raw assets.

The reviewed field contract is StallBuildingItemData fields 7/11 and
CharacterItemData.Tags field 12. Re-review that contract against the new
version's declarations before using this extractor on changed source files.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-02-acquisition'))
from acquisition import frames, ids, single

PINS = {
    'Building': 'e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0',
    'Character': 'da6794c66a801a1de43a6ac7b7b79d77a663661f3226bc51a249092632777f0f',
    'Tag': 'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4',
}

def require(value, code):
    if not value:
        raise ValueError('DB01_STALL_SOURCE_' + code)

def extract(root):
    originals = {k: (root / (k + '.json')).read_bytes() for k in PINS}
    require(all(hashlib.sha256(b).hexdigest() == PINS[k]
                for k, b in originals.items()), 'SOURCE_SHA')
    buildings = list(frames(originals['Building'], 20000000))
    characters = dict(frames(originals['Character'], 10000000))
    tags = dict(frames(originals['Tag'], 2000000000))
    require(len(buildings) == 478 and len(characters) == 142 and len(tags) == 409,
            'ORIGINAL_CENSUS')
    rows = []
    for item_id, fields in sorted(buildings):
        if not 20100000 <= item_id < 20200000:
            continue
        employee = ids(fields, 7)
        unlock = single(fields, 11, 0)
        require(all(c == 0 or c in characters for c in employee), 'EMPLOYEE')
        require(unlock is None or unlock in characters, 'UNLOCK')
        for c in set(employee + ([unlock] if unlock is not None else [])) - {0}:
            require(all(t in tags for t in ids(characters[c], 12)), 'CHARACTER_TAGS')
        rows.append([item_id, employee, unlock])
    coverage = {
        'buildingDefinitions': len(buildings), 'stallDefinitions': len(rows),
        'employeeLinked': sum(any(e) for _, e, _ in rows),
        'unlockLinked': sum(u in characters for _, _, u in rows),
        'characterLinked': sum(any(e) or u in characters for _, e, u in rows),
    }
    require(list(coverage.values()) == [478, 90, 56, 5, 58], 'RELATION_CENSUS')
    return {
        'schema': 'wand.db01.stall-character-source@1',
        'target': {'platform': 'Steam', 'gameVersion': '1.26.2'},
        'sourceFiles': PINS,
        'fieldContract': {'nativeClass': 'StallBuildingItemData', 'employeeField': 7,
                          'unlockField': 11, 'characterTagField': 12},
        'coverage': coverage, 'rows': rows,
    }

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--itemlist', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    a.output.write_bytes((json.dumps(extract(a.itemlist), separators=(',', ':')) + '\n').encode())
