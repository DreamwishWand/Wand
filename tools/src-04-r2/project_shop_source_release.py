#!/usr/bin/env python3
"""Public Shop source images, not composed artwork or a second bundle catalog."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from shared_source_delta import prepare, TARGET_SCHEMA
from source_image_ledger import load, published
from publish_bundle_thumbnails import BUCKET, check
from bundle_thumbnails import POLICY, write_json

GUID = re.compile(r"guid:([0-9a-f]{32})")
SHA = re.compile(r"[0-9a-f]{64}")

def public_targets(catalog):
    check(catalog.get("schema")=="wand.item-master.premium-bundle-source@1" and
          isinstance(catalog.get("definitions"),list) and
          len(catalog["definitions"])==catalog["counts"]["publicDefinitions"],"Public DB-01 catalog required")
    version=catalog["source"]["steam"]["gameVersion"]
    check(re.fullmatch(r"\d+\.\d+\.\d+",version),"Invalid source version")
    ids=set(); refs=set()
    def add(value):
        if value is None or value=="":return
        m=GUID.fullmatch(value) if isinstance(value,str) else None
        check(m,"Unrecognized public image address")
        refs.add(m[1])
    for b in catalog["definitions"]:
        bid=b["bundleId"]
        check(re.fullmatch(r"[A-Za-z0-9_-]{1,128}",bid) and bid not in ids,"Duplicate bundle identity")
        ids.add(bid)
        # Both public revisions can reference a shared native asset. A reference
        # absent from the current Steam catalog remains unresolved, not guessed.
        for row in (b["current"],b["legacy"]):
            if row is None:continue
            check(SHA.fullmatch(row["revisionSha256"]),"Invalid revision identity")
            art=row.get("artwork") or {}
            for key in ("image","background"):add(art.get(key))
            mega=art.get("megaImages") or {}
            check(set(mega)<=set("OverridedImage"+str(i) for i in range(1,5)),"Unknown mega image slot")
            for value in mega.values():add(value)
            for c in row["components"]:add(c.get("image"))
    return version,refs

def select(catalog, private_targets):
    version,refs=public_targets(catalog)
    check(private_targets["schema"]==TARGET_SCHEMA and private_targets["gameVersion"]==version and
          all(re.fullmatch(r"[0-9a-f]{32}",g) and v=="shop-512" for g,v in private_targets["targets"].items()),
          "Expected private Shop targets for same version")
    chosen=set(private_targets["targets"])&refs
    check(chosen,"No eligible public artwork targets")
    return {"schema":TARGET_SCHEMA,"gameVersion":version,"targets":{g:"shop-512" for g in sorted(chosen)}}

def project(catalog,index,receipt_raw,cdn):
    version,allowed=public_targets(catalog)
    receipt=json.loads(receipt_raw)
    check(index["schema"]=="wand.media.shared-image-index-candidate@1" and index["privateOnly"] is True and
          index["gameVersion"]==version and index["thumbnailPolicy"]==POLICY,"Invalid source index")
    check(receipt["schema"]=="wand.media.shared-image-publication-receipt@1" and receipt["bucket"]==BUCKET and
          receipt["gameVersion"]==version and receipt["canonicalMetadataVerified"] is True and
          cdn["schema"]=="wand.media.cdn-readback@1" and cdn["origin"]=="https://media.dreamwishwand.com/" and
          cdn["cdnVerified"] is True and not cdn["errors"] and
          cdn["sourceReceiptSha256"]==hashlib.sha256(receipt_raw).hexdigest(),"CDN-verified receipt required")
    objects={"images/"+sha+".webp":m["bytes"] for sha,m in index["images"].items()}
    check(objects==receipt["objects"]==cdn["verified"],"Receipt coverage mismatch")
    refs={};images={}
    for guid,row in sorted(index["references"].items()):
        check(guid in allowed and row["role"]=="shop-512","Unexpected or nonpublic Shop reference")
        pair=[]
        for key in ("original","thumbnail"):
            sha=row[key];m=index["images"][sha]
            check(SHA.fullmatch(sha) and m["sha256"]==sha and
                  all(type(m[k]) is int and m[k]>0 for k in ("bytes","width","height")) and
                  max(m["width"],m["height"])<=16384,"Invalid image")
            images[sha]={k:m[k] for k in ("bytes","width","height")}
            pair.append(sha)
        o,t=(images[x] for x in pair)
        check(t["width"]<=o["width"] and t["height"]<=o["height"] and
              (pair[0]==pair[1] if max(o["width"],o["height"])<=512 else max(t["width"],t["height"])==512),
              "Shop thumbnail policy mismatch")
        refs[guid]=pair
    check(refs and set(images)==set(index["images"]),"Unreferenced source image")
    return {"schema":"wand.media.shop-source-release@1","state":"published","gameVersion":version,
            "publicationAuthorized":True,"publicReadbackVerified":True,"renderingVerified":False,
            "references":refs,"images":images}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("mode",choices=("select","release"))
    p.add_argument("--catalog",type=Path,required=True)
    p.add_argument("--targets",type=Path)
    p.add_argument("--root",type=Path)
    p.add_argument("--ledger",type=Path)
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    check(not a.out.exists(),"New output file required")
    catalog=json.loads(a.catalog.read_bytes())
    if a.mode=="select":
        check(a.targets is not None and not any((x/".git").exists() for x in a.out.resolve().parents),"Private targets required")
        result=select(catalog,json.loads(a.targets.read_bytes()))
        print("Eligible exact GUIDs:",len(result["targets"]))
    else:
        check(a.root is not None and a.ledger is not None,"Verified source and ledger required")
        ledger=load(json.loads(a.ledger.read_bytes()))
        _,index,_,objects=prepare(a.root,ledger)
        check(all(published(ledger,m) for m in objects.values()),"Complete verified ledger coverage required")
        result=project(catalog,index,(a.root/"shared-publication-receipt.json").read_bytes(),
                       json.loads((a.root/"shared-cdn-readback.json").read_bytes()))
        print("Published source references:",len(result["references"]),"; no composed images")
    write_json(a.out,result)

if __name__=="__main__":main()
