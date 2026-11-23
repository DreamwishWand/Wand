#!/usr/bin/env python3
"""Export exact original LootTable.nameKey labels, not gameplay categories.

Reads only pinned Steam 1.26.2 itemlist/LootTable.json. Produces a minimal
public ID->native name key projection with no raw game file, owner-private r5
snapshot, player save, localized names, live drops or shop prices.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from acquisition import PINNED,parse_loot

ORIGINAL_SHA="580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c"
OUTPUT_SHA="77c44c7fa40fb153e9fcbcc7ec8ba6d123069d9ef7090330d05b4d235e8bfc54"
OUTPUT_BYTES=51378

def check(value:bool,reason:str)->None:
    if not value:
        raise ValueError("DB02_NATIVE_LOOT_NAMES_"+reason)

def generate(source:Path)->bytes:
    data=source.read_bytes()
    check(PINNED["loot"]==ORIGINAL_SHA,"EXTRACTOR_PIN")
    check(len(data)==110133 and hashlib.sha256(data).hexdigest()==ORIGINAL_SHA,
          "ORIGINAL_SOURCE_PIN")
    native,candidates=parse_loot(data)
    check(len(native)==960 and len(candidates)==3804,"ORIGINAL_LOOT_CENSUS")
    rows=sorted([[r["lootTableId"],r["nameKey"]] for r in native],
                key=lambda r:r[0])
    unique={r[1] for r in rows}
    families={r[1].split("!",1)[0] for r in rows}
    check(len({r[0] for r in rows})==960 and len(unique)==960 and
          len(families)==28,"ORIGINAL_NAME_CENSUS")
    result={
        "schema":"wand.db02.public-native-loot-name-keys@1",
        "target":{"platform":"Steam","gameVersion":"1.26.2"},
        "source":{
            "file":"ddv_Data/StreamingAssets/itemlist/LootTable.json",
            "sha256":ORIGINAL_SHA,"bytes":110133
        },
        "coverage":{
            "nativeLootTables":960,
            "uniqueNativeNameKeys":960,
            "nativeSourceFamilies":28,
            "nativeNameOnlyNotGameplayContext":True,
            "localizedDisplayNamesVerified":False,
            "actualAcquisitionContextVerified":False,
            "guaranteedDropsVerified":False
        },
        "tableNames":rows
    }
    payload=(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n").encode()
    check(len(payload)==OUTPUT_BYTES and
          hashlib.sha256(payload).hexdigest()==OUTPUT_SHA,
          "PUBLIC_NAME_PROJECTION_SHA")
    return payload

def main()->None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--loot-table",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=generate(args.loot_table)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(result)
    print(f"verified 960 original name keys, 28 native families; sha256={OUTPUT_SHA}")

if __name__=="__main__":
    main()
