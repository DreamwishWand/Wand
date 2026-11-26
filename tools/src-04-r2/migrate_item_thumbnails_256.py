#!/usr/bin/env python3
"""Migrate reviewed Item thumbnails from native local WebP to long edge 256.
No game re-extraction, original rewrite, old thumbnail read, copy or delete.
Default offline; R2 mode publishes only missing canonical encoded hashes.
"""
import argparse
import hashlib
import io
import json
import os
import re
from pathlib import Path
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
from stage_media_v2 import collect, ensure_inside, webp_lossless_dimensions, digest_file, DEFAULT_OUT
from bundle_thumbnails import image_info, write_json
from publish_bundle_thumbnails import census, verify, key, check, BUCKET, CACHE

POLICY="lossless-webp-lanczos-256-v1"
EDGE=256

def meta(sha,size,width,height):
    return {"sha256":sha,"bytes":size,"width":width,"height":height}

def verify_local(path,m):
    check(path.stat().st_size==m["bytes"] and digest_file(path)==m["sha256"] and
          webp_lossless_dimensions(path)==(m["width"],m["height"]),"Local WebP mismatch: "+m["sha256"])

def make_thumbnail(path, original, out, cached=None):
    if max(original["width"],original["height"])<=EDGE:
        return original
    if isinstance(cached,dict) and re.fullmatch(r"[a-f0-9]{64}",str(cached.get("sha256",""))):
        p=out/key(cached["sha256"])
        if p.is_file() and max(cached["width"],cached["height"])==EDGE and cached["width"]<=original["width"] and cached["height"]<=original["height"]:
            verify_local(p,cached)
            return cached
    with Image.open(path) as im:
        rgba=im.convert("RGBA")
        rgba.thumbnail((EDGE,EDGE),Image.Resampling.LANCZOS)
        b=io.BytesIO()
        rgba.save(b,format="WEBP",lossless=True,quality=100,method=6,exact=True)
    raw=b.getvalue()
    sha=hashlib.sha256(raw).hexdigest()
    m=image_info(raw,sha)
    check(max(m["width"],m["height"])==EDGE and m["width"]<=original["width"] and m["height"]<=original["height"],"Thumbnail bounds")
    p=out/key(sha)
    p.parent.mkdir(parents=True,exist_ok=True)
    if p.exists():
        check(p.read_bytes()==raw,"Thumbnail collision")
    else:
        tmp=p.with_suffix(".tmp")
        tmp.write_bytes(raw)
        tmp.replace(p)
    return m

def prepare(root,out):
    manifest_sha,files,coverage=collect(root)
    source=root/"private-media-overlay-v2-latest"
    manifest=json.loads((source/"manifest.json").read_bytes())
    cache_path=out/"item-256-thumbnail-cache.json"
    prior={}
    if cache_path.is_file():
        old=json.loads(cache_path.read_bytes())
        if old.get("policy")==POLICY:
            prior=old.get("images",{})
    originals={}
    paths={}
    for rel,(sha,size,w,h,kind) in sorted(files.items()):
        if kind!="original":
            continue
        m=meta(sha,size,w,h)
        p=ensure_inside(root,rel)
        if sha in originals:
            check(originals[sha]==m,"Conflicting original metadata")
            continue
        verify_local(p,m)
        originals[sha]=m
        paths[key(sha)]=p
    mapping={}
    objects={key(sha):m for sha,m in originals.items()}
    reused=0
    generated=0
    for n,(sha,o) in enumerate(sorted(originals.items()),1):
        old=prior.get(sha)
        t=make_thumbnail(paths[key(sha)],o,out,old)
        k=key(t["sha256"])
        if t==o:
            reused+=1
        elif old!=t:
            generated+=1
        if k in objects:
            check(objects[k]==t,"Conflicting thumbnail metadata")
        else:
            objects[k]=t
            paths[k]=out/k
        mapping[sha]=t
        if n%100==0 or n==len(originals):
            write_json(cache_path,{"policy":POLICY,"images":{**prior,**mapping}})
            print(f"  256px thumbnails {n}/{len(originals)}",flush=True)
    write_json(cache_path,{"policy":POLICY,"images":mapping})
    items={}
    for n in range(256):
        name=f"id/{n:02x}.json"
        raw=(source/name).read_bytes()
        pin=manifest["files"][name]
        check(hashlib.sha256(raw).hexdigest()==pin["sha256"] and len(raw)==pin["bytes"],"Source shard changed")
        for row in json.loads(raw)["rows"]:
            sha=row["image"]["original"]["sha256"]
            check(sha in originals,"Unknown original")
            items[str(row["itemId"])]=[sha,mapping[sha]["sha256"]]
    check(len(items)==coverage["itemCount"],"Incomplete Item coverage")
    index={"schema":"wand.media.item-index@256-v1","gameVersion":"1.26.2","thumbnailPolicy":POLICY,"maxThumbnailLongEdge":EDGE,
           "items":items,"images":{v["sha256"]:v for v in objects.values()}}
    write_json(out/"item-256-index-candidate.json",index)
    summary={"itemCount":len(items),"guidCount":coverage["guidCount"],"uniqueOriginals":len(originals),
             "originalsReusedAsThumbnail":reused,"newlyGeneratedThumbnails":generated,
             "uniqueThumbnails":len({v["sha256"] for v in mapping.values()}),"uniqueImages":len(objects),
             "originalBytes":sum(v["bytes"] for v in originals.values()),
             "thumbnailBytes":sum(v["bytes"] for v in {v["sha256"]:v for v in mapping.values()}.values()),
             "totalBytes":sum(v["bytes"] for v in objects.values()),"publicationVerified":False}
    write_json(out/"item-256-generation-report.json",summary)
    print(json.dumps(summary,indent=2),flush=True)
    return objects,paths,summary

