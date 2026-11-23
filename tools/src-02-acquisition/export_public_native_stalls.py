#!/usr/bin/env python3
"""Reproduce the public Steam v1.26.2 stall -> slot -> LootTable index.

Only original itemlist/Building.json and itemlist/LootTable.json are read.
The owner-private SRC-02 r5 bundle, game saves, live ShopData, current prices,
stock and entitlement data MUST NOT be read or published.

SlotLootTableItemID is an exact, ordered source reference. It is NOT proof
that a particular Item is currently sold, purchasable or unlocked.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from acquisition import frames,parse_loot,parse_stall_sources,PINNED

BUILDING_SHA="e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0"
LOOT_SHA="580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c"
PUBLIC_SHA="ef18e94df460d7bd5c768ebc720c48425570ac549a49ebdac00ade34e5468d2a"
PUBLIC_BYTES=8775

def require(ok:bool,code:str)->None:
    if not ok:raise ValueError("DB02_PUBLIC_STALL_"+code)

def original(path:Path,size:int,digest:str)->bytes:
    raw=path.read_bytes()
    require(len(raw)==size and hashlib.sha256(raw).hexdigest()==digest,
            "ORIGINAL_SOURCE_PIN")
    return raw

def generate(building:Path,loot:Path)->bytes:
    require(PINNED["building"]==BUILDING_SHA and PINNED["loot"]==LOOT_SHA,
            "EXTRACTOR_SOURCE_PIN")
    buildings=original(building,531572,BUILDING_SHA)
    lootbytes=original(loot,110133,LOOT_SHA)
    tables,candidates=parse_loot(lootbytes)
    require(len(tables)==960 and len(candidates)==3804,"LOOT_SOURCE_CENSUS")
    table_map={row["lootTableId"]:row for row in tables}
    require(len(table_map)==960,"LOOT_TABLE_IDS")
    native_stalls=parse_stall_sources(buildings,set(table_map))
    require(len(list(frames(buildings,20000000)))==478 and
            len(native_stalls)==65,"BUILDING_SOURCE_CENSUS")
    rows=[]
    referenced_tables=set()
    item_ids=set()
    stall_item_pairs=set()
    stall_table_item_triples=set()
    count=0
    conditional=0
    for stall in native_stalls:
        stall_id=stall["stallId"]
        name=stall["nameKey"]
        shop=stall["shopDataKey"]
        table_ids=stall["slotLootTableIds"]
        require(bool(name) and bool(shop) and len(table_ids)>0,
                "INCOMPLETE_STALL")
        rows.append([stall_id,name,shop,table_ids])
        for table_id in table_ids:
            referenced_tables.add(table_id)
            for group in table_map[table_id]["groups"]:
                for candidate in group["candidates"]:
                    item_id=candidate["itemId"]
                    count+=1
                    conditional+=candidate["conditionDigest"] is not None
                    item_ids.add(item_id)
                    stall_item_pairs.add((stall_id,item_id))
                    stall_table_item_triples.add((stall_id,table_id,item_id))
    rows.sort(key=lambda x:x[0])
    require(len({row[0] for row in rows})==65 and
            sum(len(row[3]) for row in rows)==335 and
            len(referenced_tables)==279 and count==1385 and
            len(item_ids)==606 and len(stall_item_pairs)==745 and
            len(stall_table_item_triples)==1173 and conditional==0,
            "SLOT_SOURCE_CENSUS")
    payload={
        "schema":"wand.db02.public-native-stall-slots@1",
        "target":{"platform":"Steam","gameVersion":"1.26.2"},
        "sources":{
            "building":{
                "file":"ddv_Data/StreamingAssets/itemlist/Building.json",
                "sha256":BUILDING_SHA,"bytes":531572
            },
            "loot":{
                "file":"ddv_Data/StreamingAssets/itemlist/LootTable.json",
                "sha256":LOOT_SHA,"bytes":110133
            }
        },
        "coverage":{
            "nativeBuildingDefinitions":478,
            "staticStallDefinitions":65,
            "slotLootTableReferences":335,
            "distinctReferencedLootTableIds":279,
            "slotExpandedCandidateRelations":1385,
            "distinctCandidateItemIds":606,
            "distinctStallItemPairs":745,
            "distinctStallTableItemTriples":1173,
            "conditionalCandidateRelations":0,
            "liveShopStockVerified":False,
            "livePurchasePriceVerified":False,
            "purchasabilityVerified":False,
            "playerUnlockVerified":False,
            "staticStorePoolOnly":True
        },
        "stalls":rows
    }
    projection=(json.dumps(payload,ensure_ascii=False,separators=(",",":"))+"\n").encode()
    require(len(projection)==PUBLIC_BYTES and
            hashlib.sha256(projection).hexdigest()==PUBLIC_SHA,
            "PUBLIC_PROJECTION_SHA")
    return projection

def main()->None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--building",required=True,type=Path)
    parser.add_argument("--loot-table",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    options=parser.parse_args()
    projection=generate(options.building,options.loot_table)
    options.output.parent.mkdir(parents=True,exist_ok=True)
    options.output.write_bytes(projection)
    print(f"verified 65 stalls, 335 slots, 606 candidate Item IDs; sha256={PUBLIC_SHA}")

if __name__=="__main__":
    main()
