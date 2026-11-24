#!/usr/bin/env python3
"""Publish locally generated bundle thumbnails; no copy, delete or original rewrite."""
import argparse
import hashlib
import io
import json
import re
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

BUCKET="dreamwishwand-media"
CACHE="public, max-age=31536000, immutable"
SHA=re.compile(r"[0-9a-f]{64}")
LEGACY=re.compile(r"media/(?:shared/original|world-maps/original|steam-v1\.26\.2/(?:original|thumbnail))/([0-9a-f]{2})/([0-9a-f]{64})\.webp")
CANONICAL=re.compile(r"images/([0-9a-f]{64})\.webp")
MAX_LIST=100
MAX_UPLOADS=2097
MAX_BYTES=313836508

def check(ok,reason):
    if not ok: raise ValueError(reason)

def key(sha):
    check(isinstance(sha,str) and SHA.fullmatch(sha),"Invalid SHA-256")
    return "images/"+sha+".webp"

def info(v):
    check(isinstance(v,dict),"Invalid image record")
    key(v.get("sha256"))
    check(all(type(v.get(k)) is int and v[k]>0 for k in ("width","height","bytes")),"Invalid image dimensions or size")
    return {k:v[k] for k in ("sha256","width","height","bytes")}

def validate(root):
    ix=json.loads((root/"thumbnail-index.json").read_bytes())
    check(ix.get("schema")=="wand.media.bundle-thumbnail-index@1" and ix.get("policy")=="lossless-webp-lanczos-512-v1" and ix.get("maxLongEdge")==512,"Unexpected thumbnail index")
    pairs={}
    thumbs={}
    for sha,pair in ix["images"].items():
        o,t=info(pair["original"]),info(pair["thumbnail"])
        check(sha==o["sha256"] and max(t["width"],t["height"])<=512 and t["width"]<=o["width"] and t["height"]<=o["height"],"Thumbnail bounds")
        k=key(t["sha256"])
        check(k not in thumbs or thumbs[k]==t,"Conflicting thumbnail metadata")
        pairs[sha]=(o,t)
        thumbs[k]=t
    check(0<len(thumbs)<=MAX_UPLOADS and sum(t["bytes"] for t in thumbs.values())<=MAX_BYTES,"Candidate budget exceeded")
    for n,(k,t) in enumerate(sorted(thumbs.items()),1):
        p=(root/k).resolve()
        check(p.is_relative_to(root) and p.is_file(),"Missing thumbnail")
        raw=p.read_bytes()
        check(len(raw)==t["bytes"] and hashlib.sha256(raw).hexdigest()==t["sha256"],"Thumbnail hash mismatch")
        with Image.open(io.BytesIO(raw)) as im:
            check(im.format=="WEBP" and im.size==(t["width"],t["height"]) and getattr(im,"n_frames",1)==1,"Invalid WebP")
            im.load()
        if n%250==0 or n==len(thumbs): print(f"  Local verification {n}/{len(thumbs)}",flush=True)
    return pairs,thumbs

def census(s3):
    public={}
    canonical={}
    args={"Bucket":BUCKET,"MaxKeys":1000}
    pages=0
    while True:
        check(pages<MAX_LIST,"LIST limit")
        page=s3.list_objects_v2(**args);pages+=1
        for v in page.get("Contents",[]):
            k,s=v["Key"],v["Size"]
            m=CANONICAL.fullmatch(k)
            if m:
                canonical[k]=s
                public.setdefault(m[1],set()).add(s)
            else:
                m=LEGACY.fullmatch(k)
                if m and m[1]==m[2][:2]: public.setdefault(m[2],set()).add(s)
        print(f"  LIST page {pages}/{MAX_LIST}",flush=True)
        if not page.get("IsTruncated"): break
        args["ContinuationToken"]=page["NextContinuationToken"]
    return public,canonical,pages

