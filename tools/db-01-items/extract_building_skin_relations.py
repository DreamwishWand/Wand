#!/usr/bin/env python3
"""Extract exact building-skin target selectors from Steam 1.26.2 originals.
Re-review field declarations before regenerating from a changed source corpus.
Only ID/selector facts are emitted, never game assets or original bytes.
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-02-acquisition'))
from acquisition import frames, ids, single

PINS = {
    'Building': 'e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0',
    'Character': 'da6794c66a801a1de43a6ac7b7b79d77a663661f3226bc51a249092632777f0f',
    'Tag': 'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4',
    'Skin': 'c557b76c8a762afb3d6cdd66e9c6ced22e7d863ff3dc7426f8f9aff3939e6371',
}
DUMP_SHA = '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
CLASSES = {
    1701: ('StallSkinItemData', {'AllStallsWithEmployeeItems': 19, 'StallItemsIDs': 20, 'StallEmployeeItemsIDs': 21}),
    1702: ('BuildingOtherSkinItemData', {'OtherItemsIDs': 6, 'AllWellsItemsExcept': 19, 'ExceptItemsIDs': 20}),
    1706: ('HouseSkinItemData', {'HouseItemID': 6}),
}

def require(value, reason):
    if not value:
        raise ValueError('DB01_BUILDING_SKIN_' + reason)

def extract(root, dump_path):
    raw = {k: (root / (k + '.json')).read_bytes() for k in PINS}
    require(all(hashlib.sha256(b).hexdigest() == PINS[k] for k,b in raw.items()), 'SOURCE_SHA')
    dump = dump_path.read_bytes()
    require(hashlib.sha256(dump).hexdigest() == DUMP_SHA, 'DUMP_SHA')
    text = dump.decode('utf-8')
    for _, (cls, declared) in CLASSES.items():
        m = re.search(r'^public sealed class ' + cls + r'\b[^\n]*\n\{', text, re.M)
        require(m is not None, 'CLASS_' + cls)
        body = text[m.end():text.index('\n}', m.end())]
        actual = {k:int(v) for k,v in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
        require(all(actual.get(k) == v for k,v in declared.items()), 'FIELD_' + cls)
    buildings = dict(frames(raw['Building'], 20000000))
    characters = dict(frames(raw['Character'], 10000000))
    tags = dict(frames(raw['Tag'], 2000000000))
    skins = dict(frames(raw['Skin'], 170000000))
    require((len(buildings),len(characters),len(tags),len(skins)) == (478,142,409,163), 'CENSUS')
    rows = []
    coverage = {}
    for i,f in sorted(skins.items()):
        band = i // 100000
        if band not in CLASSES:
            continue
        cls = CLASSES[band][0]
        coverage[cls] = coverage.get(cls,0) + 1
        if band == 1706:
            target = single(f,6,0,True)
            require(target in buildings and target // 100000 == 200,'HOUSE')
            rows.append([i,[target]])
        else:
            targets = ids(f,20 if band == 1701 else 6)
            secondary = ids(f,21 if band == 1701 else 20)
            flag = single(f,19,0)
            require(flag in (None,0,1) and all(t in buildings for t in targets),'TARGET')
            require(all(t in characters for t in secondary) if band == 1701 else
                    all(t in buildings for t in secondary), 'SECONDARY')
            rows.append([i,targets,secondary,[] if flag is None else [flag]])
    require(coverage == {'StallSkinItemData':15,'BuildingOtherSkinItemData':32,'HouseSkinItemData':12}, 'SUBTYPES')
    return {'schema':'wand.db01.building-skin-relations@1',
            'target':{'platform':'Steam','gameVersion':'1.26.2'},'sourceFiles':PINS,
            'sourceIl2cppDumpSha256':DUMP_SHA,'coverage':coverage,'rows':rows}

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--itemlist',type=Path,required=True)
    p.add_argument('--il2cpp-dump',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a = p.parse_args()
    a.output.write_bytes((json.dumps(extract(a.itemlist,a.il2cpp_dump),separators=(',',':'))+'\n').encode())
