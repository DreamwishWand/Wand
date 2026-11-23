#!/usr/bin/env python3
"""Reproduce the *candidate-only* Steam 1.26.2 native LootTable projection.

Inputs are original ddv_Data/StreamingAssets/itemlist/LootTable.json bytes.
No private SRC-02 r5 archive, private Save, player ownership or server data is
read. Group entries cannot establish actual acquisition or guaranteed drops.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from acquisition import parse_loot, PINNED

ORIGINAL_SHA="580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c"
PUBLIC_SHA="fba1d8163c30156941b108ce2ba37544f32e9c7d419f4c2b1f126b017c470a00"
PUBLIC_SIZE=77385

def check(ok:bool,code:str)->None:
    if not ok:raise ValueError("DB02_PUBLIC_LOOT_"+code)

def generate(source:Path)->bytes:
    raw=source.read_bytes()
    check(PINNED["loot"]==ORIGINAL_SHA,"PARSER_SOURCE_PIN")
    check(len(raw)==110133 and hashlib.sha256(raw).hexdigest()==ORIGINAL_SHA,
          "ORIGINAL_SOURCE_PIN")
    native_tables,candidates=parse_loot(raw)
    check(len(native_tables)==960 and len(candidates)==3804,"SOURCE_CENSUS")
    rows=[]
    item_ids=set()
    groups=empty=direct=conditional=dynamic=eligibility=0
    for table in native_tables:
        group_rows=[]
        for group in table["groups"]:
            flags=(1 if group["hasDynamicTypeFilters"] else 0)|(
                2 if group["eligibilityDigest"] is not None else 0)
            if flags&1:dynamic+=1
            if flags&2:eligibility+=1
            entries=[]
            for entry in group["candidates"]:
                item_id=entry["itemId"]
                check(type(item_id) is int and item_id>0,"CANDIDATE_ID")
                is_conditional=entry["conditionDigest"] is not None
                if is_conditional:conditional+=1
                else:direct+=1
                entries.append([item_id,1 if is_conditional else 0])
                item_ids.add(item_id)
            if not entries:empty+=1
            group_rows.append([flags,entries])
            groups+=1
        rows.append([table["lootTableId"],group_rows])
    rows.sort(key=lambda table:table[0])
    check(len({row[0] for row in rows})==960 and groups==2087 and
          empty==198 and direct==3744 and conditional==60 and
          dynamic==163 and eligibility==11 and len(item_ids)==1100,
          "SOURCE_RELATION_COUNTS")
    projection={
        "schema":"wand.db02.public-native-loot-candidates@1",
        "target":{"platform":"Steam","gameVersion":"1.26.2"},
        "source":{"file":"ddv_Data/StreamingAssets/itemlist/LootTable.json",
                  "sha256":ORIGINAL_SHA,"bytes":110133},
        "coverage":{
            "nativeTables":960,"nativeGroups":2087,
            "groupsWithoutExplicitItems":198,"candidateRelations":3804,
            "distinctCandidateItemIds":1100,
            "unconditionalEntryReferences":3744,
            "conditionalEntryReferences":60,"dynamicFilterGroups":163,
            "eligibilityGateGroups":11,
            "actualAcquisitionContextsVerified":0,
            "guaranteedDropsVerified":0,
            "liveAvailabilityVerified":False,
            "playerOwnershipVerified":False,
            "sourceCoverageComplete":False
        },
        "tables":rows
    }
    encoded=(json.dumps(projection,ensure_ascii=False,separators=(",",":"))+"\n").encode()
    check(len(encoded)==PUBLIC_SIZE and
          hashlib.sha256(encoded).hexdigest()==PUBLIC_SHA,
          "PUBLIC_PROJECTION_SHA")
    return encoded

def main()->None:
    p=argparse.ArgumentParser()
    p.add_argument("--loot-table",required=True,type=Path)
    p.add_argument("--output",required=True,type=Path)
    options=p.parse_args()
    result=generate(options.loot_table)
    options.output.parent.mkdir(parents=True,exist_ok=True)
    options.output.write_bytes(result)
    print(f"verified 3804 native candidates, 1100 Item IDs, SHA256={PUBLIC_SHA}")

if __name__=="__main__":
    main()
