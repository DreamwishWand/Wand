#!/usr/bin/env python3
"""One-time migration of verified public game art to flat immutable R2 keys.

PLAN reads R2 metadata only, never copies, downloads images or deletes.
APPLY is explicitly authorized, source-ETag and destination-absence guarded.
No private provenance, raw game files, credentials or saves are published.
"""
import argparse
import hashlib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from pathlib import Path

from build_public_candidate import approved_local_stage, SOURCE_PREFIX, PRIVATE_BUCKET
from plan_public_upload import image_key, PUBLIC_CACHE_CONTROL, PUBLIC_CONTENT_TYPE
from stage_media_v2 import DEFAULT_OUT, require, save_report

PUBLIC_BUCKET = "dreamwishwand-media"
SHA = r"[0-9a-f]{64}"
CANONICAL = re.compile(r"images/("+SHA+r")\.webp$")
LEGACY = re.compile(r"(?:media/(?:steam-v1\.26\.2/(?:thumbnail|original)|shared/original|world-maps/original)|(?:thumbnail|original)|images)/([0-9a-f]{2})/("+SHA+r")\.webp$")
SCHEMA = "wand.media.flat-migration-plan@1"


def canonical_sha(key):
    m = CANONICAL.fullmatch(key)
    if m:
        return m[1]
    m = LEGACY.fullmatch(key)
    if m and m[1] == m[2][:2]:
        return m[2]
    return None


class Budget:
    def __init__(self, a, b, size):
        require(all(type(n) is int and n >= 0 for n in (a,b,size)), "MIGRATION_BUDGET")
        self.max_a, self.max_b, self.max_bytes = a,b,size
        self.a = self.b = self.bytes = 0
        self.lock = Lock()

    def take(self, a=0,b=0,size=0):
        with self.lock:
            require(self.a+a <= self.max_a and self.b+b <= self.max_b and
                    self.bytes+size <= self.max_bytes, "MIGRATION_BUDGET_EXCEEDED")
            self.a += a
            self.b += b
            self.bytes += size

    def summary(self):
        return {"classARequests":self.a,"classBRequests":self.b,"addedBytes":self.bytes}


def client(account):
    require(re.fullmatch(r"[a-f0-9]{32}",account or "") is not None,"ACCOUNT_ID_REQUIRED")
    require(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"),"R2_CREDENTIALS_REQUIRED")
    import boto3
    from botocore.config import Config
    s3=boto3.client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                    config=Config(retries={"total_max_attempts":1},connect_timeout=10,read_timeout=30,max_pool_connections=16))
    # R2 extension, not the standard source-side CopySourceIfNoneMatch.
    # Inject before signing so the destination condition is authenticated.
    def no_overwrite(request, **kwargs):
        request.headers["cf-copy-destination-if-none-match"]="*"
    s3.meta.events.register("before-sign.s3.CopyObject",no_overwrite)
    return s3


def inventory(s3,bucket,budget,prefix=""):
    objects={}
    token=None
    pages=0
    print(f'Listing {bucket} ...',flush=True)
    while True:
        budget.take(a=1)
        args={"Bucket":bucket,"Prefix":prefix,"MaxKeys":1000}
        if token:
            args["ContinuationToken"]=token
        page=s3.list_objects_v2(**args)
        for item in page.get("Contents",[]):
            require(item["Key"] not in objects,"MIGRATION_LIST_DUPLICATE")
            objects[item["Key"]]=item
        pages+=1
        print(f"  page {pages}: {len(objects):,} objects; LIST {budget.a}/{budget.max_a}",flush=True)
        if not page.get("IsTruncated"):
            return objects
        token=page.get("NextContinuationToken")
        require(bool(token),"MIGRATION_LIST_TOKEN")


def verified_head(s3,bucket,key,sha,size,budget,*,canonical=False):
    budget.take(b=1)
    h=s3.head_object(Bucket=bucket,Key=key)
    require(h.get("ContentLength")==size and h.get("Metadata",{}).get("sha256")==sha
            and h.get("ContentType")==PUBLIC_CONTENT_TYPE and h.get("ETag"),
            "MIGRATION_SOURCE_METADATA_MISMATCH: "+key)
    require(h.get("StorageClass","STANDARD")=="STANDARD","MIGRATION_NONSTANDARD")
    if canonical:
        require(h.get("CacheControl")==PUBLIC_CACHE_CONTROL,"MIGRATION_CANONICAL_CACHE_MISMATCH: "+key)
    return h["ETag"]


