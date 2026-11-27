#!/usr/bin/env python3
"""Verify immutable published Item objects in bounded batches; keep metadata, not bytes."""
import argparse
import hashlib
import json
from pathlib import Path
from verify_source_cdn import readback, KEY, check
from migrate_item_thumbnails_256 import BUCKET, POLICY, key
from concurrent.futures import ThreadPoolExecutor
from bundle_thumbnails import write_json

SCHEMA="wand.media.item-cdn-ledger@1"


def expected(index,receipt):
    check(index.get("schema")=="wand.media.item-index@256-v1" and index.get("thumbnailPolicy")==POLICY and
          receipt.get("schema")=="wand.media.item-256-publication-receipt@1" and
          receipt.get("bucket")==BUCKET and receipt.get("canonicalMetadataVerified") is True,
          "Expected canonical Item publication receipt")
    objects={}
    for sha,row in index["images"].items():
        k=key(sha)
        check(KEY.fullmatch(k) and row["sha256"]==sha and
              all(type(row.get(a)) is int and row[a]>0 for a in ("bytes","width","height")),
              "Invalid image metadata")
        objects[k]=row["bytes"]
    check(objects==receipt["objects"],"Index and canonical receipt differ")
    check({key(s) for pair in index["items"].values() for s in pair}==set(objects),"Incomplete index")
    return objects


def ledger_objects(doc):
    check(doc.get("schema")==SCHEMA and doc.get("bucket")==BUCKET and isinstance(doc.get("verified"),dict),
          "Invalid Item CDN ledger")
    check(all(KEY.fullmatch(k) and type(v) is int and v>0 for k,v in doc["verified"].items()),
          "Invalid verified object")
    return doc["verified"]


def batch(objects,prior,max_objects,max_bytes,reader=readback):
    verified=dict(prior)
    pending=[]
    size=0
    for k,n in sorted(objects.items()):
        if k in verified:
            check(verified[k]==n,"Historical object size conflict")
            continue
        if len(pending)>=max_objects or size+n>max_bytes:
            continue
        pending.append((k,n));size+=n
    errors={}
    for k,n,error in map(reader,pending):
        check((k,n) in pending,"Unexpected readback result")
        if error:errors[k]=error
        else:verified[k]=n
    return verified,errors,len(pending),size


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--index",type=Path,required=True)
    p.add_argument("--receipt",type=Path,required=True)
    p.add_argument("--ledger",type=Path,required=True)
    p.add_argument("--max-objects",type=int,default=1000)
    p.add_argument("--max-bytes",type=int,default=100000000)
    a=p.parse_args()
    check(0<a.max_objects<=2000 and 0<a.max_bytes<=500000000,"Read budget exceeded")
    index=json.loads(a.index.read_bytes());receipt=json.loads(a.receipt.read_bytes())
    objects=expected(index,receipt)
    prior=ledger_objects(json.loads(a.ledger.read_bytes())) if a.ledger.exists() else {}
    print("Missing CDN witnesses:",len(set(objects)-set(prior)),"; bounded read only, no writes to R2.")
    if input("Type VERIFY: ")!="VERIFY":return
    verified,errors,count,size=batch(objects,prior,a.max_objects,a.max_bytes)
    write_json(a.ledger,{"schema":SCHEMA,"bucket":BUCKET,"verified":verified})
    print(json.dumps({"checked":count,"expectedBytes":size,"remaining":len(set(objects)-set(verified)),"errors":errors},indent=2))

if __name__=="__main__":main()
