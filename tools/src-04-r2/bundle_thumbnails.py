#!/usr/bin/env python3
"""Offline Premium Shop promo-art thumbnails. No network or R2 mutation."""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
from pathlib import Path, PurePosixPath
from PIL import Image, features

MAX_EDGE = 512
POLICY = "lossless-webp-lanczos-512-v1"
SOURCE_BUNDLE = "ui-images-menu-premiumshop-promoart_assets_all.bundle"
SHA = re.compile(r"[0-9a-f]{64}")
DEFAULT_ROOT = Path.home() / "Documents" / "DreamwishWand" / "SRC-04 MEDIA" / "Steam-v1.26.2" / "shared-ui-media"


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, sort_keys=True, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    tmp.replace(path)


def source_rows(path):
    if path.suffix == ".jsonl":
        with path.open(encoding="utf-8-sig") as handle:
            for line in handle:
                if line.strip():
                    yield json.loads(line)
    else:
        doc = json.loads(path.read_text(encoding="utf-8-sig"))
        if isinstance(doc, list):
            yield from doc
        elif isinstance(doc, dict):
            for field in ("assets", "rows", "entries"):
                if isinstance(doc.get(field), list):
                    yield from doc[field]


def collect(root, manifests):
    """Use exact source bundle identity, not guesses from asset display names."""
    out = {}
    for manifest in manifests:
        for row in source_rows(manifest):
            if not isinstance(row, dict):
                continue
            bundle = row.get("bundlePath")
            if not isinstance(bundle, str) or PurePosixPath(bundle.replace("\\","/")).name != SOURCE_BUNDLE:
                continue
            v = row.get("original")
            if not isinstance(v, dict):
                continue
            require(row.get("class") in ("Sprite", "Texture2D"), "Unexpected promo-art asset class")
            sha, rel = v.get("sha256"), v.get("path")
            require(isinstance(sha,str) and SHA.fullmatch(sha), "Invalid original hash")
            require(isinstance(rel,str) and "\\" not in rel and ":" not in rel, "Invalid original path")
            p = PurePosixPath(rel)
            require(not p.is_absolute() and ".." not in p.parts and p.parts[:3] == ("images","ui","original")
                    and p.suffix == ".webp", "Original path outside UI media")
            src = (root / rel).resolve()
            require(src.is_relative_to(root) and src.is_file(), "Original file missing: "+rel)
            require(all(type(v.get(k)) is int and v[k]>0 for k in ("bytes","width","height")), "Invalid original dimensions")
            entry = {"path":src,"sha256":sha,"bytes":v["bytes"],"width":v["width"],"height":v["height"]}
            if sha in out:
                require(all(out[sha][k]==entry[k] for k in ("bytes","width","height")), "Conflicting original metadata")
            else:
                out[sha]=entry
    require(out, "No matching promo-art records found. Supply the actual repaired UI asset JSONL with --manifest.")
    return out


def image_info(data, sha):
    require(digest(data)==sha, "Image SHA-256 mismatch")
    with Image.open(io.BytesIO(data)) as im:
        require(im.format=="WEBP" and getattr(im,"n_frames",1)==1, "Expected static WebP")
        im.load()
        w,h=im.size
    return {"sha256":sha,"bytes":len(data),"width":w,"height":h}


def resize(source):
    raw = source["path"].read_bytes()
    info = image_info(raw,source["sha256"])
    require(all(info[k]==source[k] for k in ("bytes","width","height")), "Original metadata mismatch")
    if max(info["width"],info["height"])<=MAX_EDGE:
        return info, info, raw
    with Image.open(io.BytesIO(raw)) as im:
        rgba=im.convert("RGBA")
        rgba.thumbnail((MAX_EDGE,MAX_EDGE), Image.Resampling.LANCZOS)
        buf=io.BytesIO()
        rgba.save(buf,format="WEBP",lossless=True,quality=100,method=6,exact=True)
        data=buf.getvalue()
    thumb=image_info(data,digest(data))
    require(max(thumb["width"],thumb["height"])<=MAX_EDGE
            and thumb["width"]<=info["width"] and thumb["height"]<=info["height"], "Thumbnail bounds")
    return info,thumb,data