def item_sources(files):
    out={}
    for rel,(sha,size,w,h,kind) in sorted(files.items()):
        require(re.fullmatch(r"images-v2/(?:thumbnail|original)/[a-f0-9]{2}/"+SHA+r"\.webp",rel) is not None,
                "MIGRATION_PRIVATE_PATH")
        key=image_key(sha)
        existing=out.get(key)
        require(existing is None or existing["bytes"]==size,"MIGRATION_HASH_CONFLICT")
        out.setdefault(key,{"sha256":sha,"bytes":size,"sourceKey":SOURCE_PREFIX+"/"+rel})
    return out


def build_plan(s3,files,budget):
    known=item_sources(files)
    public=inventory(s3,PUBLIC_BUCKET,budget)
    private={}
    # Only recognize exact known public image namespaces. Never copy arbitrary
    # other public objects or anything outside the approved private item map.
    public_sources={}
    unknown=0
    for key,obj in sorted(public.items()):
        sha=canonical_sha(key)
        if not sha:
            unknown+=1
            continue
        target=image_key(sha)
        size=obj["Size"]
        require(type(size) is int and size>0,"MIGRATION_OBJECT_SIZE")
        if target in known:
            require(known[target]["bytes"]==size,"MIGRATION_HASH_SIZE_CONFLICT")
        else:
            known[target]={"sha256":sha,"bytes":size,"sourceKey":None}
        public_sources.setdefault(target,[]).append(key)
    missing=[k for k in known if k not in public_sources]
    if missing:
        print(f"{len(missing):,} item hashes not in public; checking private source inventory.",flush=True)
        private=inventory(s3,PRIVATE_BUCKET,budget,SOURCE_PREFIX+"/")
    else:
        print("All verified local item hashes have public filename candidates. Private LIST skipped.",flush=True)
    require(budget.b+len(known)<=budget.max_b,"MIGRATION_BUDGET_EXCEEDED")
    def inspect(entry):
        key,v=entry
        sha,size=v["sha256"],v["bytes"]
        if key in public:
            verified_head(s3,PUBLIC_BUCKET,key,sha,size,budget,canonical=True)
            return {"target":key,"sha256":sha,"bytes":size,"action":"reuse"}
        if key in public_sources:
            src=public_sources[key][0]
            bucket=PUBLIC_BUCKET
        else:
            src=v["sourceKey"]
            bucket=PRIVATE_BUCKET
            require(src in private and private[src]["Size"]==size,"MIGRATION_PRIVATE_MISSING")
        etag=verified_head(s3,bucket,src,sha,size,budget)
        return {"target":key,"sha256":sha,"bytes":size,"action":"copy",
                     "sourceBucket":bucket,"sourceKey":src,"sourceETag":etag}
    rows=[]
    entries=sorted(known.items())
    total=len(entries)
    print(f"Checking {total:,} distinct source candidates; 12 concurrent metadata requests.",flush=True)
    with ThreadPoolExecutor(max_workers=12) as pool:
        for start in range(0,total,120):
            futures=[pool.submit(inspect,x) for x in entries[start:start+120]]
            for future in as_completed(futures):
                rows.append(future.result())
                if len(rows)%100==0 or len(rows)==total:
                    print(f"  HEAD {len(rows):,}/{total:,} ({100*len(rows)/max(total,1):.1f}%)",flush=True)
    rows.sort(key=lambda r:r["target"])
    pending=[r for r in rows if r["action"]=="copy"]
    projected={"classARequests":len(pending)+max(1,(len(public)+999)//1000)+1,
               "classBRequests":len(rows),"addedBytes":sum(r["bytes"] for r in pending)}
    return {"schema":SCHEMA,"publicBucket":PUBLIC_BUCKET,"privateBucket":PRIVATE_BUCKET,
            "status":"planned_no_writes","publicObjects":len(public),"privateSourceObjects":len(private),"privateInventoryRead":bool(missing),
            "privateCopies":sum(r["sourceBucket"]==PRIVATE_BUCKET for r in pending),
            "unclassifiedPublicObjects":unknown,"uniqueImages":len(rows),"copyCount":len(pending),
            "reuseCount":len(rows)-len(pending),"planUsage":budget.summary(),"applyUpperEstimate":projected,
            "objects":rows}


def apply_plan(s3,plan,files,budget):
    require(plan.get("schema")==SCHEMA and plan.get("status")=="planned_no_writes"
            and plan.get("publicBucket")==PUBLIC_BUCKET and plan.get("privateBucket")==PRIVATE_BUCKET,
            "MIGRATION_PLAN")
    expected=item_sources(files)
    rows=plan["objects"]
    seen=set()
    # Validate the entire plan before the first write.
    for row in rows:
        key,sha,size=row["target"],row["sha256"],row["bytes"]
        require(key==image_key(sha) and key not in seen and type(size) is int and size>0,
                "MIGRATION_PLAN_ROW")
        seen.add(key)
        if key in expected:
            require(size==expected[key]["bytes"],"MIGRATION_PLAN_ITEM_SIZE")
        if row["action"]=="copy":
            src,bucket=row["sourceKey"],row["sourceBucket"]
            require(bool(row["sourceETag"]),"MIGRATION_PLAN_ETAG")
            if bucket==PRIVATE_BUCKET:
                require(key in expected and src==expected[key]["sourceKey"],"MIGRATION_PRIVATE_SCOPE")
            else:
                require(bucket==PUBLIC_BUCKET and canonical_sha(src)==sha and src!=key,"MIGRATION_PUBLIC_SCOPE")
        else:
            require(row["action"]=="reuse","MIGRATION_PLAN_ACTION")
    require(expected.keys()<=seen,"MIGRATION_PLAN_INCOMPLETE")
    present=inventory(s3,PUBLIC_BUCKET,budget,"images/")
    needed=[r for r in rows if r["target"] not in present]
    require(all(r["action"]=="copy" for r in needed),"MIGRATION_REUSED_TARGET_MISSING")
    require(budget.a+len(needed)<=budget.max_a and budget.b+len(rows)<=budget.max_b
            and sum(r["bytes"] for r in needed)<=budget.max_bytes,"MIGRATION_BUDGET_EXCEEDED")
    # Preflight existing destinations, including already copied rows from a prior run.
    receipt={}
    for row in rows:
        key,sha,size=row["target"],row["sha256"],row["bytes"]
        if key in present:
            verified_head(s3,PUBLIC_BUCKET,key,sha,size,budget,canonical=True)
            receipt[key]=size
    # Source ETag is already verified in the pinned plan. R2 enforces it atomically.
    # Avoid a second full source HEAD sweep.
    for row in needed:
        key,sha,size=row["target"],row["sha256"],row["bytes"]
        source_etag=row["sourceETag"]
        budget.take(a=1,size=size)
        s3.copy_object(Bucket=PUBLIC_BUCKET,Key=key,
                       CopySource={"Bucket":row["sourceBucket"],"Key":row["sourceKey"]},
                       CopySourceIfMatch=source_etag,MetadataDirective="REPLACE",
                       Metadata={"sha256":sha},ContentType=PUBLIC_CONTENT_TYPE,
                       CacheControl=PUBLIC_CACHE_CONTROL,StorageClass="STANDARD")
        verified_head(s3,PUBLIC_BUCKET,key,sha,size,budget,canonical=True)
        receipt[key]=size
        if len(receipt)%250==0:
            print(f"Verified canonical objects: {len(receipt)}/{len(rows)}",flush=True)
    return receipt


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("mode",choices=["plan","apply"])
    p.add_argument("--root",type=Path,default=DEFAULT_OUT)
    p.add_argument("--account-id",default=os.getenv("R2_ACCOUNT_ID"))
    p.add_argument("--plan",type=Path,required=True)
    p.add_argument("--receipt",type=Path)
    p.add_argument("--plan-sha")
    p.add_argument("--approve",default="")
    p.add_argument("--max-a",type=int,required=True)
    p.add_argument("--max-b",type=int,required=True)
    p.add_argument("--max-bytes",type=int,required=True)
    a=p.parse_args()
    budget=Budget(a.max_a,a.max_b,a.max_bytes)
    print('Reading and checking local verified item index ...',flush=True)
    files=approved_local_stage(a.root.resolve())
    print(f'Local item image references: {len(files):,}',flush=True)
    if a.mode=="plan":
        require(not a.plan.exists(),"MIGRATION_PLAN_EXISTS")
        plan=build_plan(client(a.account_id),files,budget)
        save_report(a.plan,plan)
        summary={k:v for k,v in plan.items() if k!="objects"}
        summary["planSha256"]=hashlib.sha256(a.plan.read_bytes()).hexdigest()
        print(json.dumps(summary,indent=2))
    else:
        require(a.approve=="I_APPROVE_PUBLIC_IMAGE_MIGRATION" and a.receipt is not None
                and not a.receipt.exists(),"MIGRATION_APPROVAL_OR_RECEIPT")
        raw=a.plan.read_bytes()
        require(hashlib.sha256(raw).hexdigest()==a.plan_sha,"MIGRATION_PLAN_SHA")
        receipt=apply_plan(client(a.account_id),json.loads(raw),files,budget)
        save_report(a.receipt,receipt)
        print(json.dumps({"status":"canonical_metadata_verified","verifiedImages":len(receipt),
                          "usage":budget.summary(),"cdnVerified":False,"deletedObjects":0},indent=2))


if __name__=="__main__":
    main()
