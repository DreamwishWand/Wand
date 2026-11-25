#!/usr/bin/env python3
"""Offline Shop object resolution using exact typed catalog locations.
Consumes V2 report's target set. Does not generate or publish images.
"""
import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path, PurePosixPath
from resolve_shop_catalog import resolve
from bundle_thumbnails import collect, image_info, DEFAULT_ROOT

PREFIX="{UnityEngine.AddressableAssets.Addressables.RuntimePath}/"
SHA=re.compile(r"[a-f0-9]{64}")
GUID=re.compile(r"[a-f0-9]{32}")

def norm(v):
    return str(v).replace("\\","/").casefold()

def dependency_path(aa, value):
    path=str(value).replace("\\","/")
    if not path.startswith(PREFIX):return None
    rel=PurePosixPath(path[len(PREFIX):])
    if rel.is_absolute() or ".." in rel.parts or ":" in str(rel) or rel.suffix!=".bundle":return None
    dest=(aa/Path(*rel.parts)).resolve()
    return dest if dest.is_relative_to(aa) else None

def exact_readers(container,internal,cls):
    target=norm(internal)
    results={}
    errors=[]
    for key,ptr in container.items():
        if norm(key)!=target:continue
        try:
            obj=ptr.deref() if callable(getattr(ptr,"deref",None)) else ptr
            if getattr(getattr(obj,"type",None),"name",None)!=cls:continue
            file=str(getattr(getattr(obj,"assets_file",None),"name",""))
            pid=getattr(obj,"path_id",None)
            if not file or type(pid) is not int:raise ValueError("ObjectReader identity missing")
            results[(file,pid,cls)]=obj
        except Exception as exc:
            errors.append(type(exc).__name__)
    return results,errors

def file_sha(path):
    with path.open("rb") as f:return hashlib.file_digest(f,"sha256").hexdigest()

def pixels(im):
    im=im.convert("RGBA")
    return (im.width,im.height,hashlib.sha256(im.tobytes()).hexdigest())

def resolve_objects(aa,locs):
    import UnityPy
    tasks=defaultdict(list); missing=set(); unsupported=0
    for g,locations in locs.items():
        for loc in locations:
            paths=set()
            for dep in loc["dependencies"]:
                p=dependency_path(aa,dep)
                if p is not None:paths.add(p)
            if not paths:unsupported+=1
            for p in paths:
                if p.is_file():tasks[p].append((g,loc))
                else:missing.add(p.relative_to(aa).as_posix())
    hits=defaultdict(dict); images={}; diagnostics=[]
    for path,work in sorted(tasks.items(),key=lambda x:str(x[0])):
        rel=path.relative_to(aa).as_posix()
        print("Inspect:",rel,"targets:",len(work),flush=True)
        try:
            env=UnityPy.load(str(path)); digest=file_sha(path)
            containers=[]
            for f in getattr(env,"assets",[]) or []:
                c=getattr(f,"container",None)
                if c is not None:containers.append(c)
            if not containers:containers=[env.container]
            sample=[]; key_count=0; errors=[]; exact_keys=0
            for container in containers:
                keys=[str(k) for k,_ in container.items()]
                key_count+=len(keys);sample.extend(keys[:5])
                for guid,loc in work:
                    exact_keys+=sum(norm(k)==norm(loc["internalId"]) for k in keys)
                    found,err=exact_readers(container,loc["internalId"],loc["class"]);errors.extend(err)
                    for (asset,pid,cls),obj in found.items():
                        # External pointers may not be attributed to this bundle.
                        if not any(f is obj.assets_file for f in getattr(env,"assets",[]) or []):
                            errors.append("unverified_reader_asset_file");continue
                        ident=f"unity:{digest}:{asset}:{pid}:{cls}"
                        hits[guid][ident]={"unityAssetId":ident,"sourceBundleSha256":digest,"bundlePath":rel,
                            "class":cls,"internalId":loc["internalId"],"assetFile":asset,"pathId":pid}
                        if "promoart_assets_all.bundle" in rel and ident not in images:
                            try:images[ident]=pixels(obj.read().image)
                            except Exception as exc:errors.append("pixel_"+type(exc).__name__)
            diagnostics.append({"bundle":rel,"bundleSha256":digest,"containerKeys":key_count,
                "exactKeyHits":exact_keys,"sampleKeys":sample[:12],"sampleInternalIds":[l["internalId"] for _,l in work[:5]],
                "errors":dict((k,errors.count(k)) for k in sorted(set(errors)))})
        except Exception as exc:
            diagnostics.append({"bundle":rel,"errorType":type(exc).__name__,"error":str(exc)[:300]})
    return hits,images,sorted(missing),diagnostics,unsupported

