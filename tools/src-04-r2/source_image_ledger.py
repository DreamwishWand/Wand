#!/usr/bin/env python3
"""Shared verified original-pixel and thumbnail ledger for Memory and Story assets."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from bundle_thumbnails import POLICY, MAX_EDGE, write_json, image_info
from publish_bundle_thumbnails import BUCKET, key, info, check

SCHEMA="wand.media.source-image-ledger@1"

def signature(pixel, width, height):
    check(isinstance(pixel,str) and len(pixel)==64 and all(c in "0123456789abcdef" for c in pixel),"Invalid RGBA witness")
    return f"{width}x{height}:{pixel}"

def load(doc):
    check(doc.get("schema")==SCHEMA and doc.get("bucket")==BUCKET and doc.get("thumbnailPolicy")==POLICY,"Invalid source ledger")
    for sha,m in doc["images"].items():
        check(info(m)==m and sha==m["sha256"],"Invalid verified metadata")
    for sig,sha in doc["originals"].items():
        m=doc["images"][sha]
        check(sig==signature(sig.split(":")[-1],m["width"],m["height"]),"Original witness mismatch")
    for sha,t in doc["thumbnails"].items():
        o=doc["images"][sha];m=doc["images"][t]
        check(max(m["width"],m["height"])<=MAX_EDGE and m["width"]<=o["width"] and m["height"]<=o["height"] and (max(o["width"],o["height"])>MAX_EDGE or sha==t),"Thumbnail policy mismatch")
    return doc

def published(ledger,m):
    return bool(ledger and ledger["images"].get(m["sha256"])==info(m))

def original(ledger,pixel,width,height):
    if not ledger:return None
    sha=ledger["originals"].get(signature(pixel,width,height))
    return ledger["images"][sha] if sha else None

def thumbnail(ledger,o):
    if not ledger:return None
    sha=ledger["thumbnails"].get(o["sha256"])
    return ledger["images"][sha] if sha else None

def stage_missing_thumbnail(root, native, o, ledger, cache_name):
    """A new display role needs only a new thumbnail, never a new original."""
    if max(o["width"],o["height"])<=MAX_EDGE or thumbnail(ledger,o):
        return
    from PIL import Image
    cache_path=root/cache_name
    cache=json.loads(cache_path.read_bytes()) if cache_path.is_file() else {}
    if cache.get("policy")!=POLICY:cache={"policy":POLICY,"images":{}}
    old=cache["images"].get(o["sha256"])
    if old:
        p=root/key(old["sha256"])
        if p.is_file() and image_info(p.read_bytes(),old["sha256"])==old:
            return
    resized=native.copy()
    resized.thumbnail((MAX_EDGE,MAX_EDGE),Image.Resampling.LANCZOS)
    buf=io.BytesIO()
    resized.save(buf,format="WEBP",lossless=True,quality=100,method=6,exact=True)
    raw=buf.getvalue()
    with Image.open(io.BytesIO(raw)) as im:
        check(im.convert("RGBA").tobytes()==resized.tobytes(),"Thumbnail roundtrip mismatch")
    m=image_info(raw,hashlib.sha256(raw).hexdigest())
    p=root/key(m["sha256"])
    p.parent.mkdir(parents=True,exist_ok=True)
    if p.is_file():check(p.read_bytes()==raw,"Thumbnail collision")
    else:
        with p.open("xb") as stream:stream.write(raw)
    cache["images"][o["sha256"]]=m
    write_json(cache_path,cache)

def verify_local_or_published(root,m,ledger=None):
    p=(root/key(m["sha256"])).resolve()
    check(p.is_relative_to(root.resolve()),"Unsafe image path")
    if p.is_file():
        check(image_info(p.read_bytes(),m["sha256"])==m,"Local image mismatch")
    else:
        check(published(ledger,m),"Missing local image without verified CDN ledger")
    return p

def require_pending(root,pending):
    for k,m in pending.items():
        p=(root/k).resolve()
        check(p.is_relative_to(root.resolve()) and p.is_file(),"Missing local bytes for new upload: "+k)
        check(image_info(p.read_bytes(),m["sha256"])==m,"Pending image mismatch")

def build(report,index,cache,receipt_raw,cdn,prior=None):
    receipt=json.loads(receipt_raw)
    check(report.get("complete") is True and not report.get("errors") and
          report["gameVersion"]==index["gameVersion"] and cache["policy"]==POLICY and
          receipt.get("schema") in ("wand.media.memory-publication-receipt@1","wand.media.story-puzzle-publication-receipt@1") and
          receipt.get("bucket")==BUCKET and receipt.get("canonicalMetadataVerified") is True and
          cdn.get("schema")=="wand.media.cdn-readback@1" and cdn.get("sourceReceiptSha256")==hashlib.sha256(receipt_raw).hexdigest() and
          cdn.get("cdnVerified") is True and not cdn["errors"],"Complete source and CDN verification required")
    objects={key(sha):m["bytes"] for sha,m in index["images"].items()}
    check(objects==receipt["objects"]==cdn["verified"],"Receipt coverage mismatch")
    doc=json.loads(json.dumps(load(prior))) if prior else {"schema":SCHEMA,"bucket":BUCKET,"thumbnailPolicy":POLICY,"images":{},"originals":{},"thumbnails":{}}
    for sha,m in index["images"].items():
        check(info(m)==m and m["sha256"]==sha and doc["images"].setdefault(sha,m)==m,"Conflicting image metadata")
    for a in report["assets"].values():
        rows=a["images"].values() if "images" in a else [a["original"]]
        for row in rows:
            m=info(row)
            check(index["images"].get(m["sha256"])==m,"Source image absent from index")
            if row.get("sourcePixelSha256"):
                sig=signature(row["sourcePixelSha256"],m["width"],m["height"])
                doc["originals"].setdefault(sig,m["sha256"])
    for sha,t in cache["images"].items():
        check(sha in index["images"] and index["images"].get(t["sha256"])==t,"Thumbnail missing from index")
        doc["thumbnails"][sha]=t["sha256"]
    return load(doc)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--kind",choices=["memory","story-puzzle"],required=True)
    p.add_argument("--cdn-report",type=Path,required=True)
    p.add_argument("--ledger",type=Path,required=True)
    a=p.parse_args()
    read=lambda suffix:json.loads((a.root/(a.kind+"-"+suffix+".json")).read_bytes())
    prior=json.loads(a.ledger.read_bytes()) if a.ledger.exists() else None
    doc=build(read("source-report"),read("index-candidate"),read("thumbnail-cache"),
              (a.root/(a.kind+"-publication-receipt.json")).read_bytes(),json.loads(a.cdn_report.read_bytes()),prior)
    write_json(a.ledger,doc)
    print(len(doc["images"]),"verified objects;",len(doc["originals"]),"original pixel witnesses")

if __name__=="__main__":main()
