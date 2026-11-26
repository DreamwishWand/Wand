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

def collect_release(root,version,source_sha=None,overlay_sha=None):
    if version=="1.26.2":
        check(source_sha is None and overlay_sha is None,"Baseline uses fixed source pins")
        return collect(root)
    from plan_media_update import read_items, read_scan
    from stage_media_v2 import VARIANT_POLICY_256
    check(re.fullmatch(r"\d+\.\d+\.\d+",version) and
          re.fullmatch(r"[a-f0-9]{64}",source_sha or "") and
          re.fullmatch(r"[a-f0-9]{64}",overlay_sha or ""),"Future release requires exact source and overlay SHA pins")
    scan=read_scan(root/"source-manifest.json")
    check(scan["version"]==version,"Future source version mismatch")
    items=read_items(root/"source-items"/"items.jsonl",expected_sha=source_sha)
    check(digest_file(root/"private-media-overlay-v2-latest"/"manifest.json")==overlay_sha,"Future overlay manifest changed")
    result=collect(root,expected_items=len(items["items"]),expected_guids=len(items["guids"]),
                   source_sha=source_sha,variant_policy=VARIANT_POLICY_256)
    check(result[0]==overlay_sha,"Future overlay manifest changed")
    return result

def resume(root,out,*,version="1.26.2",source_sha=None,overlay_sha=None):
    """Reconstruct publication inputs from the completed index and pinned originals.
    No image decoding or encoding. Pending uploads are SHA-checked before PUT.
    """
    manifest_sha,files,coverage=collect_release(root,version,source_sha,overlay_sha)
    source=root/"private-media-overlay-v2-latest"
    manifest=json.loads((source/"manifest.json").read_bytes())
    ix=json.loads((out/"item-256-index-candidate.json").read_bytes())
    cache=json.loads((out/"item-256-thumbnail-cache.json").read_bytes())
    summary=json.loads((out/"item-256-generation-report.json").read_bytes())
    check(ix.get("schema")=="wand.media.item-index@256-v1" and ix.get("gameVersion")==version and
          ix.get("thumbnailPolicy")==cache.get("policy")==POLICY and ix.get("maxThumbnailLongEdge")==EDGE,
          "Completed 256px index policy mismatch")
    originals={}
    paths={}
    for rel,(sha,size,w,h,kind) in sorted(files.items()):
        if kind!="original":
            continue
        m=meta(sha,size,w,h)
        p=ensure_inside(root,rel)
        check(p.stat().st_size==size,"Original size changed")
        check(sha not in originals or originals[sha]==m,"Conflicting original metadata")
        originals[sha]=m
        paths.setdefault(key(sha),p)
    mapping=cache["images"]
    check(set(mapping)==set(originals),"Incomplete thumbnail cache")
    objects={key(sha):m for sha,m in originals.items()}
    for sha,o in originals.items():
        t=mapping[sha]
        k=key(t["sha256"])
        check(all(type(t.get(n)) is int and t[n]>0 for n in ("width","height","bytes")),"Invalid thumbnail metadata")
        if max(o["width"],o["height"])<=EDGE:
            check(t==o,"Small original must be reused")
        else:
            check(max(t["width"],t["height"])==EDGE and t["width"]<=o["width"] and t["height"]<=o["height"],"Invalid thumbnail bounds")
        if k in objects:
            check(objects[k]==t,"Conflicting image metadata")
        else:
            p=(out/k).resolve()
            check(p.is_relative_to(out.resolve()) and p.is_file() and p.stat().st_size==t["bytes"],"Missing or changed thumbnail: "+k)
            objects[k]=t
            paths[k]=p
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
    check(len(items)==coverage["itemCount"] and ix["items"]==items and
          ix["images"]=={v["sha256"]:v for v in objects.values()},"Completed index differs from source/cache")
    thumbs={v["sha256"]:v for v in mapping.values()}
    expected={"itemCount":len(items),"guidCount":coverage["guidCount"],"uniqueOriginals":len(originals),
              "originalsReusedAsThumbnail":sum(sha==t["sha256"] for sha,t in mapping.items()),
              "uniqueThumbnails":len(thumbs),"uniqueImages":len(objects),
              "originalBytes":sum(v["bytes"] for v in originals.values()),
              "thumbnailBytes":sum(v["bytes"] for v in thumbs.values()),
              "totalBytes":sum(v["bytes"] for v in objects.values())}
    check(all(summary.get(k)==v for k,v in expected.items()),"Generation report mismatch")
    print("Completed 256px generation reused; no image decoding or encoding.",flush=True)
    return objects,paths,summary

def connect_and_census():

    account=os.getenv("R2_ACCOUNT_ID","")
    check(re.fullmatch(r"[a-f0-9]{32}",account) and os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"),"R2 credentials required")
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
    s3=boto3.client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                    config=Config(retries={"total_max_attempts":1},connect_timeout=10,read_timeout=30,max_pool_connections=8))
    check("IfNoneMatch" in s3.meta.service_model.operation_model("PutObject").input_shape.members,"Conditional PUT required")
    try:
        public,canonical,pages,_=census(s3)
    except ClientError as e:
        if e.response.get("Error",{}).get("Code") in ("AccessDenied","403"):
            raise SystemExit("R2 LIST denied. Check the R2 S3 access key pair and Object Read & Write scope for dreamwishwand-media. No image writes performed.")
        raise
    return s3,canonical,pages,public