def generate(root, manifests, output, inventory):
    require(features.check("webp"),"Pillow WebP support is required")
    sources=collect(root,manifests)
    output.mkdir(parents=True,exist_ok=True)
    cache_file=output/"thumbnail-index.json"
    previous={}
    if cache_file.exists():
        old=json.loads(cache_file.read_text(encoding="utf-8"))
        if old.get("policy")==POLICY:
            previous=old.get("images",{})
    mapping={}
    pending={}
    reused=0
    unchanged=0
    for idx,(sha,source) in enumerate(sorted(sources.items()),1):
        expected={k:source[k] for k in ("sha256","bytes","width","height")}
        cached=previous.get(sha)
        thumb=None
        if isinstance(cached,dict) and cached.get("original")==expected:
            candidate=cached.get("thumbnail",{})
            csha=candidate.get("sha256")
            if isinstance(csha,str) and SHA.fullmatch(csha):
                path=output/"images"/(csha+".webp")
                if path.is_file():
                    info=image_info(path.read_bytes(),csha)
                    if info==candidate and max(info["width"],info["height"])<=MAX_EDGE:
                        thumb=info
                        unchanged+=1
        if thumb is None:
            original,thumb,raw=resize(source)
            path=output/"images"/(thumb["sha256"]+".webp")
            path.parent.mkdir(parents=True,exist_ok=True)
            if path.exists():
                require(path.read_bytes()==raw,"Thumbnail collision")
            else:
                tmp=path.with_suffix(".tmp")
                tmp.write_bytes(raw)
                tmp.replace(path)
        mapping[sha]={"original":expected,"thumbnail":thumb}
        key="images/"+thumb["sha256"]+".webp"
        if key in inventory:
            require(inventory[key]==thumb["bytes"],"Public inventory byte mismatch")
            reused+=1
        elif key not in pending:
            pending[key]={"key":key,**thumb}
        if idx%25==0 or idx==len(sources):
            print(f"  thumbnails {idx:,}/{len(sources):,}",flush=True)
    result={"schema":"wand.media.bundle-thumbnail-index@1","policy":POLICY,
            "maxLongEdge":MAX_EDGE,"images":mapping}
    write_json(cache_file,result)
    plan={"schema":"wand.media.direct-upload-plan@1","publicationAuthorized":False,
          "networkRequests":0,"contentType":"image/webp","cacheControl":"public, max-age=31536000, immutable",
          "storageClass":"STANDARD","uniqueImages":len({v["thumbnail"]["sha256"] for v in mapping.values()}),
          "newUploads":len(pending),"newBytes":sum(v["bytes"] for v in pending.values()),
          "objects":[{**v,"localSource":v["key"]} for _,v in sorted(pending.items())]}
    write_json(output/"thumbnail-upload-plan.json",plan)
    report={"status":"local_generated_not_uploaded","sourcePromoArtHashes":len(sources),
            "cachedThumbnails":unchanged,"alreadyInVerifiedInventoryReferences":reused,
            "uniqueThumbnails":plan["uniqueImages"],"candidateUploads":plan["newUploads"],
            "candidateBytes":plan["newBytes"],"maxLongEdge":MAX_EDGE,
            "bundleIdMappingVerified":False,"networkRequests":0}
    write_json(output/"thumbnail-report.json",report)
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,default=DEFAULT_ROOT)
    p.add_argument("--manifest",type=Path,action="append",help="Repaired source asset JSON/JSONL; repeat if necessary")
    p.add_argument("--output",type=Path)
    p.add_argument("--inventory",type=Path,help="Verified canonical key-to-size receipt; optional")
    a=p.parse_args()
    root=a.root.resolve()
    require(root.is_dir(),"Shared UI extraction folder missing: "+str(root))
    manifests=a.manifest or sorted(p for p in (root/"manifests").rglob("*") if p.is_file() and p.suffix in (".jsonl",".json"))
    require(manifests,"No UI manifests found; use --manifest")
    inventory=json.loads(a.inventory.read_bytes()) if a.inventory else {}
    require(isinstance(inventory,dict) and all(re.fullmatch(r"images/[a-f0-9]{64}\.webp",k) and type(v) is int and v>0 for k,v in inventory.items()),"Invalid verified inventory")
    output=(a.output or root/"bundle-thumbnails-512").resolve()
    require(output!=root and not output.is_relative_to(root/"images") and not output.is_relative_to(root/"manifests"),"Output overlaps source")
    print(f"Reading {len(manifests)} local manifests. No network requests.",flush=True)
    print(json.dumps(generate(root,manifests,output,inventory),indent=2),flush=True)
    print("Report: "+str(output/"thumbnail-report.json"),flush=True)


if __name__=="__main__":
    main()
