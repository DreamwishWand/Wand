#!/usr/bin/env python3
"""Reproduce compact verified Steam v1.26.2 native acquisition paths.

Reads only the original ActivityData.json / ActivityItem.json game files, not
private SRC-02 r5 snapshots, player saves or current online inventories.
The path exists in game definitions; actual drop/harvest is not guaranteed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from acquisition import parse_activity, parse_gardening, PINNED

ACTIVITY_SHA="2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296"
ITEM_SHA="4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2"
PUBLIC_SHA="97d02a35dbe78dab637f4eda7d6fdf61cf528bb77aab6f684483a5cf542eebbb"

def require(ok:bool,code:str)->None:
    if not ok:raise ValueError("DB02_PUBLIC_ACTIVITY_"+code)

def verify(path:Path,expected_size:int,digest:str)->bytes:
    value=path.read_bytes()
    require(len(value)==expected_size and hashlib.sha256(value).hexdigest()==digest,
            "ORIGINAL_SOURCE_PIN")
    return value

def normalized_seconds(value:float|int|None)->float|int|None:
    return int(value) if value is not None and value==int(value) else value

def output(activity:Path,activity_item:Path)->bytes:
    require(PINNED["activity"]==ACTIVITY_SHA and
            PINNED["activity_item"]==ITEM_SHA,"PARSER_PIN")
    a=verify(activity,260627,ACTIVITY_SHA)
    b=verify(activity_item,1339476,ITEM_SHA)
    recipes, paths, other=parse_activity(a)
    require(len(recipes)==1943 and len(paths)==663 and len(other)==24,
            "ACTIVITY_CENSUS")
    growing=parse_gardening(b)
    require(len(growing)==100,"GROWING_CENSUS")
    rows=[]
    for row in paths:
        method=row["type"]
        definition=row["definitionId"]
        result=row["itemId"]
        if method=="fishing":
            code=0
            args=[row["areaIds"],row["rarity"]]
        elif method=="mining":
            code=1
            args=[row["areaId"],row["sceneId"],row["rarity"]]
        elif method=="timebending":
            code=2
            locations=[[p["areaId"],p["sceneId"]] for p in row["locations"]]
            interval=row["minMax"]
            amount_range=None if interval is None else [interval["min"],interval["max"]]
            args=[locations,row["minHourglassLevel"],amount_range]
        else:raise ValueError("DB02_PUBLIC_ACTIVITY_UNSUPPORTED_PATH")
        rows.append([definition,code,result,row.get("amount"),args])
    for row in growing:
        definition=row["seedItemId"]
        args=[definition,normalized_seconds(row["growthSeconds"]),row["villageAreaIds"]]
        rows.append([definition,3,row["itemId"],row["producedAmount"],args])
    rows.sort(key=lambda x:x[0])
    require(len(rows)==763 and len({x[0] for x in rows})==763 and
            len({x[2] for x in rows})==489,"RELATIONS_CENSUS")
    require([sum(x[1]==k for x in rows) for k in range(4)]==[282,299,82,100],
            "PATH_TYPES")
    data={
        "schema":"wand.db02.native-activity-results@1",
        "target":{"platform":"Steam","gameVersion":"1.26.2"},
        "sources":{
            "activityData":{"file":"ddv_Data/StreamingAssets/itemlist/ActivityData.json",
                            "sha256":ACTIVITY_SHA,"bytes":260627},
            "activityItem":{"file":"ddv_Data/StreamingAssets/itemlist/ActivityItem.json",
                            "sha256":ITEM_SHA,"bytes":1339476}
        },
        "encoding":{"0":"fishing","1":"mining","2":"timebending","3":"growing"},
        "coverage":{
            "activityDataDefinitions":2630,"activityItemDefinitions":4050,
            "nativeResultPaths":763,"fishingPaths":282,"miningPaths":299,
            "timebendingPaths":82,"growingPaths":100,"distinctResultItemIds":489,
            "contextAvailabilityVerified":False,"playerUnlockVerified":False,
            "staticPathsNotGuaranteedDrops":True,"allAcquisitionRoutesCovered":False
        },
        "paths":rows
    }
    payload=(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n").encode()
    require(len(payload)==34299 and hashlib.sha256(payload).hexdigest()==PUBLIC_SHA,
            "PUBLIC_BYTE_PIN")
    return payload

def main()->None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--activity-data",required=True,type=Path)
    parser.add_argument("--activity-item",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    args=parser.parse_args()
    value=output(args.activity_data,args.activity_item)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(value)
    print(f"verified {len(value)} bytes; 763 path relations; sha256={PUBLIC_SHA}")

if __name__=="__main__":
    main()