def plan(pairs,thumbs,public,canonical):
    eligible=set()
    skipped=0
    for sha,(o,t) in pairs.items():
        if o["bytes"] in public.get(sha,set()):
            eligible.add(key(t["sha256"]))
        else: skipped+=1
    existing={}
    pending={}
    for k in sorted(eligible):
        t=thumbs[k]
        if k in canonical:
            check(canonical[k]==t["bytes"],"Canonical size conflict: "+k)
            existing[k]=t
        else: pending[k]=t
    return existing,pending,skipped

def verify(s3,k,t):
    h=s3.head_object(Bucket=BUCKET,Key=k)
    check(h.get("ContentLength")==t["bytes"] and h.get("Metadata",{}).get("sha256")==t["sha256"] and h.get("ContentType")=="image/webp" and h.get("CacheControl")==CACHE and h.get("StorageClass","STANDARD")=="STANDARD","Canonical metadata mismatch: "+k)
    return t["bytes"]

def publish(s3,root,existing,pending):
    from botocore.exceptions import ClientError
    verified={}
    # Existing keys are not overwritten. Confirm only matching thumbnail targets.
    def task(entry):
        k,t,is_new=entry
        if is_new:
            raw=(root/k).read_bytes()
            check(len(raw)==t["bytes"] and hashlib.sha256(raw).hexdigest()==t["sha256"],"Local file changed")
            try:
                s3.put_object(Bucket=BUCKET,Key=k,Body=raw,IfNoneMatch="*",ContentType="image/webp",CacheControl=CACHE,StorageClass="STANDARD",Metadata={"sha256":t["sha256"]})
            except ClientError as e:
                if e.response.get("ResponseMetadata",{}).get("HTTPStatusCode")!=412: raise
        return k,verify(s3,k,t)
    jobs=[(k,t,False) for k,t in existing.items()]+[(k,t,True) for k,t in pending.items()]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for start in range(0,len(jobs),32):
            for k,size in pool.map(task,jobs[start:start+32]):
                verified[k]=size
                n=len(verified)
                if n%50==0 or n==len(jobs): print(f"  Registered/verified {n}/{len(jobs)}",flush=True)
    return verified

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,required=True)
    a=p.parse_args();root=a.root.resolve()
    pairs,thumbs=validate(root)
    account=os.getenv("R2_ACCOUNT_ID","")
    check(re.fullmatch(r"[a-f0-9]{32}",account) and os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"),"R2 credentials required")
    import boto3
    from botocore.config import Config
    s3=boto3.client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",config=Config(retries={"total_max_attempts":1},connect_timeout=10,read_timeout=30,max_pool_connections=8))
    check("IfNoneMatch" in s3.meta.service_model.operation_model("PutObject").input_shape.members,"Installed boto3 lacks conditional PutObject; update boto3 before publication")
    public,canonical,pages=census(s3)
    existing,pending,skipped=plan(pairs,thumbs,public,canonical)
    summary={"sourcePromoArtHashes":len(pairs),"uniqueCandidates":len(thumbs),"originalNotFoundPublicByHashAndSize":skipped,"eligibleUniqueThumbnails":len(existing)+len(pending),"existingCanonicalCandidates":len(existing),"newUploadUpperBound":len(pending),"newBytesUpperBound":sum(v["bytes"] for v in pending.values()),"listRequests":pages,"classAUpperBound":pages+len(pending),"classBUpperBound":len(existing)+len(pending),"deleteRequests":0,"bundleIdMappingVerified":False}
    print(json.dumps(summary,indent=2),flush=True)
    (root/"thumbnail-publication-plan-summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    if input("Check account-wide remaining R2 free allowance. Type UPLOAD to publish only these candidates: ")!="UPLOAD":
        print("Read-only plan complete. No writes.",flush=True);return
    verified=publish(s3,root,existing,pending)
    (root/"thumbnail-public-receipt.json").write_text(json.dumps(verified,sort_keys=True,indent=2),encoding="utf-8")
    result={**summary,"status":"canonical_metadata_verified","verifiedThumbnails":len(verified),"cdnVerified":False}
    (root/"thumbnail-publication-report.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    print(json.dumps(result,indent=2),flush=True)
    print("Return: "+str(root/"thumbnail-publication-report.json"),flush=True)
if __name__=="__main__":
    main()