def publish_delta(root,out,objects,paths,summary,max_uploads,max_bytes):
    account=os.getenv("R2_ACCOUNT_ID","")
    check(re.fullmatch(r"[a-f0-9]{32}",account) and os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"),"R2 credentials required")
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
    s3=boto3.client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                    config=Config(retries={"total_max_attempts":1},connect_timeout=10,read_timeout=30,max_pool_connections=8))
    check("IfNoneMatch" in s3.meta.service_model.operation_model("PutObject").input_shape.members,"Conditional PUT required")
    _,canonical,pages,_=census(s3)
    # Existing trusted receipt is optional; reuse only when current LIST size agrees.
    trusted={}
    for p in (root.parent/"src04-flat-inventory.json",root/"src04-flat-inventory.json",out/"item-256-publication-receipt.json"):
        if p.is_file():
            doc=json.loads(p.read_bytes())
            if p.name=="item-256-publication-receipt.json":
                if doc.get("canonicalMetadataVerified") is not True or doc.get("bucket")!=BUCKET:
                    continue
                doc=doc["objects"]
            if isinstance(doc,dict):
                for k,v in doc.items():
                    if k in objects and type(v) is int and v==objects[k]["bytes"] and canonical.get(k)==v:
                        trusted[k]=v
    pending={}
    needs_head={}
    for k,v in objects.items():
        if k in canonical:
            check(canonical[k]==v["bytes"],"Canonical size mismatch: "+k)
            if k not in trusted:
                needs_head[k]=v
        else:
            pending[k]=v
    new_bytes=sum(v["bytes"] for v in pending.values())
    check(len(pending)<=max_uploads and new_bytes<=max_bytes,"Publication budget exceeded")
    plan={**summary,"existing":len(trusted)+len(needs_head),"receiptReused":len(trusted),"newUploads":len(pending),
          "newBytes":new_bytes,"listRequests":pages,"classAUpperBound":pages+len(pending),
          "classBUpperBound":len(needs_head)+len(pending),"deleteRequests":0}
    write_json(out/"item-256-publication-plan.json",plan)
    print(json.dumps(plan,indent=2),flush=True)
    if input("Confirm account-wide R2 free allowance. Type UPLOAD to register missing images: ")!="UPLOAD":
        return
    def task(job):
        k,v,is_new=job
        if is_new:
            raw=paths[k].read_bytes()
            check(len(raw)==v["bytes"] and hashlib.sha256(raw).hexdigest()==v["sha256"],"Local bytes changed")
            try:
                s3.put_object(Bucket=BUCKET,Key=k,Body=raw,IfNoneMatch="*",ContentType="image/webp",CacheControl=CACHE,
                              StorageClass="STANDARD",Metadata={"sha256":v["sha256"]})
            except ClientError as e:
                if e.response.get("ResponseMetadata",{}).get("HTTPStatusCode")!=412:
                    raise
        return k,verify(s3,k,v)
    receipt=dict(trusted)
    jobs=[(k,v,False) for k,v in needs_head.items()]+[(k,v,True) for k,v in pending.items()]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for start in range(0,len(jobs),32):
            for k,size in pool.map(task,jobs[start:start+32]):
                receipt[k]=size
            if (start//32)%8==0 or start+32>=len(jobs):
                print(f"  Registered/verified {len(receipt)}/{len(objects)}",flush=True)
    check(set(receipt)==set(objects),"Incomplete publication")
    write_json(out/"item-256-publication-receipt.json",{"schema":"wand.media.item-256-publication-receipt@1","bucket":BUCKET,
               "canonicalMetadataVerified":True,"cdnVerified":False,"objects":receipt})
    print("Return item-256-publication-receipt.json and item-256-index-candidate.json.",flush=True)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,default=DEFAULT_OUT)
    p.add_argument("--r2",action="store_true")
    p.add_argument("--max-new-uploads",type=int,default=10000)
    p.add_argument("--max-new-bytes",type=int,default=500000000)
    a=p.parse_args()
    root=a.root.resolve()
    check(not any((x/".git").exists() for x in (root,*root.parents)),"Private working directory required")
    out=root/"item-thumbnails-256"
    out.mkdir(exist_ok=True)
    objects,paths,summary=prepare(root,out)
    if a.r2:
        publish_delta(root,out,objects,paths,summary,a.max_new_uploads,a.max_new_bytes)

if __name__=="__main__":
    main()
