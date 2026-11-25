#!/usr/bin/env python3
"""Publish existing memory sources without re-encoding. Local plan by default."""
import argparse
import json
import os
import re
from pathlib import Path
from bundle_thumbnails import image_info, write_json
from extract_memory_sources import read_memory_rows
from publish_bundle_thumbnails import census, publish, key, info, check, BUCKET

def prepare(root, parts):
    doc=json.loads((root/"memory-source-report.json").read_bytes())
    source,rows=read_memory_rows(parts)
    check(doc["schema"]=="wand.media.private-memory-sources@1" and doc["complete"] is True and not doc["errors"],"Incomplete extraction")
    check((doc["gameVersion"],doc["sourceItemsSha256"],doc["sourceIl2cppDumpSha256"])==source,"DB-01 source mismatch")
    check(doc["items"]=={str(k):v for k,v in rows.items()},"Item reference mismatch")
    images={v["ImageAddress"][5:] for v in rows.values()}
    masks={v["MaskDataAddress"][5:] for v in rows.values()}
    check(not images & masks and set(doc["assets"])==images|masks,"GUID coverage mismatch")
    objects={}
    refs={}
    for guid,asset in doc["assets"].items():
        expected={"Image"} if guid in images else {"Mask","Outline"}
        check(set(asset["images"])==expected,"Incorrect image roles")
        refs[guid]={}
        for role,v in asset["images"].items():
            meta=info(v)
            k=key(meta["sha256"])
            check(k not in objects or objects[k]==meta,"Image metadata conflict")
            if k not in objects:
                path=(root/k).resolve()
                check(path.is_relative_to(root) and path.is_file(),"Missing extracted image: "+k)
                check(image_info(path.read_bytes(),meta["sha256"])==meta,"Image verification failed")
                objects[k]=meta
            refs[guid][role]=meta["sha256"]
    check(len(objects)==doc["summary"]["uniqueOutputImages"],"Image count mismatch")
    index={"schema":"wand.media.memory-index@1","gameVersion":source[0],
           "pieceBitMappingVerified":False,
           "items":{str(k):[v["ImageAddress"][5:],v["MaskDataAddress"][5:],v["NumberOfShards"]] for k,v in rows.items()},
           "references":refs,"images":{v["sha256"]:v for v in objects.values()}}
    return objects,index

def split(objects,canonical):
    existing={}
    pending={}
    for k,v in objects.items():
        if k in canonical:
            check(canonical[k]==v["bytes"],"Canonical size mismatch: "+k)
            existing[k]=v
        else:
            pending[k]=v
    return existing,pending

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--db01",type=Path,action="append",required=True)
    p.add_argument("--r2",action="store_true",help="Read public bucket and optionally publish missing images")
    p.add_argument("--max-new-uploads",type=int,default=308)
    p.add_argument("--max-new-bytes",type=int,default=392539518)
    a=p.parse_args()
    root=a.root.resolve()
    check(not any((x/".git").exists() for x in [root,*root.parents]),"Private working directory required")
    objects,index=prepare(root,a.db01)
    write_json(root/"memory-index-candidate.json",index)
    summary={"uniqueImages":len(objects),"totalBytes":sum(v["bytes"] for v in objects.values()),"publicationVerified":False}
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
    new_bytes=sum(v["bytes"] for v in pending.values())
    check(len(pending)<=a.max_new_uploads and new_bytes<=a.max_new_bytes,"Publication budget exceeded")
    summary.update(existing=len(existing),newUploads=len(pending),newBytes=new_bytes,
                   listRequests=pages,classAUpperBound=pages+len(pending),classBUpperBound=len(objects),deleteRequests=0)
    write_json(root/"memory-publication-plan.json",summary)
    print(json.dumps(summary,indent=2),flush=True)
    if input("Confirm account-wide R2 free allowance. Type UPLOAD to verify/register these images: ")!="UPLOAD":
        return
    receipt=publish(s3,root,existing,pending)
    check(set(receipt)==set(objects),"Incomplete publication")
    write_json(root/"memory-publication-receipt.json",{"schema":"wand.media.memory-publication-receipt@1","bucket":BUCKET,
              "canonicalMetadataVerified":True,"cdnVerified":False,"objects":receipt})
    print("Canonical R2 metadata verified; CDN readback and activation remain.",flush=True)

if __name__=="__main__":
    main()
