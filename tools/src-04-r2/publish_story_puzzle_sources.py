#!/usr/bin/env python3
"""Publish verified local Story puzzle sources; only missing canonical objects."""
import argparse
import json
import os
import re
from pathlib import Path
from bundle_thumbnails import image_info, write_json, POLICY, MAX_EDGE
from extract_story_puzzle_sources import read_story_rows, target_roles
from publish_bundle_thumbnails import census, publish, key, info, check, BUCKET
from publish_memory_sources import split

def prepare(root, parts, ledger=None):
    from source_image_ledger import verify_local_or_published
    source, rows = read_story_rows(parts)
    report = json.loads((root/"story-puzzle-source-report.json").read_bytes())
    index = json.loads((root/"story-puzzle-index-candidate.json").read_bytes())
    cache = json.loads((root/"story-puzzle-thumbnail-cache.json").read_bytes())
    check(report["schema"] == "wand.media.private-story-puzzle-sources@1" and report["complete"] is True and not report["errors"], "Incomplete extraction")
    check((report["gameVersion"], report["sourceItemsSha256"], report["sourceIl2cppDumpSha256"]) == source, "Source mismatch")
    check(report["items"] == {str(k):v for k,v in rows.items()}, "DB-01 reference mismatch")
    check(index["schema"] == "wand.media.story-puzzle-index@1" and index["gameVersion"] == source[0] and index["thumbnailPolicy"] == POLICY and index["maxThumbnailLongEdge"] == MAX_EDGE and cache["policy"] == POLICY, "Invalid index policy")
    check(set(report["assets"]) == set(target_roles(rows)) and set(index["items"]) == set(report["items"]), "Incomplete GUID or Item coverage")
    objects = {}
    completed = set()
    def add(v):
        m = info(v)
        k = key(m["sha256"])
        check(index["images"].get(m["sha256"]) == m, "Image index mismatch")
        if k not in objects:
            verify_local_or_published(root,m,ledger)
            objects[k] = m
        return m
    for item,row in rows.items():
        original, icon, blurred = [add(report["assets"][row[f][5:]]["original"]) for f in ("ImageAddress","IconAddress","BlurredIconAddress")]
        sha = original["sha256"]
        completed.add(sha)
        t = add(cache["images"][sha])
        check(max(t["width"],t["height"])<=MAX_EDGE and t["width"]<=original["width"] and t["height"]<=original["height"], "Thumbnail bounds")
        if max(original["width"],original["height"])<=MAX_EDGE:
            check(t==original, "Small original must be reused")
        check(index["items"][str(item)] == {"isMissionItem":row["IsMissionItem"],"image":{"original":sha,"thumbnail":t["sha256"]},"icon":icon["sha256"],"blurredIcon":blurred["sha256"]}, "Item media reference mismatch")
    check(set(cache["images"])==completed and set(index["images"])=={v["sha256"] for v in objects.values()}, "Unexpected image records")
    return objects,index

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--db01",type=Path,action="append",required=True)
    p.add_argument("--r2",action="store_true")
    p.add_argument('--ledger',type=Path)
    a=p.parse_args()
    from source_image_ledger import load, require_pending
    ledger=load(json.loads(a.ledger.read_bytes())) if a.ledger else None
    root=a.root.resolve()
    check(not any((x/".git").exists() for x in [root,*root.parents]),"Private working directory required")
    objects,index=prepare(root,a.db01,ledger)
    summary={"uniqueImages":len(objects),"totalBytes":sum(v["bytes"] for v in objects.values()),"publicationVerified":False}
    check(len(objects)<=216 and summary["totalBytes"]<=114359534,"Reviewed Steam 1.26.2 publication limit exceeded")
    if not a.r2:
        print(json.dumps(summary,indent=2))
        return
    account=os.getenv("R2_ACCOUNT_ID","")
    check(re.fullmatch(r"[0-9a-f]{32}",account) and os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"),"R2 credentials required")
    import boto3
    from botocore.config import Config
    s3=boto3.client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",config=Config(retries={"total_max_attempts":1},connect_timeout=10,read_timeout=30,max_pool_connections=8))
    check("IfNoneMatch" in s3.meta.service_model.operation_model("PutObject").input_shape.members,"Conditional PUT required")
    _,canonical,pages,_=census(s3)
    existing,pending=split(objects,canonical)
    require_pending(root,pending)
    summary.update(existing=len(existing),newUploads=len(pending),newBytes=sum(v["bytes"] for v in pending.values()),listRequests=pages,classAUpperBound=pages+len(pending),classBUpperBound=len(objects),deleteRequests=0)
    write_json(root/"story-puzzle-publication-plan.json",summary)
    print(json.dumps(summary,indent=2),flush=True)
    if input("Confirm account-wide R2 free allowance. Type UPLOAD to verify/register: ")!="UPLOAD":
        return
    receipt=publish(s3,root,existing,pending)
    check(set(receipt)==set(objects),"Incomplete publication")
    write_json(root/"story-puzzle-publication-receipt.json",{"schema":"wand.media.story-puzzle-publication-receipt@1","bucket":BUCKET,"canonicalMetadataVerified":True,"cdnVerified":False,"objects":receipt})
    print("Canonical R2 metadata verified. Return story-puzzle-publication-receipt.json.",flush=True)

if __name__=="__main__":
    main()
