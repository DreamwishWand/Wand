#!/usr/bin/env python3
"""Incremental exact-GUID image extraction for confirmed common UI and Shop references."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from collections import Counter
from bundle_thumbnails import POLICY, MAX_EDGE, write_json
from extract_memory_sources import exact_objects, materialize, verify_game_version, manifests
from extract_story_puzzle_sources import local_image, thumbnail
from resolve_shop_catalog import resolve
from publish_bundle_thumbnails import BUCKET, key, info, check, census, publish
from publish_memory_sources import split
from publish_recovered_map_parts import client
from source_image_ledger import load, published, verify_local_or_published, require_pending, build
from item_cdn_ledger import batch

TARGET_SCHEMA="wand.media.confirmed-shared-image-targets@1"
REPORT_SCHEMA="wand.media.private-shared-image-sources@1"
INDEX_SCHEMA="wand.media.shared-image-index-candidate@1"
RECEIPT_SCHEMA="wand.media.shared-image-publication-receipt@1"


def targets(doc):
    check(doc.get("schema")==TARGET_SCHEMA and re.fullmatch(r"\d+\.\d+\.\d+",doc["gameVersion"]) and
          isinstance(doc["targets"],dict) and 0<len(doc["targets"])<=20000,"Invalid target scope")
    for guid,role in doc["targets"].items():
        check(re.fullmatch(r"[a-f0-9]{32}",guid) and role in ("ui-original","shop-512"),"Invalid confirmed reference")
    return doc["targets"]


def read_prior(path):
    return load(json.loads(path.read_bytes())) if path else None


def classify(previous,current):
    result={}
    for guid in sorted(set(previous)|set(current)):
        old=previous.get(guid);new=current.get(guid)
        if new is None:state="notReferenced"
        elif old is None:state="added"
        elif old==new:state="unchanged"
        else:state="changed"
        result[guid]=state
    return result


def extract(spec,aa,root,out,ledger=None,prior_index=None):
    roles=targets(spec)
    if prior_index is not None:
        check(prior_index.get("schema")==INDEX_SCHEMA and prior_index.get("privateOnly") is True,"Invalid prior reference index")
    version=verify_game_version(aa,spec["gameVersion"])
    locs,pins=resolve(aa,set(roles))
    report={"schema":REPORT_SCHEMA,"gameVersion":spec["gameVersion"],"sourceFullVersion":version,
            "privateOnly":True,"publicationAuthorized":False,"catalogSha256":pins,
            "targets":roles,"assets":{},"errors":{}}
    existing=manifests(root)
    memo={}
    for guid,match,error in exact_objects(aa,locs):
        if error:
            report["errors"].setdefault(guid,[]).append(error);continue
        identity,refs,bundles=match
        try:
            ck=(identity,roles[guid])
            if ck not in memo:
                m=materialize(refs["Image"],bundles,existing,out,True,ledger,
                              "shared-thumbnail-cache.json" if roles[guid]=="shop-512" else None)
                memo[ck]=local_image(out,m)
            row={"unityAssetId":identity,"original":memo[ck]}
            if guid in report["assets"] and report["assets"][guid]!=row:
                raise ValueError("Ambiguous exact source")
            report["assets"][guid]=row
        except Exception as exc:
            report["errors"].setdefault(guid,[]).append(type(exc).__name__+": "+str(exc)[:180])
    missing=set(roles)-set(report["assets"])
    report["complete"]=not missing and not report["errors"]
    report["unresolved"]=sorted(missing|set(report["errors"]))
    write_json(out/"shared-source-report.json",report)
    check(report["complete"],"Unresolved confirmed references; no publication candidate")
    cache_path=out/"shared-thumbnail-cache.json"
    old=json.loads(cache_path.read_bytes()) if cache_path.exists() else {}
    previous=old.get("images",{}) if old.get("policy")==POLICY else {}
    cache={};images={};refs={}
    for guid,row in sorted(report["assets"].items()):
        o=info(row["original"]);sha=o["sha256"]
        images[sha]=o
        r={"original":sha,"role":roles[guid]}
        if roles[guid]=="shop-512":
            if sha not in cache:cache[sha]=thumbnail(out,o,previous,ledger)
            t=cache[sha];images[t["sha256"]]=t;r["thumbnail"]=t["sha256"]
        refs[guid]=r
    for m in images.values():verify_local_or_published(out,m,ledger)
    index={"schema":INDEX_SCHEMA,"gameVersion":spec["gameVersion"],"privateOnly":True,
           "thumbnailPolicy":POLICY,"references":refs,"images":images}
    changes=classify(prior_index["references"] if prior_index else {},refs)
    reused=[m for m in images.values() if published(ledger,m)]
    missing=[m for m in images.values() if not published(ledger,m)]
    summary={"referenceChanges":dict(Counter(changes.values())),"uniqueImages":len(images),
             "ledgerReused":len(reused),"notInVerifiedLedger":len(missing),
             "bytesNotInVerifiedLedger":sum(m["bytes"] for m in missing),
             "changes":changes,"priorReferenceComparisonAvailable":prior_index is not None}
    write_json(cache_path,{"policy":POLICY,"images":cache})
    write_json(out/"shared-index-candidate.json",index)
    write_json(out/"shared-delta-report.json",summary)
    return summary


def prepare(root,ledger):
    report=json.loads((root/"shared-source-report.json").read_bytes())
    index=json.loads((root/"shared-index-candidate.json").read_bytes())
    cache=json.loads((root/"shared-thumbnail-cache.json").read_bytes())
    check(report["schema"]==REPORT_SCHEMA and report["complete"] and not report["errors"] and
          index["schema"]==INDEX_SCHEMA and index["privateOnly"] is True and index["thumbnailPolicy"]==POLICY and
          report["gameVersion"]==index["gameVersion"] and cache["policy"]==POLICY and
          set(report["targets"])==set(report["assets"])==set(index["references"]),"Incomplete shared source report")
    used=set()
    for guid,r in index["references"].items():
        o=info(report["assets"][guid]["original"])
        check(r["role"]==report["targets"][guid] and r["original"]==o["sha256"] and index["images"][o["sha256"]]==o,"Source reference mismatch")
        used.add(o["sha256"])
        if r["role"]=="shop-512":
            t=info(cache["images"][o["sha256"]])
            check(r["thumbnail"]==t["sha256"] and index["images"][t["sha256"]]==t and
                  max(t["width"],t["height"])<=MAX_EDGE and t["width"]<=o["width"] and t["height"]<=o["height"] and
                  (max(o["width"],o["height"])>MAX_EDGE or t==o),"Thumbnail mismatch")
            used.add(t["sha256"])
        else:check(r["role"]=="ui-original" and "thumbnail" not in r,"UI must use original only")
    check(used==set(index["images"]),"Unexpected image entries")
    objects={}
    for sha,m in index["images"].items():
        check(sha==m["sha256"] and info(m)==m,"Image metadata mismatch")
        verify_local_or_published(root,m,ledger)
        objects[key(sha)]=m
    return report,index,cache,objects


def register(root,ledger,max_objects,max_bytes,r2):
    _,index,_,objects=prepare(root,ledger)
    if not r2:
        return {"uniqueImages":len(objects),"bytes":sum(m["bytes"] for m in objects.values()),"networkRequests":0}
    s3=client()
    _,canonical,pages,_=census(s3)
    existing,pending=split(objects,canonical)
    require_pending(root,pending)
    trusted={k:m["bytes"] for k,m in existing.items() if published(ledger,m)}
    heads={k:m for k,m in existing.items() if k not in trusted}
    summary={"newUploads":len(pending),"newBytes":sum(m["bytes"] for m in pending.values()),
             "existing":len(existing),"ledgerReused":len(trusted),"listRequests":pages,
             "classAUpperBound":pages+len(pending),"classBUpperBound":len(heads)+len(pending),"deleteRequests":0}
    write_json(root/"shared-publication-plan.json",summary)
    print(json.dumps(summary,indent=2),flush=True)
    check(len(pending)<=max_objects and summary["newBytes"]<=max_bytes,"Upload limits exceeded")
    if input("Confirm account-wide free allowance. Type UPLOAD: ")!="UPLOAD":return summary
    verified={**trusted,**publish(s3,root,heads,pending)}
    check(verified=={k:m["bytes"] for k,m in objects.items()},"Incomplete registration")
    write_json(root/"shared-publication-receipt.json",{"schema":RECEIPT_SCHEMA,"bucket":BUCKET,
        "gameVersion":index["gameVersion"],"canonicalMetadataVerified":True,"objects":verified})
    return summary


def verify(root,ledger,ledger_path,max_objects,max_bytes):
    report,index,cache,objects=prepare(root,ledger)
    raw=(root/"shared-publication-receipt.json").read_bytes();receipt=json.loads(raw)
    expected={k:m["bytes"] for k,m in objects.items()}
    check(receipt["schema"]==RECEIPT_SCHEMA and receipt["bucket"]==BUCKET and
          receipt["canonicalMetadataVerified"] is True and receipt["gameVersion"]==index["gameVersion"] and
          receipt["objects"]==expected,"Receipt/index mismatch")
    pin=hashlib.sha256(raw).hexdigest()
    prior={k:m["bytes"] for k,m in objects.items() if published(ledger,m)}
    checkpoint=root/"shared-cdn-readback.json"
    if checkpoint.exists():
        old=json.loads(checkpoint.read_bytes())
        if old.get("sourceReceiptSha256")==pin:
            for k,n in old["verified"].items():
                check(expected.get(k)==n,"Checkpoint mismatch");prior[k]=n
    print("Remaining CDN witnesses:",len(set(expected)-set(prior)),flush=True)
    if input("Type VERIFY: ")!="VERIFY":return
    verified,errors,count,size=batch(expected,prior,max_objects,max_bytes)
    doc={"schema":"wand.media.cdn-readback@1","origin":"https://media.dreamwishwand.com/",
         "sourceReceiptSha256":pin,"cdnVerified":verified==expected and not errors,"verified":verified,"errors":errors}
    write_json(checkpoint,doc)
    if doc["cdnVerified"]:
        write_json(ledger_path,build(report,index,cache,raw,doc,ledger))
    return {"checked":count,"expectedBytes":size,"remaining":len(set(expected)-set(verified)),"errors":errors,
            "ledgerUpdated":doc["cdnVerified"]}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("mode",choices=("extract","plan","publish","verify"))
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--ledger",type=Path)
    p.add_argument("--targets",type=Path)
    p.add_argument("--aa",type=Path)
    p.add_argument("--existing-root",type=Path)
    p.add_argument("--prior-index",type=Path)
    p.add_argument("--max-objects",type=int,default=1000)
    p.add_argument("--max-bytes",type=int,default=100000000)
    a=p.parse_args();root=a.root.resolve()
    check(not any((x/".git").exists() for x in (root,*root.parents)),"Private working directory required")
    check(0<a.max_objects<=2000 and 0<a.max_bytes<=500000000,"Explicit bounded operation required")
    if a.ledger:
        lp=a.ledger.resolve()
        check(not any((x/".git").exists() for x in lp.parents) and lp not in {root/"shared-source-report.json",root/"shared-index-candidate.json",root/"shared-publication-receipt.json",root/"shared-cdn-readback.json",root/"shared-thumbnail-cache.json"},"Separate private ledger path required")
    ledger=read_prior(a.ledger) if a.ledger and a.ledger.exists() else None
    if a.mode=="extract":
        check(a.targets is not None and a.aa is not None and not root.is_relative_to(a.aa.resolve()) and not a.aa.resolve().is_relative_to(root),"Exact target list and separate source required")
        check(not root.exists(),"Use new output for every extraction")
        result=extract(json.loads(a.targets.read_bytes()),a.aa.resolve(),a.existing_root,root,ledger,
                       json.loads(a.prior_index.read_bytes()) if a.prior_index else None)
    elif a.mode=="verify":
        check(a.ledger is not None,"Specify permanent ledger file")
        result=verify(root,ledger,a.ledger,a.max_objects,a.max_bytes)
    else:result=register(root,ledger,a.max_objects,a.max_bytes,a.mode=="publish")
    print(json.dumps(result,indent=2))

if __name__=="__main__":main()