def existing_artwork(root,wanted):
    from PIL import Image
    manifests=sorted(p for p in (root/"manifests").rglob("*") if p.is_file() and p.suffix in (".json",".jsonl"))
    sources=collect(root,manifests)
    idx=root/"bundle-thumbnails-512"/"thumbnail-index.json"
    index=json.loads(idx.read_bytes())
    if index.get("policy")!="lossless-webp-lanczos-512-v1":raise ValueError("Unexpected thumbnail policy")
    wanted=set(wanted);sizes={(w,h) for w,h,_ in wanted}; matches=defaultdict(list)
    for n,(sha,source) in enumerate(sorted(sources.items()),1):
        if (source["width"],source["height"]) not in sizes:continue
        with Image.open(source["path"]) as im:
            p=pixels(im)
        if p not in wanted:continue
        info=image_info(source["path"].read_bytes(),sha)
        pair=index["images"].get(sha)
        if not pair or pair["original"]!=info:continue
        t=pair["thumbnail"];th=t["sha256"]
        if not SHA.fullmatch(th):raise ValueError("Invalid thumbnail SHA")
        actual=image_info((idx.parent/"images"/(th+".webp")).read_bytes(),th)
        if actual!=t or max(t["width"],t["height"])>512 or t["width"]>info["width"] or t["height"]>info["height"]:continue
        matches[p].append({"original":info,"thumbnail":t})
    return matches

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--previous",type=Path,required=True);p.add_argument("--aa",type=Path,required=True)
    p.add_argument("--media-root",type=Path,default=DEFAULT_ROOT);p.add_argument("--out",type=Path,required=True)
    a=p.parse_args();aa=a.aa.resolve();out=a.out.resolve()
    if out.exists() or any((x/".git").exists() for x in out.parents):raise ValueError("Use a new private output outside Git")
    old=json.loads(a.previous.read_bytes());targets=set(old["guidResults"])
    if old.get("schema")!="wand.media.private-shop-artwork-object-report@2" or len(targets)!=old["summary"]["targetGuids"] or not all(GUID.fullmatch(g) for g in targets):raise ValueError("Invalid V2 report")
    locs,pins=resolve(aa,targets)
    if pins!=old["catalogSha256"]:raise ValueError("Catalog version differs from V2")
    hits,images,missing,diag,unsupported=resolve_objects(aa,locs)
    matching=existing_artwork(a.media_root.resolve(),images.values()) if images else {}
    rows={}
    for guid in sorted(targets):
        candidates=list(hits[guid].values())
        for c in candidates:
            pix=images.get(c["unityAssetId"])
            if pix:
                c["decodedRgbaSha256"]=pix[2]
                c["existingArtworkCandidates"]=matching.get(pix,[])
        rows[guid]={"catalogLocations":locs[guid],"candidates":candidates}
    summary={"targetGuids":len(targets),"catalogGuids":sum(bool(v) for v in locs.values()),
        "objectCandidateGuids":sum(bool(v) for v in hits.values()),
        "singleTypedObjectGuids":sum(len(v)==1 for v in hits.values()),
        "existingArtworkCandidateGuids":sum(any(c.get("existingArtworkCandidates") for c in row["candidates"]) for row in rows.values()),
        "missingBundles":missing,"locationsWithoutLocalDependencies":unsupported,
        "publicationAuthorized":False,"networkRequests":0,"newImagesGenerated":0,"renderingVerified":False}
    report={"schema":"wand.media.private-shop-artwork-object-report@3","summary":summary,
        "catalogSha256":pins,"bundleDiagnostics":diag,"guidResults":rows}
    with out.open("x",encoding="utf8") as f:json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps(summary,indent=2));print("Report:",out)

if __name__=="__main__":main()
