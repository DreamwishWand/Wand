#!/usr/bin/env python3
"""Local-only upload plan: one public R2 object per encoded WebP SHA-256.

Input files must come from the source-verified SRC-04 overlay or another
verified media extractor. Prior receipts are public-object inventory, not
private staging reports. This script makes zero network requests.
"""
import argparse
import json
from pathlib import Path
from stage_media_v2 import collect, audit, SHA_RE, require, DEFAULT_OUT, EXPECTED_ITEMS, EXPECTED_GUIDS, SOURCE_ITEMS_SHA


def image_key(sha):
    require(isinstance(sha,str) and SHA_RE.fullmatch(sha), "PUBLIC_SHA")
    return f"images/{sha[:2]}/{sha}.webp"


def plan_upload(files, inventory):
    """Deduplicate across variants and all previously verified releases."""
    require(isinstance(inventory,dict), "PUBLIC_INVENTORY")
    for key, size in inventory.items():
        require(isinstance(key,str) and key.startswith("images/") and
                key == image_key(key.rsplit("/",1)[-1].removesuffix(".webp")) and
                type(size) is int and size>0, "PUBLIC_INVENTORY_RECORD")
    objects={}
    for rel, (sha,size,width,height,kind) in sorted(files.items()):
        key=image_key(sha)
        require(type(size) is int and size>0, "PUBLIC_SIZE")
        if key in objects:
            old=objects[key]
            require((old["bytes"],old["width"],old["height"])==(size,width,height),
                    "PUBLIC_HASH_CONFLICT")
        else:
            objects[key]={"key":key,"sha256":sha,"bytes":size,"width":width,
                          "height":height,"localSource":rel}
    pending=[]
    reused=0
    for key,obj in sorted(objects.items()):
        if key in inventory:
            require(inventory[key]==obj["bytes"], "PUBLIC_INVENTORY_SIZE_CONFLICT")
            reused+=1
        else:
            pending.append(obj)
    return {"schema":"wand.media.direct-upload-plan@1","networkRequests":0,
            "publicationAuthorized":False,"uniqueImages":len(objects),
            "reusedImages":reused,"newUploads":len(pending),
            "newBytes":sum(obj["bytes"] for obj in pending),
            "objects":pending}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,default=DEFAULT_OUT)
    p.add_argument("--inventory",type=Path,help="Local previously verified public key-to-byte-count ledger")
    p.add_argument("--source-items-sha",default=SOURCE_ITEMS_SHA)
    p.add_argument("--expected-items",type=int,default=EXPECTED_ITEMS)
    p.add_argument("--expected-guids",type=int,default=EXPECTED_GUIDS)
    p.add_argument("--max-new-uploads",type=int,required=True)
    p.add_argument("--max-new-bytes",type=int,required=True)
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    require(a.max_new_uploads>=0 and a.max_new_bytes>=0,"PUBLIC_BUDGET")
    root=a.root.resolve()
    _,files,_=collect(root,expected_items=a.expected_items,expected_guids=a.expected_guids,source_sha=a.source_items_sha)
    # A local full verification costs no Cloudflare requests.
    audit(root,files,progress=0)
    inventory=json.loads(a.inventory.read_bytes()) if a.inventory else {}
    plan=plan_upload(files,inventory)
    require(plan["newUploads"]<=a.max_new_uploads and plan["newBytes"]<=a.max_new_bytes,"PUBLIC_BUDGET_EXCEEDED")
    # A plan is private: it includes local image paths. Never publish it.
    with a.out.open("x",encoding="utf-8") as out:
        json.dump(plan,out,ensure_ascii=False,indent=2)
        out.write("\n")
    print(json.dumps({k:v for k,v in plan.items() if k!="objects"},indent=2))


if __name__=="__main__":
    main()