def pending_breakdown(pending,original_keys,public):
    originals={k:v for k,v in pending.items() if k in original_keys}
    thumbnails={k:v for k,v in pending.items() if k not in original_keys}
    # A matching legacy name/size is evidence of an existing noncanonical
    # object, not verified metadata or permission to use a noncanonical URL.
    legacy={k:v for k,v in pending.items() if v["bytes"] in public.get(v["sha256"],set())}
    return {"missingCanonicalOriginals":len(originals),
            "missingCanonicalOriginalBytes":sum(v["bytes"] for v in originals.values()),
            "missingCanonicalThumbnailOnly":len(thumbnails),
            "missingCanonicalThumbnailOnlyBytes":sum(v["bytes"] for v in thumbnails.values()),
            "legacyNameSizeMatches":len(legacy),
            "legacyNameSizeMatchBytes":sum(v["bytes"] for v in legacy.values())}

def publish_delta(root,out,objects,paths,summary,max_uploads,max_bytes,connection=None,review_over_budget=False,prior_receipt=None):
    from botocore.exceptions import ClientError
    s3,canonical,pages,public=connection if connection is not None else connect_and_census()
    # Existing trusted receipt is optional; reuse only when current LIST size agrees.
    trusted={}
    receipt_paths=[root.parent/"src04-flat-inventory.json",root/"src04-flat-inventory.json",out/"item-256-publication-receipt.json"]
    if prior_receipt is not None:
        check(prior_receipt.is_file(),"Missing prior publication receipt")
        receipt_paths.append(prior_receipt)
    for p in receipt_paths:
        if p.is_file():
            doc=json.loads(p.read_bytes())
            if p==prior_receipt or p.name=="item-256-publication-receipt.json":
                if (doc.get("schema")!="wand.media.item-256-publication-receipt@1" or
                    doc.get("canonicalMetadataVerified") is not True or doc.get("bucket")!=BUCKET):
                    check(p!=prior_receipt,"Invalid prior publication receipt")
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
    ix=json.loads((out/"item-256-index-candidate.json").read_bytes())
    original_keys={key(pair[0]) for pair in ix["items"].values()}
    check(original_keys<=set(objects) and len(original_keys)==summary["uniqueOriginals"],"Original coverage mismatch")
    over=len(pending)>max_uploads or new_bytes>max_bytes
    plan={**summary,**pending_breakdown(pending,original_keys,public),
          "existing":len(trusted)+len(needs_head),"receiptReused":len(trusted),"newUploads":len(pending),
          "newBytes":new_bytes,"listRequests":pages,"classAUpperBound":pages+len(pending),
          "classBUpperBound":len(needs_head)+len(pending),"deleteRequests":0,
          "defaultMaxNewUploads":max_uploads,"defaultMaxNewBytes":max_bytes,
          "exceedsDefaultBudget":over}
    write_json(out/"item-256-publication-plan.json",plan)
    print(json.dumps(plan,indent=2),flush=True)
    if over:
        print("Default publication budget exceeded. No writes have been made.",flush=True)
        if not review_over_budget:
            return
        # A larger budget can only be approved interactively for the exact
        # reviewed Steam 1.26.2 corpus, never an unbounded upload.
        check(len(objects)==14742 and sum(v["bytes"] for v in objects.values())==934459926
              and summary["itemCount"]==13202 and summary["guidCount"]==9542,
              "Review permitted only for the measured Steam 1.26.2 corpus")
        approval=f"UPLOAD {len(pending)} {new_bytes}"
        print("Review missing originals, thumbnail-only objects and account-wide remaining free allowance.",flush=True)
        print("A legacy name/size match does not establish canonical availability.",flush=True)
        if input(f"Type {approval} to approve this exact plan, or press Enter to stop: ")!=approval:
            return
    elif input("Confirm account-wide R2 free allowance. Type UPLOAD to register missing images: ")!="UPLOAD":
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
    p.add_argument("--resume",action="store_true",help="Reuse completed local generation without resizing")
    p.add_argument("--review-over-budget",action="store_true",help="Allow exact interactive approval above default limits for the reviewed corpus")
    p.add_argument("--max-new-uploads",type=int,default=10000)
    p.add_argument("--max-new-bytes",type=int,default=500000000)
    p.add_argument("--version",default="1.26.2",help="Exact Steam version for a completed future build")
    p.add_argument("--source-items-sha",help="Source SHA-256 from reviewed build report")
    p.add_argument("--overlay-sha",help="Private overlay SHA-256 from reviewed build report")
    p.add_argument("--prior-receipt",type=Path,help="Prior verified public Item image receipt")
    a=p.parse_args()
    check(a.version=="1.26.2" or (a.resume and not a.review_over_budget),"Future release uses completed 256px build and explicit bounded upload")
    check(a.version!="1.26.2" or not (a.source_items_sha or a.overlay_sha),"Baseline source pins are fixed")
    check(a.max_new_uploads>=0 and a.max_new_bytes>=0,"Invalid publication budget")
    root=a.root.resolve()
    check(not any((x/".git").exists() for x in (root,*root.parents)),"Private working directory required")
    out=root/"item-thumbnails-256"
    out.mkdir(exist_ok=True)
    connection=connect_and_census() if a.r2 else None
    objects,paths,summary=resume(root,out,version=a.version,source_sha=a.source_items_sha,overlay_sha=a.overlay_sha) if a.resume else prepare(root,out)
    if a.r2:
        publish_delta(root,out,objects,paths,summary,a.max_new_uploads,a.max_new_bytes,connection,a.review_over_budget,prior_receipt=a.prior_receipt)

if __name__=="__main__":
    main()
